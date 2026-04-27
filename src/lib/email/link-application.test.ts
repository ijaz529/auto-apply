import { describe, expect, it } from "vitest"
import {
  classificationToStatus,
  findBestApplicationMatch,
  shouldUpgradeStatus,
} from "./link-application"

const apps = [
  { id: "a-stripe", jobId: "j1", company: "Stripe" },
  { id: "a-monzo", jobId: "j2", company: "Monzo" },
  { id: "a-gh-eu", jobId: "j3", company: "GitHub" },
  { id: "a-pj", jobId: "j4", company: "PJ" },
]

describe("findBestApplicationMatch", () => {
  it("matches when company name appears in subject", () => {
    const m = findBestApplicationMatch(
      "Your Stripe interview",
      "noreply@example.com",
      apps
    )
    expect(m?.id).toBe("a-stripe")
  })

  it("matches when company appears in from-address", () => {
    const m = findBestApplicationMatch(
      "Re: your application",
      "Recruiter <recruiter@stripe.com>",
      apps
    )
    expect(m?.id).toBe("a-stripe")
  })

  it("returns null when nothing matches", () => {
    expect(
      findBestApplicationMatch("Promo deal", "marketing@unrelated.io", apps)
    ).toBeNull()
  })

  it("prefers the longer company name on tie", () => {
    const more = [...apps, { id: "a-stripey", jobId: "jX", company: "Stripey Inc" }]
    const m = findBestApplicationMatch(
      "Update from Stripey Inc team",
      "team@example.com",
      more
    )
    expect(m?.id).toBe("a-stripey")
  })

  it("ignores company names shorter than 3 chars", () => {
    // "PJ" is 2 chars and is in the seed; "PJ Bagel" subject would otherwise
    // false-match — we skip names that short.
    expect(
      findBestApplicationMatch("PJ Bagel sale", "newsletter@bagels.com", apps)
    ).toBeNull()
  })

  it("returns null when there are no candidates", () => {
    expect(findBestApplicationMatch("Stripe call", "x@y.com", [])).toBeNull()
  })
})

describe("classificationToStatus", () => {
  it("maps the four meaningful types to status strings", () => {
    expect(classificationToStatus("offer")).toBe("offer")
    expect(classificationToStatus("interview")).toBe("interview")
    expect(classificationToStatus("rejection")).toBe("rejected")
    expect(classificationToStatus("confirmation")).toBe("applied")
  })

  it("returns null for unknown so callers don't overwrite status", () => {
    expect(classificationToStatus("unknown")).toBeNull()
  })
})

describe("shouldUpgradeStatus", () => {
  it("upgrades from earlier statuses to later ones", () => {
    expect(shouldUpgradeStatus("pending", "applied")).toBe(true)
    expect(shouldUpgradeStatus("applied", "interview")).toBe(true)
    expect(shouldUpgradeStatus("interview", "offer")).toBe(true)
    expect(shouldUpgradeStatus("evaluated", "rejected")).toBe(true)
  })

  it("does not downgrade", () => {
    expect(shouldUpgradeStatus("interview", "applied")).toBe(false)
    expect(shouldUpgradeStatus("offer", "interview")).toBe(false)
    expect(shouldUpgradeStatus("rejected", "applied")).toBe(false)
  })

  it("treats equal-rank moves as not-an-upgrade", () => {
    // applied and responded share rank 2 — neither replaces the other.
    expect(shouldUpgradeStatus("applied", "responded")).toBe(false)
  })

  it("handles unknown statuses by treating them as rank 0", () => {
    expect(shouldUpgradeStatus("totally-made-up", "applied")).toBe(true)
    expect(shouldUpgradeStatus("applied", "totally-made-up")).toBe(false)
  })
})
