import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the Prisma client and the Anthropic SDK before importing the function
// under test. Vitest's hoisted mocks ensure these run before module load.
vi.mock("@/lib/db", () => ({
  prisma: {
    job: { findFirst: vi.fn() },
    profile: { findUnique: vi.fn() },
    story: { findMany: vi.fn() },
  },
}))

const mockMessagesParse = vi.fn()

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { parse: mockMessagesParse },
    })),
  }
})

// We don't care about the zodOutputFormat helper's internals — stub it to a
// noop so messages.parse is the only surface we assert against.
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  zodOutputFormat: () => ({}),
}))

import { generateInterviewPrep } from "./interview-prep"
import { prisma } from "@/lib/db"

const mockJobFind = vi.mocked(prisma.job.findFirst)
const mockProfileFind = vi.mocked(prisma.profile.findUnique)
const mockStoryFind = vi.mocked(prisma.story.findMany)

const fakePrep = {
  processOverview: "## Overview text",
  roundBreakdown: "## Rounds text",
  likelyQuestions: "## Questions text",
  starStories: "## STAR mapping text",
  redFlagQuestions: "## Red flags text",
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = "sk-test"
  mockMessagesParse.mockResolvedValue({
    parsed_output: fakePrep,
    stop_reason: "end_turn",
  })
})

describe("generateInterviewPrep", () => {
  it("throws when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(generateInterviewPrep("j1", "u1")).rejects.toThrow(
      /ANTHROPIC_API_KEY/
    )
  })

  it("throws Job not found when the job doesn't exist for the user", async () => {
    mockJobFind.mockResolvedValue(null)
    await expect(generateInterviewPrep("j1", "u1")).rejects.toThrow(
      /Job not found/
    )
  })

  it("throws CV not found when profile has no cvMarkdown", async () => {
    mockJobFind.mockResolvedValue({
      id: "j1",
      company: "Acme",
      role: "PM",
      jdText: "JD",
      location: null,
      evaluation: null,
    } as never)
    mockProfileFind.mockResolvedValue({ cvMarkdown: null } as never)
    await expect(generateInterviewPrep("j1", "u1")).rejects.toThrow(
      /CV not found/
    )
  })

  it("happy path: returns the parsed prep with company + role attached", async () => {
    mockJobFind.mockResolvedValue({
      id: "j1",
      company: "Acme",
      role: "Senior PM",
      jdText: "JD body",
      location: "Berlin",
      evaluation: {
        score: 4.2,
        archetype: "Product Manager",
        reportMarkdown: "# Eval body",
        keywords: ["product", "roadmap"],
      },
    } as never)
    mockProfileFind.mockResolvedValue({
      cvMarkdown: "# CV",
      preferredModel: "sonnet",
      preferences: "Remote",
    } as never)
    mockStoryFind.mockResolvedValue([
      {
        id: "s1",
        category: "Leadership",
        title: "Led 18-market rollout",
        situation: "...",
        task: "...",
        action: "...",
        result: "...",
        reflection: null,
      },
    ] as never)

    const out = await generateInterviewPrep("j1", "u1")

    expect(out).toEqual({
      company: "Acme",
      role: "Senior PM",
      ...fakePrep,
    })
    expect(mockMessagesParse).toHaveBeenCalledTimes(1)

    // The story bank gets passed through pickTopStories (Phase 6) — verify the
    // user content includes the story title we provided.
    const call = mockMessagesParse.mock.calls[0][0] as {
      messages: Array<{ content: string }>
    }
    expect(call.messages[0].content).toContain("Led 18-market rollout")
  })

  it("throws when messages.parse returns null parsed_output", async () => {
    mockJobFind.mockResolvedValue({
      id: "j1",
      company: "Acme",
      role: "PM",
      jdText: "JD",
      location: null,
      evaluation: null,
    } as never)
    mockProfileFind.mockResolvedValue({
      cvMarkdown: "# CV",
      preferredModel: "sonnet",
    } as never)
    mockStoryFind.mockResolvedValue([])
    mockMessagesParse.mockResolvedValue({
      parsed_output: null,
      stop_reason: "max_tokens",
    })

    await expect(generateInterviewPrep("j1", "u1")).rejects.toThrow(
      /max_tokens/
    )
  })
})
