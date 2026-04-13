import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import { generateInterviewPrep } from "@/lib/ai/interview-prep"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const userId = await getUserId()

    const { jobId } = await params

    // Check if job exists and belongs to user
    const job = await prisma.job.findFirst({
      where: { id: jobId, userId },
      include: { evaluation: true },
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Check if we have a cached interview prep in the evaluation's blocksJson
    const eval_ = job.evaluation
    if (eval_?.blocksJson) {
      const blocks = eval_.blocksJson as Record<string, unknown>
      if (blocks.interviewPrep) {
        return NextResponse.json({
          prep: blocks.interviewPrep,
          cached: true,
        })
      }
    }

    return NextResponse.json({
      prep: null,
      message: "No interview prep generated yet. Use POST to generate one.",
    })
  } catch (error) {
    console.error("Interview prep GET error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const userId = await getUserId()

    const { jobId } = await params

    // Verify job exists and belongs to user
    const job = await prisma.job.findFirst({
      where: { id: jobId, userId },
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Generate interview prep
    const prep = await generateInterviewPrep(jobId, userId)

    // Cache the result in the evaluation's blocksJson
    const eval_ = await prisma.evaluation.findUnique({
      where: { jobId },
    })

    if (eval_) {
      const existingBlocks = (eval_.blocksJson as Record<string, unknown>) || {}
      await prisma.evaluation.update({
        where: { id: eval_.id },
        data: {
          blocksJson: JSON.parse(JSON.stringify({
            ...existingBlocks,
            interviewPrep: prep,
          })),
        },
      })
    }

    return NextResponse.json({ prep, cached: false })
  } catch (error) {
    console.error("Interview prep POST error:", error)

    if (error instanceof Error) {
      if (error.message === "Job not found") {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      if (error.message.includes("CV not found")) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
