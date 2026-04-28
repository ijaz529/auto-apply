import { describe, expect, it } from "vitest"
import {
  computeGlobalScore,
  mapPreferredModel,
  type Gap,
  type ScoreBreakdown,
} from "./scoring"

const breakdown = (overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown => ({
  cvMatch: 3,
  northStar: 3,
  comp: 3,
  cultural: 3,
  redFlags: 3,
  ...overrides,
})

const blocker: Gap = {
  description: "Hard blocker requirement",
  severity: "hard_blocker",
  mitigation: "—",
}

describe("mapPreferredModel", () => {
  it("maps opus → claude-opus-4-7", () => {
    expect(mapPreferredModel("opus")).toBe("claude-opus-4-7")
  })

  it("maps sonnet → claude-sonnet-4-6", () => {
    expect(mapPreferredModel("sonnet")).toBe("claude-sonnet-4-6")
  })

  it("defaults to sonnet for unknown / undefined / null", () => {
    expect(mapPreferredModel(undefined)).toBe("claude-sonnet-4-6")
    expect(mapPreferredModel(null)).toBe("claude-sonnet-4-6")
    expect(mapPreferredModel("")).toBe("claude-sonnet-4-6")
    expect(mapPreferredModel("haiku")).toBe("claude-sonnet-4-6")
  })
})

describe("computeGlobalScore", () => {
  it("returns 5.0 when every dimension is 5", () => {
    expect(computeGlobalScore(breakdown({
      cvMatch: 5, northStar: 5, comp: 5, cultural: 5, redFlags: 5,
    }))).toBe(5)
  })

  it("returns 1.0 when every dimension is 1", () => {
    expect(computeGlobalScore(breakdown({
      cvMatch: 1, northStar: 1, comp: 1, cultural: 1, redFlags: 1,
    }))).toBe(1)
  })

  it("returns 3.0 when every dimension is 3", () => {
    expect(computeGlobalScore(breakdown())).toBe(3)
  })

  it("respects the documented santifer-style weights", () => {
    // cvMatch dominates at 0.40
    // 5*0.40 + 1*0.25 + 1*0.15 + 1*0.10 + 1*0.10 = 2.0 + 0.25 + 0.15 + 0.10 + 0.10 = 2.6
    expect(computeGlobalScore(breakdown({
      cvMatch: 5, northStar: 1, comp: 1, cultural: 1, redFlags: 1,
    }))).toBe(2.6)

    // northStar at second-largest weight (0.25)
    // 1*0.40 + 5*0.25 + 1*0.15 + 1*0.10 + 1*0.10 = 0.40 + 1.25 + 0.15 + 0.10 + 0.10 = 2.0
    expect(computeGlobalScore(breakdown({
      cvMatch: 1, northStar: 5, comp: 1, cultural: 1, redFlags: 1,
    }))).toBe(2)
  })

  it("caps at 2.5 when any gap is a hard_blocker", () => {
    // Without the cap: 5*0.40 + 5*0.25 + 5*0.15 + 5*0.10 + 5*0.10 = 5.0
    // With one hard_blocker: capped to 2.5
    expect(
      computeGlobalScore(
        breakdown({ cvMatch: 5, northStar: 5, comp: 5, cultural: 5, redFlags: 5 }),
        [blocker]
      )
    ).toBe(2.5)
  })

  it("ignores medium and nice_to_have severities for the cap", () => {
    const result = computeGlobalScore(
      breakdown({ cvMatch: 5, northStar: 5, comp: 5, cultural: 5, redFlags: 5 }),
      [
        { description: "x", severity: "medium", mitigation: "y" },
        { description: "x", severity: "nice_to_have", mitigation: "y" },
      ]
    )
    expect(result).toBe(5)
  })

  it("clamps out-of-range dimension values into [1, 5]", () => {
    expect(computeGlobalScore(breakdown({
      cvMatch: 99, northStar: -1, comp: 0, cultural: 7, redFlags: 5,
    }))).toBe(
      // clamped: 5, 1, 1, 5, 5
      // 5*0.40 + 1*0.25 + 1*0.15 + 5*0.10 + 5*0.10 = 2.0 + 0.25 + 0.15 + 0.50 + 0.50 = 3.4
      3.4
    )
  })

  it("handles NaN by treating as 3 (neutral)", () => {
    expect(computeGlobalScore(breakdown({
      cvMatch: NaN, northStar: 3, comp: 3, cultural: 3, redFlags: 3,
    }))).toBe(3)
  })

  it("rounds to one decimal", () => {
    // 4*0.40 + 3*0.25 + 3*0.15 + 4*0.10 + 4*0.10 = 1.6 + 0.75 + 0.45 + 0.40 + 0.40 = 3.6
    expect(computeGlobalScore(breakdown({
      cvMatch: 4, northStar: 3, comp: 3, cultural: 4, redFlags: 4,
    }))).toBe(3.6)
  })
})
