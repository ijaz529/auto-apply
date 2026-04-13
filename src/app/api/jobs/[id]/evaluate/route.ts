import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import { evaluateJob } from "@/lib/ai/evaluate"

// Fire-and-forget evaluation — runs Claude in background, writes to DB when done
async function runEvaluationInBackground(jobId: string, userId: string) {
  try {
    const job = await prisma.job.findFirst({ where: { id: jobId, userId } })
    if (!job?.jdText) return

    const profile = await prisma.profile.findUnique({ where: { userId } })
    if (!profile?.cvMarkdown) return

    const model = (profile.preferredModel === "opus" ? "opus" : "sonnet") as "sonnet" | "opus"

    const result = await evaluateJob(
      job.jdText,
      profile.cvMarkdown,
      profile.preferences || undefined,
      model
    )

    const enrichedReport = result.reportMarkdown.replace(
      "# Evaluation: Role at Company",
      `# Evaluation: ${job.role} at ${job.company}`
    )

    const existingEval = await prisma.evaluation.findUnique({ where: { jobId } })

    if (existingEval) {
      await prisma.evaluation.update({
        where: { id: existingEval.id },
        data: {
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
    } else {
      await prisma.evaluation.create({
        data: {
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
    }

    await prisma.application.updateMany({
      where: { jobId, userId },
      data: {
        status: "evaluated",
        manualSteps: result.manualApplySteps,
      },
    })

    console.log(`Evaluation complete for job ${jobId}: score ${result.score}`)
  } catch (error) {
    console.error(`Background evaluation failed for job ${jobId}:`, error)
    try {
      await prisma.application.updateMany({
        where: { jobId, userId },
        data: { status: "evaluated", notes: `Evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}` },
      })
    } catch {
      // ignore
    }
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()
    const { id } = await params

    const job = await prisma.job.findFirst({ where: { id, userId } })
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    if (!job.jdText) {
      return NextResponse.json(
        { error: "No JD text available. Try re-adding the URL or paste the JD text." },
        { status: 400 }
      )
    }

    const profile = await prisma.profile.findUnique({ where: { userId } })
    if (!profile?.cvMarkdown) {
      return NextResponse.json(
        { error: "No CV found. Upload your CV first." },
        { status: 400 }
      )
    }

    // Fire and forget — don't await, return immediately
    runEvaluationInBackground(id, userId)

    return NextResponse.json({ status: "evaluating", jobId: id })
  } catch (error) {
    console.error("Evaluation trigger error:", error)
    return NextResponse.json(
      { error: "Failed to start evaluation." },
      { status: 500 }
    )
  }
}
