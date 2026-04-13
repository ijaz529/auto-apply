import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { evaluateJob } from "@/lib/ai/evaluate"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Load the job
    const job = await prisma.job.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    if (!job.jdText) {
      return NextResponse.json(
        {
          error:
            "No JD text available for this job. The JD fetch may have failed. Try re-adding the URL.",
        },
        { status: 400 }
      )
    }

    // Load user's CV and preferences
    const profile = await prisma.profile.findUnique({
      where: { userId: session.user.id },
    })

    if (!profile?.cvMarkdown) {
      return NextResponse.json(
        {
          error:
            "No CV found. Upload your CV first via /api/cv/upload.",
        },
        { status: 400 }
      )
    }

    // Determine model
    const model = (profile.preferredModel === "opus" ? "opus" : "sonnet") as
      | "sonnet"
      | "opus"

    // Run evaluation
    const result = await evaluateJob(
      job.jdText,
      profile.cvMarkdown,
      profile.preferences || undefined,
      model
    )

    // Build enriched report with actual company/role names
    const enrichedReport = result.reportMarkdown
      .replace(
        "# Evaluation: Role at Company",
        `# Evaluation: ${job.role} at ${job.company}`
      )

    // Check if evaluation already exists (re-evaluation)
    const existingEval = await prisma.evaluation.findUnique({
      where: { jobId: job.id },
    })

    let evaluation
    if (existingEval) {
      evaluation = await prisma.evaluation.update({
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
      evaluation = await prisma.evaluation.create({
        data: {
          jobId: job.id,
          userId: session.user.id,
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

    // Update application with manual apply steps
    await prisma.application.updateMany({
      where: {
        jobId: job.id,
        userId: session.user.id,
      },
      data: {
        status: "evaluated",
        manualSteps: result.manualApplySteps,
      },
    })

    return NextResponse.json({
      evaluation,
      coverLetterDraft: result.coverLetterDraft,
      manualApplySteps: result.manualApplySteps,
    })
  } catch (error) {
    console.error("Evaluation error:", error)

    // Provide more specific error messages for common failures
    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        return NextResponse.json(
          { error: "Anthropic API key not configured. Set ANTHROPIC_API_KEY in your environment." },
          { status: 500 }
        )
      }
      if (error.message.includes("rate limit")) {
        return NextResponse.json(
          { error: "Rate limited by Claude API. Please wait a moment and try again." },
          { status: 429 }
        )
      }
    }

    return NextResponse.json(
      { error: "Evaluation failed. Please try again." },
      { status: 500 }
    )
  }
}
