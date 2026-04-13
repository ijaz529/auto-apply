import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import { generateOutreach } from "@/lib/ai/outreach"

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

    // Generate outreach messages
    const outreach = await generateOutreach(jobId, userId)

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
            outreach,
          })),
        },
      })
    }

    return NextResponse.json({ outreach })
  } catch (error) {
    console.error("Outreach POST error:", error)

    if (error instanceof Error) {
      if (error.message === "Job not found") {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      if (error.message.includes("Profile not found")) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
