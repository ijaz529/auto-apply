/**
 * Evaluation runner — the actual work of evaluating one job. Extracted from
 * the route-level fire-and-forget functions so it can be invoked from:
 *   - API routes (direct fallback when no Redis)
 *   - BullMQ worker (when Redis is configured)
 *
 * Pure-ish: takes (jobId, userId), reads/writes the DB, returns nothing.
 * Throws on hard failures so the caller (queue worker) can apply retry policy.
 */
import { prisma } from "@/lib/db"
import { evaluateJob } from "@/lib/ai/evaluate"

type ModelPreference = "sonnet" | "opus"

export async function processEvaluation(
  jobId: string,
  userId: string
): Promise<void> {
  const job = await prisma.job.findFirst({ where: { id: jobId, userId } })
  if (!job?.jdText) {
    // Quietly no-op — caller already ensured this on the API path; queue retries
    // wouldn't help here either.
    return
  }

  const profile = await prisma.profile.findUnique({ where: { userId } })
  if (!profile?.cvMarkdown) return

  const model: ModelPreference =
    profile.preferredModel === "opus" ? "opus" : "sonnet"

  let result
  try {
    result = await evaluateJob(
      job.jdText,
      profile.cvMarkdown,
      profile.preferences || undefined,
      model,
      profile.targetRoles as string[] | null
    )
  } catch (err) {
    // Mark as visible failure on the application; rethrow so the queue can retry.
    await prisma.application
      .updateMany({
        where: { jobId, userId },
        data: {
          status: "evaluated",
          notes: `Evaluation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      })
      .catch(() => {})
    throw err
  }

  const enrichedReport = result.reportMarkdown.replace(
    "# Evaluation: Role at Company",
    `# Evaluation: ${job.role} at ${job.company}`
  )

  await prisma.evaluation.upsert({
    where: { jobId },
    update: {
      score: result.score,
      archetype: result.archetype,
      legitimacy: result.legitimacy,
      reportMarkdown: enrichedReport,
      blocksJson: result.blocksJson,
      keywords: result.keywords,
      scoreBreakdown: result.scoreBreakdown,
      gaps: result.gaps,
      model,
    },
    create: {
      jobId,
      userId,
      score: result.score,
      archetype: result.archetype,
      legitimacy: result.legitimacy,
      reportMarkdown: enrichedReport,
      blocksJson: result.blocksJson,
      keywords: result.keywords,
      scoreBreakdown: result.scoreBreakdown,
      gaps: result.gaps,
      model,
    },
  })

  await prisma.application.updateMany({
    where: { jobId, userId },
    data: {
      status: "evaluated",
      manualSteps: result.manualApplySteps,
    },
  })
}
