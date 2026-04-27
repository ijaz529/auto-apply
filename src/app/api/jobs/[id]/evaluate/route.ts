import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import { processEvaluation } from "@/lib/queue/run-evaluation"
import { tryEnqueueEvaluation } from "@/lib/queue/evaluation-queue"

// Try queue first; on Redis-unavailable / enqueue-error fall back to in-process
// fire-and-forget. Either way the API returns immediately with status: evaluating.
async function scheduleEvaluation(jobId: string, userId: string) {
  const queued = await tryEnqueueEvaluation({ jobId, userId })
  if (queued) return
  void processEvaluation(jobId, userId).catch((err) => {
    console.error(`[direct-eval] failed for job ${jobId}:`, err)
  })
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

    // Schedule (queue or direct). Returns immediately.
    scheduleEvaluation(id, userId)

    return NextResponse.json({ status: "evaluating", jobId: id })
  } catch (error) {
    console.error("Evaluation trigger error:", error)
    return NextResponse.json(
      { error: "Failed to start evaluation." },
      { status: 500 }
    )
  }
}
