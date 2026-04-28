import { beforeEach, describe, expect, it, vi } from "vitest"
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

// ── Orchestration test (mocks Prisma + Anthropic SDK) ──────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    job: { findFirst: vi.fn() },
    profile: { findUnique: vi.fn() },
  },
}))

const mockMessagesParse = vi.fn()

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { parse: mockMessagesParse },
  })),
}))

vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  zodOutputFormat: () => ({}),
}))

import { generateJobStrategy } from "./strategy"
import { prisma } from "@/lib/db"

const mockJobFind = vi.mocked(prisma.job.findFirst)
const mockProfileFind = vi.mocked(prisma.profile.findUnique)

const fakeStrategy = {
  research: "## Research markdown",
  negotiation: "## Negotiation markdown",
}

describe("generateJobStrategy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = "sk-test"
    mockMessagesParse.mockResolvedValue({
      parsed_output: fakeStrategy,
      stop_reason: "end_turn",
    })
  })

  it("throws when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(generateJobStrategy("j1", "u1")).rejects.toThrow(
      /ANTHROPIC_API_KEY/
    )
  })

  it("throws Job not found when the job doesn't exist for the user", async () => {
    mockJobFind.mockResolvedValue(null)
    await expect(generateJobStrategy("j1", "u1")).rejects.toThrow(
      /Job not found/
    )
  })

  it("throws when messages.parse returns null parsed_output", async () => {
    mockJobFind.mockResolvedValue({
      id: "j1",
      company: "Acme",
      role: "PM",
      location: null,
      jdText: null,
      evaluation: null,
    } as never)
    mockProfileFind.mockResolvedValue(null)
    mockMessagesParse.mockResolvedValue({
      parsed_output: null,
      stop_reason: "refusal",
    })
    await expect(generateJobStrategy("j1", "u1")).rejects.toThrow(/refusal/)
  })

  it("happy path: returns parsed research + negotiation", async () => {
    mockJobFind.mockResolvedValue({
      id: "j1",
      company: "Acme",
      role: "PM",
      location: "Berlin",
      jdText: "JD body",
      evaluation: {
        score: 4.2,
        archetype: "Product Manager",
        reportMarkdown: "# Eval",
      },
    } as never)
    mockProfileFind.mockResolvedValue({
      preferredModel: "opus",
      preferences: "Remote",
      targetRoles: ["Senior PM"],
    } as never)

    const out = await generateJobStrategy("j1", "u1")
    expect(out).toEqual(fakeStrategy)
    expect(mockMessagesParse).toHaveBeenCalledTimes(1)

    // User content should reference the job + the eval report.
    const call = mockMessagesParse.mock.calls[0][0] as {
      messages: Array<{ content: string }>
    }
    expect(call.messages[0].content).toContain("Acme")
    expect(call.messages[0].content).toContain("# Eval")
    expect(call.messages[0].content).toContain("Senior PM")
  })

  it("uses the preferredModel mapping (sonnet vs opus)", async () => {
    mockJobFind.mockResolvedValue({
      id: "j1",
      company: "Acme",
      role: "PM",
      location: null,
      jdText: null,
      evaluation: null,
    } as never)
    mockProfileFind.mockResolvedValue({
      preferredModel: "sonnet",
    } as never)

    await generateJobStrategy("j1", "u1")
    const call = mockMessagesParse.mock.calls[0][0] as { model: string }
    expect(call.model).toBe("claude-sonnet-4-6")
  })
})
