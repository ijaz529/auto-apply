/**
 * Follow-up Cadence — schedule + urgency + contact extraction.
 *
 * Mirrors santifer/career-ops `followup-cadence.mjs`:
 *   - Cadence config (applied 7d / responded 1+3d / interview 1d).
 *   - Urgency: urgent > overdue > waiting > cold.
 *   - Per-entry: days since app, days since last follow-up, follow-up count,
 *     next follow-up date, days until that, suggested action, channel,
 *     and any email contacts found in application notes.
 *   - Metadata counts by urgency for dashboard summary cards.
 */
import { prisma } from "@/lib/db"

// ── Public types ───────────────────────────────────────────────────

export type Urgency = "urgent" | "overdue" | "waiting" | "cold"

export interface FollowUpContact {
  email: string
  name: string | null
}

export interface FollowUpItem {
  applicationId: string
  num: number | null
  date: string // YYYY-MM-DD of applicationDate
  company: string
  role: string
  status: string
  reportPath: string | null
  contacts: FollowUpContact[]

  daysSinceApplication: number
  daysSinceLastFollowup: number | null
  followupCount: number
  urgency: Urgency
  nextFollowupDate: string | null // YYYY-MM-DD
  daysUntilNext: number | null

  // Legacy / consumer-friendly aliases.
  /** Same as nextFollowupDate but as a Date object — what the analytics + dashboard pages expect. */
  dueDate: string | null
  /** Same as daysUntilNext but kept for backward compat. */
  daysUntil: number | null
  isOverdue: boolean
  channel: string
  suggestedAction: string

  /** Original Date for callers that want to format themselves. */
  lastAction: Date | null
}

export interface CadenceConfig {
  applied_first: number
  applied_subsequent: number
  applied_max_followups: number
  responded_initial: number
  responded_subsequent: number
  interview_thankyou: number
}

export interface FollowUpMetadata {
  analysisDate: string
  totalTracked: number
  actionable: number
  urgent: number
  overdue: number
  waiting: number
  cold: number
}

export interface FollowUpResult {
  metadata: FollowUpMetadata
  entries: FollowUpItem[]
  /** Alias of `entries` (excluding cold) — what the dashboard / analytics pages read today. */
  upcoming: FollowUpItem[]
  /** Counts surfaced flat for the existing analytics page header. */
  overdue: number
  urgent: number
  cold: number
  waiting: number
  /** Items due within the next 7 days (0 ≤ daysUntilNext ≤ 7). */
  dueThisWeek: number
  cadenceConfig: CadenceConfig
}

// ── Cadence ─────────────────────────────────────────────────────────

const CADENCE: CadenceConfig = {
  applied_first: 7,
  applied_subsequent: 7,
  applied_max_followups: 2,
  responded_initial: 1,
  responded_subsequent: 3,
  interview_thankyou: 1,
}

const ACTIONABLE_STATUSES = ["applied", "responded", "interview"]

// ── Date helpers ────────────────────────────────────────────────────

function daysBetween(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function todayUTC(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function toIsoDate(d: Date | null): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

// ── Pure helpers (exported for tests) ──────────────────────────────

/**
 * Extract email addresses from a notes blob and try to attach a nearby name
 * (e.g. "Emailed Jane Smith at jane@…"). Coarse — false negatives are fine,
 * the result is just a UI hint.
 */
export function extractContacts(notes: string | null | undefined): FollowUpContact[] {
  if (!notes) return []
  const out: FollowUpContact[] = []
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g
  let match: RegExpExecArray | null
  while ((match = emailRegex.exec(notes))) {
    const email = match[0]
    const before = notes.substring(0, match.index)
    let name: string | null = null
    // Look for "Emailed/emailed/contact[:]/to" + whitespace + a capitalised
    // name (first + optional last), followed by " at " or " @ ". The original
    // santifer regex put no required whitespace after the trigger word, so it
    // never matched anything after an "Emailed " — fixed here.
    const nameMatch = before.match(
      /(?:Emailed|emailed|contacted|contact:|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:at|@)\s*$/
    )
    if (nameMatch) name = nameMatch[1].trim()
    out.push({ email, name })
  }
  return out
}

export function computeUrgency(
  status: string,
  daysSinceApp: number,
  daysSinceLastFollowup: number | null,
  followupCount: number,
  cadence: CadenceConfig = CADENCE
): Urgency {
  if (status === "applied") {
    if (followupCount >= cadence.applied_max_followups) return "cold"
    if (followupCount === 0 && daysSinceApp >= cadence.applied_first) return "overdue"
    if (
      followupCount > 0 &&
      daysSinceLastFollowup !== null &&
      daysSinceLastFollowup >= cadence.applied_subsequent
    )
      return "overdue"
    return "waiting"
  }
  if (status === "responded") {
    if (daysSinceApp < cadence.responded_initial) return "urgent"
    if (daysSinceApp >= cadence.responded_subsequent) return "overdue"
    return "waiting"
  }
  if (status === "interview") {
    if (daysSinceApp >= cadence.interview_thankyou) return "overdue"
    return "waiting"
  }
  return "waiting"
}

export function computeNextFollowupDate(
  status: string,
  appDate: Date,
  lastFollowupDate: Date | null,
  followupCount: number,
  cadence: CadenceConfig = CADENCE
): Date | null {
  if (status === "applied") {
    if (followupCount >= cadence.applied_max_followups) return null
    if (followupCount === 0) return addDays(appDate, cadence.applied_first)
    if (lastFollowupDate) return addDays(lastFollowupDate, cadence.applied_subsequent)
    return addDays(appDate, cadence.applied_first)
  }
  if (status === "responded") {
    if (lastFollowupDate) return addDays(lastFollowupDate, cadence.responded_subsequent)
    return addDays(appDate, cadence.responded_subsequent)
  }
  if (status === "interview") {
    return addDays(appDate, cadence.interview_thankyou)
  }
  return null
}

const SUGGESTED_ACTIONS = {
  applied: [
    "Send first follow-up email checking on application status",
    "Send second follow-up expressing continued interest",
    "Application is cold — move on or try a different contact",
  ],
  responded: "Reply promptly to maintain momentum in the conversation",
  interview: "Send thank-you note referencing specific discussion points",
} as const

export function suggestedActionForStatus(
  status: string,
  followupCount: number
): string {
  if (status === "applied") {
    return SUGGESTED_ACTIONS.applied[Math.min(followupCount, 2)]
  }
  if (status === "responded") return SUGGESTED_ACTIONS.responded
  if (status === "interview") return SUGGESTED_ACTIONS.interview
  return "Review application status"
}

const URGENCY_RANK: Record<Urgency, number> = {
  urgent: 0,
  overdue: 1,
  waiting: 2,
  cold: 3,
}

// ── Main (DB-backed) ───────────────────────────────────────────────

export async function getFollowUpSchedule(
  userId: string,
  options: { overdueOnly?: boolean } = {}
): Promise<FollowUpResult> {
  const applications = await prisma.application.findMany({
    where: { userId, status: { in: ACTIONABLE_STATUSES } },
    include: {
      job: true,
      followUps: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  })

  // Total tracked = total apps for this user (not just actionable). Cheap second query.
  const totalTracked = await prisma.application.count({ where: { userId } })

  const now = todayUTC()
  const items: FollowUpItem[] = []

  for (const app of applications) {
    const appDate = app.appliedAt || app.createdAt
    const daysSinceApp = daysBetween(appDate, now)
    const followupCount = app.followUps.length

    let lastFollowupDate: Date | null = null
    let daysSinceLastFollowup: number | null = null
    if (followupCount > 0) {
      lastFollowupDate = app.followUps[0].createdAt
      daysSinceLastFollowup = daysBetween(lastFollowupDate, now)
    }

    const urgency = computeUrgency(
      app.status,
      daysSinceApp,
      daysSinceLastFollowup,
      followupCount
    )
    const nextDate = computeNextFollowupDate(
      app.status,
      appDate,
      lastFollowupDate,
      followupCount
    )
    const daysUntilNext = nextDate ? daysBetween(now, nextDate) : null
    const isOverdue = daysUntilNext !== null && daysUntilNext < 0
    const contacts = extractContacts(app.notes)
    const channel = app.followUps[0]?.channel ?? "email"

    items.push({
      applicationId: app.id,
      num: null,
      date: appDate.toISOString().slice(0, 10),
      company: app.job.company,
      role: app.job.role,
      status: app.status,
      reportPath: null,
      contacts,
      daysSinceApplication: daysSinceApp,
      daysSinceLastFollowup,
      followupCount,
      urgency,
      nextFollowupDate: toIsoDate(nextDate),
      daysUntilNext,
      // Aliases the existing analytics + dashboard pages read.
      dueDate: toIsoDate(nextDate),
      daysUntil: daysUntilNext,
      isOverdue,
      channel,
      suggestedAction: suggestedActionForStatus(app.status, followupCount),
      lastAction: lastFollowupDate || appDate,
    })
  }

  // Sort by urgency priority, then by daysUntilNext (overdue first → soonest).
  items.sort((a, b) => {
    const ar = URGENCY_RANK[a.urgency]
    const br = URGENCY_RANK[b.urgency]
    if (ar !== br) return ar - br
    const ad = a.daysUntilNext ?? Number.MAX_SAFE_INTEGER
    const bd = b.daysUntilNext ?? Number.MAX_SAFE_INTEGER
    return ad - bd
  })

  const counts: Record<Urgency, number> = {
    urgent: 0,
    overdue: 0,
    waiting: 0,
    cold: 0,
  }
  for (const it of items) counts[it.urgency]++

  const dueThisWeek = items.filter(
    (i) => i.daysUntilNext !== null && i.daysUntilNext >= 0 && i.daysUntilNext <= 7
  ).length

  // Default visible list: everything that isn't cold. Optional overdueOnly
  // narrows to actionable urgent + overdue items only.
  const upcoming = options.overdueOnly
    ? items.filter((i) => i.urgency === "urgent" || i.urgency === "overdue")
    : items.filter((i) => i.urgency !== "cold")

  return {
    metadata: {
      analysisDate: toIsoDate(now)!,
      totalTracked,
      actionable: items.length,
      urgent: counts.urgent,
      overdue: counts.overdue,
      waiting: counts.waiting,
      cold: counts.cold,
    },
    entries: items,
    upcoming,
    overdue: counts.overdue,
    urgent: counts.urgent,
    cold: counts.cold,
    waiting: counts.waiting,
    dueThisWeek,
    cadenceConfig: CADENCE,
  }
}
