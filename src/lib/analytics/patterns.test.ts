import { describe, expect, it } from "vitest"
import {
  classifyOutcome,
  classifyRemote,
  extractBlockerType,
  extractTechSkills,
  normalizeStatus,
  scoreStats,
} from "./patterns"

describe("normalizeStatus", () => {
  it("strips bold markers, dates, and lowercases", () => {
    expect(normalizeStatus("**Applied** 2026-04-22 — sent CV")).toBe("applied")
  })

  it("maps Spanish aliases to canonical English", () => {
    expect(normalizeStatus("Aplicado")).toBe("applied")
    expect(normalizeStatus("rechazada")).toBe("rejected")
    expect(normalizeStatus("Cerrada")).toBe("discarded")
    expect(normalizeStatus("entrevista")).toBe("interview")
  })

  it("passes unknown statuses through (already lowered + trimmed)", () => {
    expect(normalizeStatus("  Custom State  ")).toBe("custom state")
  })
})

describe("classifyOutcome", () => {
  it("groups statuses into the four outcome buckets", () => {
    expect(classifyOutcome("interview")).toBe("positive")
    expect(classifyOutcome("offer")).toBe("positive")
    expect(classifyOutcome("responded")).toBe("positive")
    expect(classifyOutcome("applied")).toBe("positive")
    expect(classifyOutcome("rejected")).toBe("negative")
    expect(classifyOutcome("discarded")).toBe("negative")
    expect(classifyOutcome("skip")).toBe("self_filtered")
    expect(classifyOutcome("evaluated")).toBe("pending")
  })

  it("respects Spanish aliases via normalizeStatus", () => {
    expect(classifyOutcome("Aplicado")).toBe("positive")
    expect(classifyOutcome("rechazada")).toBe("negative")
  })
})

describe("classifyRemote", () => {
  it("buckets US/Canada-only as geo-restricted", () => {
    expect(classifyRemote("US-only")).toBe("geo-restricted")
    expect(classifyRemote("Canada residents only")).toBe("geo-restricted")
    expect(classifyRemote("Argentina remote only")).toBe("geo-restricted")
  })

  it("buckets hybrid / onsite / relocation", () => {
    expect(classifyRemote("Hybrid 3 days/week")).toBe("hybrid/onsite")
    expect(classifyRemote("On-site Berlin")).toBe("hybrid/onsite")
    expect(classifyRemote("Relocate to NYC")).toBe("hybrid/onsite")
    expect(classifyRemote("Relocation required")).toBe("hybrid/onsite")
  })

  it("buckets global remote and regional remote", () => {
    expect(classifyRemote("Global remote, work from anywhere")).toBe(
      "global remote"
    )
    expect(classifyRemote("Remote LATAM only")).toBe("regional remote")
  })

  it("returns 'unknown' for empty / unrecognised", () => {
    expect(classifyRemote(null)).toBe("unknown")
    expect(classifyRemote(undefined)).toBe("unknown")
    expect(classifyRemote("")).toBe("unknown")
    expect(classifyRemote("Mars colony")).toBe("unknown")
  })
})

describe("extractBlockerType", () => {
  it("classifies known blocker keywords by severity-aware regex", () => {
    expect(
      extractBlockerType({
        description: "US residency required",
        severity: "hard_blocker",
      })
    ).toBe("geo-restriction")
    expect(
      extractBlockerType({
        description: "5 yrs of TypeScript",
        severity: "hard_blocker",
      })
    ).toBe("stack-mismatch")
    expect(
      extractBlockerType({
        description: "Senior role, requires lead experience",
        severity: "hard_blocker",
      })
    ).toBe("seniority-mismatch")
    expect(
      extractBlockerType({
        description: "Hybrid 3 days/week onsite",
        severity: "hard_blocker",
      })
    ).toBe("onsite-requirement")
  })

  it("returns null for soft / nice-to-have severities", () => {
    expect(
      extractBlockerType({
        description: "Some Python preferred",
        severity: "nice_to_have",
      })
    ).toBeNull()
    expect(
      extractBlockerType({
        description: "Some Python preferred",
        severity: "soft",
      })
    ).toBeNull()
  })

  it("falls back to 'other' when no specific keyword matches", () => {
    expect(
      extractBlockerType({
        description: "Vague unrelated requirement",
        severity: "hard_blocker",
      })
    ).toBe("other")
  })
})

describe("extractTechSkills", () => {
  it("extracts known tech tokens with canonical casing", () => {
    expect(extractTechSkills("Strong PYTHON, react, kubernetes needed")).toEqual([
      "PYTHON",
      "React",
      "Kubernetes",
    ])
  })

  it("returns [] when nothing matches", () => {
    expect(extractTechSkills("Communication and leadership skills")).toEqual([])
  })

  it("handles compound names like Node.js and React Native", () => {
    expect(extractTechSkills("Build with Node.js and React Native")).toContain(
      "Node.js"
    )
    expect(extractTechSkills("Build with Node.js and React Native")).toContain(
      "React Native"
    )
  })
})

describe("scoreStats", () => {
  it("returns zeros for empty input", () => {
    expect(scoreStats([])).toEqual({ avg: 0, min: 0, max: 0, count: 0 })
  })

  it("computes avg / min / max / count rounded to two decimals", () => {
    expect(scoreStats([3, 4, 5])).toEqual({ avg: 4, min: 3, max: 5, count: 3 })
    expect(scoreStats([3.7, 4.2, 4.5])).toEqual({
      avg: 4.13,
      min: 3.7,
      max: 4.5,
      count: 3,
    })
  })
})
