import { describe, expect, it } from "vitest"
import {
  pickTopStories,
  rankStoriesByRelevance,
  scoreStory,
  type StoryLike,
} from "./story-matching"

const story = (overrides: Partial<StoryLike>): StoryLike => ({
  id: "s",
  category: "Technical",
  title: "",
  situation: "",
  task: "",
  action: "",
  result: "",
  reflection: null,
  ...overrides,
})

describe("scoreStory", () => {
  it("counts distinct keyword hits across all story fields", () => {
    const s = story({
      title: "Built Postgres replication",
      action: "Set up Kafka pipelines",
      result: "Reduced latency",
    })
    const out = scoreStory(s, ["postgres", "kafka", "go", "latency"])
    expect(out.score).toBe(3)
    expect(out.matchedKeywords).toEqual(["postgres", "kafka", "latency"])
  })

  it("matches multi-word keywords as substrings", () => {
    const s = story({ situation: "We had a multi-region replication issue" })
    const out = scoreStory(s, ["multi-region replication", "kafka"])
    expect(out.score).toBe(1)
  })

  it("is case-insensitive and trims whitespace", () => {
    const s = story({ title: "Fixed a Kubernetes incident" })
    const out = scoreStory(s, ["  KUBERNETES  ", "GO"])
    expect(out.score).toBe(1)
    expect(out.matchedKeywords).toEqual(["  KUBERNETES  "])
  })

  it("returns 0 when no keywords match or input is empty", () => {
    expect(scoreStory(story({}), ["xyz"]).score).toBe(0)
    expect(scoreStory(story({ title: "anything" }), []).score).toBe(0)
  })
})

describe("rankStoriesByRelevance", () => {
  const stories: StoryLike[] = [
    story({ id: "a", title: "Postgres replication" }),
    story({ id: "b", title: "Kafka latency", action: "Used Postgres too" }),
    story({ id: "c", title: "Frontend animation work" }),
    story({ id: "d", title: "Postgres + Kafka migration" }),
  ]

  it("orders by raw match count, descending", () => {
    const ranked = rankStoriesByRelevance(stories, ["postgres", "kafka"])
    expect(ranked.map((r) => r.story.id)).toEqual(["b", "d", "a", "c"])
  })

  it("preserves original order on ties", () => {
    const ranked = rankStoriesByRelevance(stories, ["postgres"])
    // a, b, d all match once; c matches zero. Input order between the three
    // matches is preserved: a (0), b (1), d (3).
    expect(ranked.map((r) => r.story.id)).toEqual(["a", "b", "d", "c"])
  })

  it("applies a small archetype-category bonus", () => {
    // PM archetype boosts Leadership/Communication/etc. but NOT Technical.
    const pmStories: StoryLike[] = [
      story({ id: "tech", category: "Technical", title: "Built api" }),
      story({ id: "lead", category: "Leadership", title: "Built api" }),
    ]
    const ranked = rankStoriesByRelevance(
      pmStories,
      ["api"],
      "Product Manager"
    )
    // Both match "api" → tied on raw score, but Leadership gets the +0.5
    // bonus and beats Technical.
    expect(ranked[0].story.id).toBe("lead")
    expect(ranked[1].story.id).toBe("tech")
  })

  it("returns [] for empty input", () => {
    expect(rankStoriesByRelevance([], ["any"])).toEqual([])
  })

  it("does not mutate input array", () => {
    const before = [...stories]
    rankStoriesByRelevance(stories, ["postgres"])
    expect(stories).toEqual(before)
  })
})

describe("pickTopStories", () => {
  it("returns the top N stories without the score envelope", () => {
    const stories: StoryLike[] = [
      story({ id: "a", title: "Postgres" }),
      story({ id: "b", title: "Kafka" }),
      story({ id: "c", title: "Postgres + Kafka" }),
      story({ id: "d", title: "Frontend" }),
    ]
    const top = pickTopStories(stories, ["postgres", "kafka"], 2)
    expect(top.map((s) => s.id)).toEqual(["c", "a"])
  })

  it("returns at most N even when more match", () => {
    const stories: StoryLike[] = Array.from({ length: 8 }, (_, i) =>
      story({ id: `s${i}`, title: "matches keyword" })
    )
    const top = pickTopStories(stories, ["matches"], 3)
    expect(top).toHaveLength(3)
  })
})
