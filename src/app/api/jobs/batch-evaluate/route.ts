import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import { processEvaluation } from "@/lib/queue/run-evaluation"
import {
  tryEnqueueEvaluation,
  getEvaluationQueue,
} from "@/lib/queue/evaluation-queue"

const MAX_BATCH = 50

/**
 * POST /api/jobs/batch-evaluate
 * Body: { jobIds: string[] }
 *
 * Schedules evaluation for each job. Uses the BullMQ queue when Redis is
 * configured (parallel processing in the worker), falls back to direct
 * execution otherwise. Returns counts and the queue mode used.
 *
 * The fallback path runs evaluations *sequentially in the request* would block
 * the response indefinitely, so the fallback is fire-and-forget per-job. That
 * means with no Redis the jobs all start immediately in-process — fine for a
 * handful, but real batch throughput requires the worker.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId()
    const body = await req.json().catch(() => ({}))
    const { jobIds } = body as { jobIds?: unknown }

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json(
        { error: "jobIds must be a non-empty array of job ids." },
        { status: 400 }
      )
    }
    if (jobIds.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BATCH} jobs per batch.` },
        { status: 400 }
      )
    }

    const ids = jobIds.filter((v): v is string => typeof v === "string")

    // Verify all ids belong to this user and have JD text. Skip silently otherwise.
    const owned = await prisma.job.findMany({
      where: { id: { in: ids }, userId, jdText: { not: null } },
      select: { id: true },
    })
    const ownedIds = new Set(owned.map((j) => j.id))

    const usingQueue = !!getEvaluationQueue()
    let queued = 0
    let direct = 0
    const skipped = ids.filter((id) => !ownedIds.has(id))

    for (const id of ids) {
      if (!ownedIds.has(id)) continue
      const ok = await tryEnqueueEvaluation({ jobId: id, userId })
      if (ok) {
        queued++
      } else {
        direct++
        void processEvaluation(id, userId).catch((err) => {
          console.error(`[batch direct-eval] job ${id} failed:`, err)
        })
      }
    }

    return NextResponse.json({
      total: ids.length,
      queued,
      direct,
      skipped: skipped.length,
      mode: usingQueue ? "queue" : "direct",
    })
  } catch (error) {
    console.error("Batch evaluate error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
