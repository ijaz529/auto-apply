import { describe, expect, it } from "vitest"
import { buildStrategyUserContent } from "./strategy"

const baseCtx = {
  company: "Acme",
  role: "Senior PM",
  location: null,
  jdText: null,
  evaluationMarkdown: null,
  archetype: null,
  score: null,
  candidatePreferences: null,
  targetRoles: null,
}

describe("buildStrategyUserContent", () => {
  it("always includes the job header (company, role, location)", () => {
    const out = buildStrategyUserContent({
      ...baseCtx,
      location: "Berlin, Germany",
    })
    expect(out).toContain("**Company:** Acme")
    expect(out).toContain("**Role:** Senior PM")
    expect(out).toContain("**Location:** Berlin, Germany")
  })

  it("falls back to 'Not specified' for missing location", () => {
    const out = buildStrategyUserContent(baseCtx)
    expect(out).toContain("**Location:** Not specified")
  })

  it("includes score + archetype when present", () => {
    const out = buildStrategyUserContent({
      ...baseCtx,
      score: 4.2,
      archetype: "Product Manager",
    })
    expect(out).toContain("**Score:** 4.2/5")
    expect(out).toContain("**Archetype:** Product Manager")
  })

  it("omits score line when both score and archetype are absent", () => {
    expect(buildStrategyUserContent(baseCtx)).not.toContain("**Score:**")
  })

  it("includes evaluation markdown under its heading when present", () => {
    const out = buildStrategyUserContent({
      ...baseCtx,
      evaluationMarkdown: "# Evaluation\n\nSome details.",
    })
    expect(out).toContain("## Evaluation Report (existing)")
    expect(out).toContain("Some details.")
  })

  it("renders target roles as a bullet list", () => {
    const out = buildStrategyUserContent({
      ...baseCtx,
      targetRoles: ["Senior PM", "Tech Lead"],
    })
    expect(out).toContain("## Candidate Target Roles")
    expect(out).toContain("- Senior PM")
    expect(out).toContain("- Tech Lead")
  })

  it("omits target roles section when empty / missing", () => {
    expect(
      buildStrategyUserContent({ ...baseCtx, targetRoles: [] })
    ).not.toContain("Candidate Target Roles")
  })

  it("only includes preferences when non-empty", () => {
    expect(
      buildStrategyUserContent({ ...baseCtx, candidatePreferences: "  " })
    ).not.toContain("Candidate Preferences")
    expect(
      buildStrategyUserContent({
        ...baseCtx,
        candidatePreferences: "Remote only",
      })
    ).toContain("Remote only")
  })

  it("orders sections: job, score, evaluation, jd, target roles, preferences", () => {
    const out = buildStrategyUserContent({
      company: "Acme",
      role: "PM",
      location: "Berlin",
      jdText: "JD body",
      evaluationMarkdown: "Eval body",
      archetype: "Product Manager",
      score: 4,
      candidatePreferences: "Remote",
      targetRoles: ["Senior PM"],
    })
    const ix = (s: string) => out.indexOf(s)
    expect(ix("## Job")).toBeLessThan(ix("**Score:**"))
    expect(ix("**Score:**")).toBeLessThan(ix("## Evaluation Report"))
    expect(ix("## Evaluation Report")).toBeLessThan(ix("## Job Description"))
    expect(ix("## Job Description")).toBeLessThan(ix("## Candidate Target Roles"))
    expect(ix("## Candidate Target Roles")).toBeLessThan(
      ix("## Candidate Preferences")
    )
  })
})
