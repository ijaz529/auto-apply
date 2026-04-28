import { describe, expect, it } from "vitest"
import { buildComparison, type ComparisonJob } from "./comparison"

const job = (
  id: string,
  overrides: Partial<ComparisonJob> = {},
  evalOverrides: Partial<NonNullable<ComparisonJob["evaluation"]>> = {}
): ComparisonJob => ({
  id,
  company: `Company ${id}`,
  role: `Role ${id}`,
  url: null,
  location: "Berlin, Germany",
  evaluation: {
    score: 4.0,
    archetype: "Product Manager",
    legitimacy: "High Confidence",
    scoreBreakdown: {
      cvMatch: 4,
      northStar: 4,
      comp: 4,
      cultural: 4,
      redFlags: 4,
    },
    gaps: [],
    ...evalOverrides,
  },
  ...overrides,
})

describe("buildComparison", () => {
  it("places jobs in input order in the result", () => {
    const result = buildComparison([job("a"), job("b")])
    expect(result.jobs.map((j) => j.id)).toEqual(["a", "b"])
  })

  it("score row picks the higher score as max-index", () => {
    const result = buildComparison([
      job("a", {}, { score: 4.2 }),
      job("b", {}, { score: 3.5 }),
    ])
    const score = result.headline.find((r) => r.key === "score")!
    expect(score.values).toEqual([4.2, 3.5])
    expect(score.maxIndices).toEqual([0])
  })

  it("ties highlight all maxima but not when ALL jobs tie", () => {
    const allEq = buildComparison([
      job("a", {}, { score: 4 }),
      job("b", {}, { score: 4 }),
    ])
    expect(
      allEq.headline.find((r) => r.key === "score")!.maxIndices
    ).toEqual([])

    const partialTie = buildComparison([
      job("a", {}, { score: 4 }),
      job("b", {}, { score: 4 }),
      job("c", {}, { score: 3 }),
    ])
    expect(
      partialTie.headline.find((r) => r.key === "score")!.maxIndices
    ).toEqual([0, 1])
  })

  it("each dimension row reads from scoreBreakdown", () => {
    const result = buildComparison([
      job("a", {}, {
        scoreBreakdown: { cvMatch: 5, northStar: 3, comp: 4, cultural: 4, redFlags: 5 },
      }),
      job("b", {}, {
        scoreBreakdown: { cvMatch: 3, northStar: 5, comp: 3, cultural: 5, redFlags: 3 },
      }),
    ])
    const cvMatch = result.dimensions.find((r) => r.key === "cvMatch")!
    expect(cvMatch.values).toEqual([5, 3])
    expect(cvMatch.maxIndices).toEqual([0])
    const ns = result.dimensions.find((r) => r.key === "northStar")!
    expect(ns.values).toEqual([3, 5])
    expect(ns.maxIndices).toEqual([1])
  })

  it("returns nulls when scoreBreakdown is missing", () => {
    const result = buildComparison([
      job("a", {}, { scoreBreakdown: null }),
      job("b", {}),
    ])
    const cvMatch = result.dimensions.find((r) => r.key === "cvMatch")!
    expect(cvMatch.values).toEqual([null, 4])
    // Only one numeric value → no winner highlight (not enough comparison data).
    expect(cvMatch.maxIndices).toEqual([])
  })

  it("summarises hard blockers per job", () => {
    const result = buildComparison([
      job("a", {}, {
        gaps: [
          { description: "Need 5 yrs Java", severity: "hard_blocker" },
          { description: "US residency required", severity: "hard_blocker" },
        ],
      }),
      job("b", {}, {
        gaps: [
          { description: "Nice to have AWS", severity: "nice_to_have" },
        ],
      }),
    ])
    expect(result.blockerSummary.values[0]).toContain("Need 5 yrs Java")
    expect(result.blockerSummary.values[0]).toContain("US residency required")
    expect(result.blockerSummary.values[1]).toBe("None")
  })

  it("ranks jobs by score, stable on ties", () => {
    const result = buildComparison([
      job("a", {}, { score: 3.5 }),
      job("b", {}, { score: 4.5 }),
      job("c", {}, { score: 3.5 }),
    ])
    expect(result.ranking).toEqual([
      { jobId: "b", rank: 1, score: 4.5 },
      { jobId: "a", rank: 2, score: 3.5 },
      { jobId: "c", rank: 3, score: 3.5 },
    ])
  })

  it("treats jobs with no evaluation as score 0 in ranking", () => {
    const result = buildComparison([
      job("a", {}, { score: 4 }),
      { ...job("b"), evaluation: null },
    ])
    expect(result.ranking[1]).toEqual({ jobId: "b", rank: 2, score: 0 })
  })
})
