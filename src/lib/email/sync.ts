/**
 * Gmail sync orchestration: fetch recent messages, classify them, link to
 * applications, persist, optionally upgrade Application status.
 *
 * Idempotent: each Gmail message is keyed by `gmailMessageId` in the Email
 * table — re-running sync skips already-stored messages. Status upgrades use
 * `shouldUpgradeStatus` so we never downgrade an Application backwards.
 */
import { prisma } from "@/lib/db"
import { classifyEmail } from "./gmail"
import {
  getValidGoogleAccessToken,
  isGoogleTokenError,
} from "./google-tokens"
import {
  getHeader,
  getMessageMetadata,
  listMessageIds,
} from "./gmail-client"
import {
  classificationToStatus,
  findBestApplicationMatch,
  shouldUpgradeStatus,
  type ApplicationCandidate,
} from "./link-application"

const DEFAULT_QUERY = "newer_than:7d -category:promotions -category:social"
const DEFAULT_MAX_RESULTS = 50

export interface SyncResult {
  ok: true
  fetched: number
  newRecords: number
  duplicates: number
  classified: Record<
    "confirmation" | "interview" | "rejection" | "offer" | "unknown",
    number
  >
  linked: number
  applicationsUpgraded: number
  errors: Array<{ messageId: string; error: string }>
}

export interface SyncFailure {
  ok: false
  reason:
    | "no_account"
    | "no_refresh_token"
    | "config_missing"
    | "refresh_failed"
    | "list_failed"
  message: string
}

export async function syncGmailForUser(
  userId: string,
  options: { query?: string; maxResults?: number } = {}
): Promise<SyncResult | SyncFailure> {
  const tokenOrErr = await getValidGoogleAccessToken(userId)
  if (isGoogleTokenError(tokenOrErr)) {
    if (tokenOrErr.kind === "no_account") {
      return {
        ok: false,
        reason: "no_account",
        message:
          "No Google account linked. Sign in with Google to enable Gmail sync.",
      }
    }
    if (tokenOrErr.kind === "no_refresh_token") {
      return {
        ok: false,
        reason: "no_refresh_token",
        message:
          "Your Google account is missing a refresh token. Sign out and sign in with Google again to grant ongoing access.",
      }
    }
    if (tokenOrErr.kind === "config_missing") {
      return { ok: false, reason: "config_missing", message: tokenOrErr.message }
    }
    return { ok: false, reason: "refresh_failed", message: tokenOrErr.message }
  }
  const { accessToken } = tokenOrErr

  const query = options.query ?? DEFAULT_QUERY
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS

  let listed: Array<{ id: string; threadId: string }>
  try {
    listed = await listMessageIds(accessToken, query, maxResults)
  } catch (err) {
    return {
      ok: false,
      reason: "list_failed",
      message: err instanceof Error ? err.message : String(err),
    }
  }

  // Skip messages we've already ingested (the unique key is gmailMessageId).
  const existing = await prisma.email.findMany({
    where: {
      userId,
      gmailMessageId: { in: listed.map((m) => m.id) },
    },
    select: { gmailMessageId: true },
  })
  const seen = new Set(
    existing.map((e) => e.gmailMessageId).filter(Boolean) as string[]
  )

  const fresh = listed.filter((m) => !seen.has(m.id))

  // Pre-load the user's applications once for the linking pass.
  const apps = await prisma.application.findMany({
    where: { userId },
    select: { id: true, jobId: true, status: true, job: { select: { company: true } } },
  })
  const candidates: ApplicationCandidate[] = apps.map((a) => ({
    id: a.id,
    jobId: a.jobId,
    company: a.job.company,
  }))
  const appById = new Map(apps.map((a) => [a.id, a]))

  const result: SyncResult = {
    ok: true,
    fetched: listed.length,
    newRecords: 0,
    duplicates: listed.length - fresh.length,
    classified: { confirmation: 0, interview: 0, rejection: 0, offer: 0, unknown: 0 },
    linked: 0,
    applicationsUpgraded: 0,
    errors: [],
  }

  for (const m of fresh) {
    try {
      const meta = await getMessageMetadata(accessToken, m.id)
      const subject = getHeader(meta, "Subject")
      const from = getHeader(meta, "From")
      const snippet = meta.snippet ?? ""
      const receivedMs = Number(meta.internalDate) || Date.now()

      const cls = classifyEmail(subject, from, snippet)
      result.classified[cls.type]++

      const matched = findBestApplicationMatch(subject, from, candidates)
      if (matched) result.linked++

      await prisma.email.create({
        data: {
          userId,
          applicationId: matched?.id ?? null,
          gmailMessageId: m.id,
          subject: subject.slice(0, 500),
          fromAddress: from.slice(0, 500),
          bodyPreview: snippet.slice(0, 1000),
          parsedStatus: cls.type,
          receivedAt: new Date(receivedMs),
        },
      })
      result.newRecords++

      // Upgrade application status when classification implies progress and the
      // current status is below the new one.
      if (matched) {
        const nextStatus = classificationToStatus(cls.type)
        const current = appById.get(matched.id)
        if (
          nextStatus &&
          current &&
          shouldUpgradeStatus(current.status, nextStatus)
        ) {
          await prisma.application.update({
            where: { id: matched.id },
            data: { status: nextStatus },
          })
          // Reflect upgrade in our local cache so subsequent emails in this
          // sync don't double-count.
          current.status = nextStatus
          result.applicationsUpgraded++
        }
      }
    } catch (err) {
      result.errors.push({
        messageId: m.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}
