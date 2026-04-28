import { describe, expect, it } from "vitest"
import {
  computeNextFollowupDate,
  computeUrgency,
  extractContacts,
  suggestedActionForStatus,
} from "./followup"

describe("extractContacts", () => {
  it("returns [] for empty / nullish input", () => {
    expect(extractContacts("")).toEqual([])
    expect(extractContacts(null)).toEqual([])
    expect(extractContacts(undefined)).toEqual([])
  })

  it("pulls plain email addresses out", () => {
    expect(extractContacts("Reach me at jane@example.com")).toEqual([
      { email: "jane@example.com", name: null },
    ])
  })

  it("attaches a nearby name when phrasing matches", () => {
    expect(
      extractContacts("Emailed Jane Smith at jane@example.com")
    ).toEqual([{ email: "jane@example.com", name: "Jane Smith" }])
  })

  it("collects multiple emails from one notes blob", () => {
    const out = extractContacts(
      "Emailed Bob bob@x.com on Tuesday; cc'd carol@y.org"
    )
    expect(out.map((c) => c.email)).toEqual(["bob@x.com", "carol@y.org"])
  })
})

describe("computeUrgency", () => {
  it("applied: not overdue while inside the cadence window", () => {
    expect(computeUrgency("applied", 5, null, 0)).toBe("waiting")
  })

  it("applied: overdue once past 7d with zero follow-ups", () => {
    expect(computeUrgency("applied", 8, null, 0)).toBe("overdue")
  })

  it("applied: cold after max follow-ups reached", () => {
    expect(computeUrgency("applied", 30, 0, 2)).toBe("cold")
  })

  it("applied: overdue when last follow-up is also stale", () => {
    expect(computeUrgency("applied", 14, 8, 1)).toBe("overdue")
  })

  it("responded: urgent on day 0 (need fast reply)", () => {
    expect(computeUrgency("responded", 0, null, 0)).toBe("urgent")
  })

  it("responded: overdue past 3d", () => {
    expect(computeUrgency("responded", 4, null, 0)).toBe("overdue")
  })

  it("interview: thank-you overdue past 1d", () => {
    expect(computeUrgency("interview", 0, null, 0)).toBe("waiting")
    expect(computeUrgency("interview", 2, null, 0)).toBe("overdue")
  })

  it("unknown status falls back to 'waiting'", () => {
    expect(computeUrgency("offer", 100, null, 0)).toBe("waiting")
  })
})

describe("computeNextFollowupDate", () => {
  const appDate = new Date("2026-04-01T00:00:00Z")

  it("applied with no follow-ups → first follow-up at appDate + applied_first (7d)", () => {
    const out = computeNextFollowupDate("applied", appDate, null, 0)
    expect(out?.toISOString().slice(0, 10)).toBe("2026-04-08")
  })

  it("applied at max → returns null (cold)", () => {
    expect(computeNextFollowupDate("applied", appDate, null, 2)).toBeNull()
  })

  it("applied with one prior follow-up → +applied_subsequent from last follow-up", () => {
    const last = new Date("2026-04-10T00:00:00Z")
    const out = computeNextFollowupDate("applied", appDate, last, 1)
    expect(out?.toISOString().slice(0, 10)).toBe("2026-04-17")
  })

  it("responded with no prior follow-up → +responded_subsequent (3d) from appDate", () => {
    const out = computeNextFollowupDate("responded", appDate, null, 0)
    expect(out?.toISOString().slice(0, 10)).toBe("2026-04-04")
  })

  it("interview → +interview_thankyou (1d) from appDate", () => {
    const out = computeNextFollowupDate("interview", appDate, null, 0)
    expect(out?.toISOString().slice(0, 10)).toBe("2026-04-02")
  })
})

describe("suggestedActionForStatus", () => {
  it("returns escalating prompts for applied across follow-up counts", () => {
    expect(suggestedActionForStatus("applied", 0)).toMatch(/first/i)
    expect(suggestedActionForStatus("applied", 1)).toMatch(/second/i)
    expect(suggestedActionForStatus("applied", 2)).toMatch(/cold/i)
  })

  it("returns the responded / interview suggestion strings", () => {
    expect(suggestedActionForStatus("responded", 0)).toMatch(/momentum/i)
    expect(suggestedActionForStatus("interview", 0)).toMatch(/thank-you/i)
  })

  it("falls through with a generic 'review' string for unknown statuses", () => {
    expect(suggestedActionForStatus("offer", 0)).toMatch(/review/i)
  })
})
