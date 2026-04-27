import { describe, expect, it } from "vitest"
import { keywordMatchCount, prioritizeByKeywords } from "./keyword-scoring"

describe("keywordMatchCount", () => {
  it("returns 0 for empty text or keywords", () => {
    expect(keywordMatchCount("", ["go"])).toBe(0)
    expect(keywordMatchCount("Built things", [])).toBe(0)
  })

  it("counts distinct keyword hits case-insensitively", () => {
    expect(
      keywordMatchCount("Built Postgres pipelines with Kafka", [
        "postgres",
        "kafka",
        "go",
      ])
    ).toBe(2)
  })

  it("matches multi-word keywords as substrings", () => {
    expect(
      keywordMatchCount("Designed a multi-region replication strategy", [
        "multi-region replication",
        "kafka",
      ])
    ).toBe(1)
  })

  it("trims whitespace from keywords", () => {
    expect(keywordMatchCount("Built with Go", ["  go  "])).toBe(1)
  })

  it("empty keyword strings do not match", () => {
    expect(keywordMatchCount("anything", ["", "  "])).toBe(0)
  })
})

describe("prioritizeByKeywords", () => {
  it("returns input unchanged when keywords is empty/undefined", () => {
    const items = ["a", "b", "c"]
    expect(prioritizeByKeywords(items, (s) => s, undefined)).toBe(items)
    expect(prioritizeByKeywords(items, (s) => s, [])).toBe(items)
  })

  it("sorts by match count desc with stable tie-breaking", () => {
    const items = [
      { id: 1, text: "Built Postgres database" },
      { id: 2, text: "Wrote Go services and used Postgres" },
      { id: 3, text: "Worked on backend" },
      { id: 4, text: "Used Postgres heavily" },
    ]
    const sorted = prioritizeByKeywords(items, (i) => i.text, [
      "postgres",
      "go",
    ])
    expect(sorted.map((i) => i.id)).toEqual([2, 1, 4, 3])
  })

  it("does not mutate the input array", () => {
    const items = [
      { id: 1, text: "Worked on backend" },
      { id: 2, text: "Used Postgres heavily" },
    ]
    const before = [...items]
    prioritizeByKeywords(items, (i) => i.text, ["postgres"])
    expect(items).toEqual(before)
  })

  it("preserves original order when no items match", () => {
    const items = ["a", "b", "c"]
    expect(prioritizeByKeywords(items, (s) => s, ["xyz"])).toEqual(["a", "b", "c"])
  })
})
