import { beforeEach, describe, expect, it, vi } from "vitest"

// Hoisted mocks for everything sync.ts touches at module scope.
vi.mock("@/lib/db", () => ({
  prisma: {
    email: { findMany: vi.fn(), create: vi.fn() },
    application: { findMany: vi.fn(), update: vi.fn() },
  },
}))

vi.mock("./google-tokens", () => ({
  getValidGoogleAccessToken: vi.fn(),
  isGoogleTokenError: (v: unknown) =>
    !!v && typeof v === "object" && "kind" in (v as object),
}))

vi.mock("./gmail-client", () => ({
  getHeader: vi.fn(
    (meta: { payload: { headers: Array<{ name: string; value: string }> } }, name: string) => {
      const target = name.toLowerCase()
      const found = meta.payload.headers.find(
        (h) => h.name.toLowerCase() === target
      )
      return found?.value ?? ""
    }
  ),
  listMessageIds: vi.fn(),
  getMessageMetadata: vi.fn(),
}))

import { syncGmailForUser } from "./sync"
import { prisma } from "@/lib/db"
import { getValidGoogleAccessToken } from "./google-tokens"
import { listMessageIds, getMessageMetadata } from "./gmail-client"

const mockToken = vi.mocked(getValidGoogleAccessToken)
const mockListIds = vi.mocked(listMessageIds)
const mockGetMeta = vi.mocked(getMessageMetadata)
const mockEmailFind = vi.mocked(prisma.email.findMany)
const mockEmailCreate = vi.mocked(prisma.email.create)
const mockAppFind = vi.mocked(prisma.application.findMany)
const mockAppUpdate = vi.mocked(prisma.application.update)

function fakeMeta(overrides: {
  id: string
  subject: string
  from: string
  snippet?: string
  internalDate?: string
}) {
  return {
    id: overrides.id,
    threadId: "t",
    snippet: overrides.snippet ?? "",
    internalDate: overrides.internalDate ?? "1700000000000",
    payload: {
      headers: [
        { name: "Subject", value: overrides.subject },
        { name: "From", value: overrides.from },
      ],
    },
  }
}

describe("syncGmailForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEmailCreate.mockResolvedValue(undefined as never)
    mockAppUpdate.mockResolvedValue(undefined as never)
  })

  it("returns no_account when the user has no Google account", async () => {
    mockToken.mockResolvedValue({ kind: "no_account" } as never)
    const r = await syncGmailForUser("u1")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toBe("no_account")
    expect(mockListIds).not.toHaveBeenCalled()
  })

  it("returns no_refresh_token when scope was never granted", async () => {
    mockToken.mockResolvedValue({ kind: "no_refresh_token" } as never)
    const r = await syncGmailForUser("u1")
    expect(r.ok === false && r.reason).toBe("no_refresh_token")
  })

  it("returns config_missing when GOOGLE_* env vars are absent", async () => {
    mockToken.mockResolvedValue({
      kind: "config_missing",
      message: "GOOGLE_CLIENT_ID not set",
    } as never)
    const r = await syncGmailForUser("u1")
    expect(r.ok === false && r.reason).toBe("config_missing")
  })

  it("returns list_failed when the Gmail messages.list call throws", async () => {
    mockToken.mockResolvedValue({ accessToken: "tok", expiresAt: 9 } as never)
    mockListIds.mockRejectedValue(new Error("Gmail API 403: insufficient scope"))
    const r = await syncGmailForUser("u1")
    expect(r.ok === false && r.reason).toBe("list_failed")
  })

  it("happy path: fetches, classifies, links, and upgrades application status", async () => {
    mockToken.mockResolvedValue({ accessToken: "tok", expiresAt: 9 } as never)
    mockListIds.mockResolvedValue([
      { id: "msg1", threadId: "t1" },
      { id: "msg2", threadId: "t2" },
      { id: "msg3", threadId: "t3" }, // already-stored, will be skipped
    ])
    // msg3 already in DB → only msg1, msg2 are fresh.
    mockEmailFind.mockResolvedValue([{ gmailMessageId: "msg3" }] as never)
    // One application: Stripe in "applied" status, classified email will upgrade to interview.
    mockAppFind.mockResolvedValue([
      {
        id: "app1",
        jobId: "j1",
        status: "applied",
        job: { company: "Stripe" },
      },
    ] as never)

    mockGetMeta.mockImplementation(async (_t, id) => {
      if (id === "msg1") {
        return fakeMeta({
          id: "msg1",
          subject: "Stripe interview — schedule a call",
          from: "Recruiter <recruiter@stripe.com>",
          snippet: "Let's book a time. Calendly attached.",
        }) as never
      }
      return fakeMeta({
        id: "msg2",
        subject: "Newsletter you'll never read",
        from: "marketing@unrelated.io",
        snippet: "Promo code 50OFF",
      }) as never
    })

    const r = await syncGmailForUser("u1")
    if (r.ok !== true) throw new Error("expected ok=true")

    expect(r.fetched).toBe(3)
    expect(r.duplicates).toBe(1) // msg3 already stored
    expect(r.newRecords).toBe(2) // msg1, msg2
    expect(r.classified.interview).toBe(1) // msg1
    expect(r.linked).toBe(1) // msg1 matches Stripe
    expect(r.applicationsUpgraded).toBe(1) // applied → interview

    // Verify a real upgrade write went out for the Stripe application.
    expect(mockAppUpdate).toHaveBeenCalledWith({
      where: { id: "app1" },
      data: { status: "interview" },
    })
    // Email rows persisted for the two fresh messages.
    expect(mockEmailCreate).toHaveBeenCalledTimes(2)
  })

  it("does not downgrade application status (interview email arriving for already-interviewing app is no-op on status)", async () => {
    mockToken.mockResolvedValue({ accessToken: "tok", expiresAt: 9 } as never)
    mockListIds.mockResolvedValue([{ id: "msg1", threadId: "t1" }])
    mockEmailFind.mockResolvedValue([] as never)
    mockAppFind.mockResolvedValue([
      {
        id: "app1",
        jobId: "j1",
        status: "interview", // already at interview, classification implies "applied"
        job: { company: "Stripe" },
      },
    ] as never)
    mockGetMeta.mockResolvedValue(
      fakeMeta({
        id: "msg1",
        subject: "Application received — Stripe",
        from: "no-reply@stripe.com",
        snippet: "Thank you for applying",
      }) as never
    )

    const r = await syncGmailForUser("u1")
    if (r.ok !== true) throw new Error("expected ok=true")

    expect(r.linked).toBe(1)
    // 'applied' is a downgrade from 'interview' — should NOT update status.
    expect(r.applicationsUpgraded).toBe(0)
    expect(mockAppUpdate).not.toHaveBeenCalled()
  })
})
