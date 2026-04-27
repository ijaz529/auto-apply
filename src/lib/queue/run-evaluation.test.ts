import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the Prisma client and the evaluator before importing the function under
// test — vi.mock is hoisted, so these run before run-evaluation.ts loads.
vi.mock("@/lib/db", () => ({
  prisma: {
    job: { findFirst: vi.fn() },
    profile: { findUnique: vi.fn() },
    evaluation: { upsert: vi.fn() },
    application: { updateMany: vi.fn() },
  },
}))

vi.mock("@/lib/ai/evaluate", () => ({
  evaluateJob: vi.fn(),
}))

import { processEvaluation } from "./run-evaluation"
import { prisma } from "@/lib/db"
import { evaluateJob } from "@/lib/ai/evaluate"

const mockJob = vi.mocked(prisma.job.findFirst)
const mockProfile = vi.mocked(prisma.profile.findUnique)
const mockUpsert = vi.mocked(prisma.evaluation.upsert)
const mockApplyUpdate = vi.mocked(prisma.application.updateMany)
const mockEvaluate = vi.mocked(evaluateJob)

const fakeJob = {
  id: "j1",
  userId: "u1",
  url: "https://example.com",
  company: "Acme",
  role: "Senior PM",
  jdText: "We are hiring a Senior PM…",
}

const fakeProfile = {
  userId: "u1",
  cvMarkdown: "# CV markdown",
  preferences: "Remote-friendly",
  preferredModel: "sonnet",
  targetRoles: ["Senior PM"],
}

const fakeResult = {
  score: 4.2,
  archetype: "Product Manager",
  legitimacy: "High Confidence",
  reportMarkdown:
    "# Evaluation: Role at Company\n\nFull body of the report here.",
  blocksJson: { A: "...block A markdown..." },
  keywords: ["product", "roadmap"],
  scoreBreakdown: { cvMatch: 4, northStar: 4, comp: 4, cultural: 4, redFlags: 4 },
  gaps: [],
  manualApplySteps: ["Step 1", "Step 2"],
  coverLetterDraft: "Dear hiring manager…",
}

describe("processEvaluation orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Prisma update / upsert calls return *something* awaitable in production
    // (a PrismaPromise). Default the write mocks to resolved-undefined so the
    // chained .catch() in the orchestration error path doesn't blow up.
    mockUpsert.mockResolvedValue(undefined as never)
    mockApplyUpdate.mockResolvedValue(undefined as never)
  })

  it("evaluates and writes when job + profile + jdText exist", async () => {
    mockJob.mockResolvedValue(fakeJob as never)
    mockProfile.mockResolvedValue(fakeProfile as never)
    mockEvaluate.mockResolvedValue(fakeResult)

    await processEvaluation("j1", "u1")

    // The evaluator was called with the right inputs
    expect(mockEvaluate).toHaveBeenCalledTimes(1)
    expect(mockEvaluate).toHaveBeenCalledWith(
      fakeJob.jdText,
      fakeProfile.cvMarkdown,
      fakeProfile.preferences,
      "sonnet",
      fakeProfile.targetRoles
    )

    // Evaluation upserted with the result, scoped to the job
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const upsertCall = mockUpsert.mock.calls[0][0] as {
      where: { jobId: string }
      update: {
        score: number
        archetype: string
        reportMarkdown: string
      }
      create: { jobId: string; userId: string; score: number }
    }
    expect(upsertCall.where).toEqual({ jobId: "j1" })
    expect(upsertCall.update.score).toBe(4.2)
    expect(upsertCall.update.archetype).toBe("Product Manager")
    expect(upsertCall.create.userId).toBe("u1")

    // Title placeholder in reportMarkdown was replaced with company/role
    expect(upsertCall.update.reportMarkdown).toContain("Senior PM at Acme")
    expect(upsertCall.update.reportMarkdown).not.toContain("Role at Company")

    // Application status moved to "evaluated" with the manual steps copied through
    expect(mockApplyUpdate).toHaveBeenCalledWith({
      where: { jobId: "j1", userId: "u1" },
      data: { status: "evaluated", manualSteps: fakeResult.manualApplySteps },
    })
  })

  it("no-ops when the job has no JD text (skips evaluator + writes)", async () => {
    mockJob.mockResolvedValue({ ...fakeJob, jdText: null } as never)

    await processEvaluation("j1", "u1")

    expect(mockProfile).not.toHaveBeenCalled()
    expect(mockEvaluate).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockApplyUpdate).not.toHaveBeenCalled()
  })

  it("no-ops when the profile has no CV", async () => {
    mockJob.mockResolvedValue(fakeJob as never)
    mockProfile.mockResolvedValue(null as never)

    await processEvaluation("j1", "u1")

    expect(mockEvaluate).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it("on evaluator failure: writes a visible note on the application AND rethrows for queue retry", async () => {
    mockJob.mockResolvedValue(fakeJob as never)
    mockProfile.mockResolvedValue(fakeProfile as never)
    mockEvaluate.mockRejectedValue(new Error("LLM blew up"))

    await expect(processEvaluation("j1", "u1")).rejects.toThrow("LLM blew up")
    expect(mockApplyUpdate).toHaveBeenCalledWith({
      where: { jobId: "j1", userId: "u1" },
      data: {
        status: "evaluated",
        notes: "Evaluation failed: LLM blew up",
      },
    })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it("uses opus when the profile prefers it", async () => {
    mockJob.mockResolvedValue(fakeJob as never)
    mockProfile.mockResolvedValue({
      ...fakeProfile,
      preferredModel: "opus",
    } as never)
    mockEvaluate.mockResolvedValue(fakeResult)

    await processEvaluation("j1", "u1")

    expect(mockEvaluate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.anything(),
      "opus",
      expect.anything()
    )
  })
})
