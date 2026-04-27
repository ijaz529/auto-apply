import { describe, expect, it } from "vitest"
import { buildUserContent, normalizeTargetRoles } from "./evaluate"

describe("normalizeTargetRoles", () => {
  it("returns [] for null/undefined", () => {
    expect(normalizeTargetRoles(null)).toEqual([])
    expect(normalizeTargetRoles(undefined)).toEqual([])
  })

  it("trims and filters arrays of strings", () => {
    expect(
      normalizeTargetRoles(["  Senior PM  ", "", "  ", "Tech Lead"])
    ).toEqual(["Senior PM", "Tech Lead"])
  })

  it("splits a comma string into an array", () => {
    expect(normalizeTargetRoles("Senior PM, Tech Lead, Staff Engineer")).toEqual([
      "Senior PM",
      "Tech Lead",
      "Staff Engineer",
    ])
  })

  it("drops non-string array entries silently", () => {
    expect(
      normalizeTargetRoles([
        "Senior PM",
        42 as unknown as string,
        null as unknown as string,
        "Tech Lead",
      ])
    ).toEqual(["Senior PM", "Tech Lead"])
  })

  it("returns [] for unsupported shapes", () => {
    expect(normalizeTargetRoles({ role: "PM" })).toEqual([])
    expect(normalizeTargetRoles(42)).toEqual([])
    expect(normalizeTargetRoles(true)).toEqual([])
  })
})

describe("buildUserContent", () => {
  const jd = "JD body here"
  const cv = "CV markdown"

  it("includes JD and CV with the right section headers", () => {
    const out = buildUserContent(jd, cv)
    expect(out).toContain("## Job Description")
    expect(out).toContain(jd)
    expect(out).toContain("## Candidate CV")
    expect(out).toContain(cv)
  })

  it("omits target-roles section when none provided", () => {
    expect(buildUserContent(jd, cv)).not.toContain("Candidate Target Roles")
    expect(buildUserContent(jd, cv, undefined, null)).not.toContain(
      "Candidate Target Roles"
    )
    expect(buildUserContent(jd, cv, undefined, [])).not.toContain(
      "Candidate Target Roles"
    )
  })

  it("includes target-roles section as a bullet list when provided", () => {
    const out = buildUserContent(jd, cv, undefined, [
      "Senior PM",
      "Tech Lead",
    ])
    expect(out).toContain("## Candidate Target Roles")
    expect(out).toContain("- Senior PM")
    expect(out).toContain("- Tech Lead")
  })

  it("includes preferences section when non-empty", () => {
    const out = buildUserContent(jd, cv, "Remote only, EU timezone")
    expect(out).toContain("## Candidate Preferences")
    expect(out).toContain("Remote only, EU timezone")
  })

  it("omits preferences when empty/whitespace-only", () => {
    expect(buildUserContent(jd, cv, "")).not.toContain("Candidate Preferences")
    expect(buildUserContent(jd, cv, "   ")).not.toContain(
      "Candidate Preferences"
    )
  })

  it("orders sections deterministically: JD, CV, target roles, preferences", () => {
    const out = buildUserContent(jd, cv, "Pref body", ["Role A"])
    const ix = (s: string) => out.indexOf(s)
    expect(ix("## Job Description")).toBeLessThan(ix("## Candidate CV"))
    expect(ix("## Candidate CV")).toBeLessThan(ix("## Candidate Target Roles"))
    expect(ix("## Candidate Target Roles")).toBeLessThan(
      ix("## Candidate Preferences")
    )
  })
})
