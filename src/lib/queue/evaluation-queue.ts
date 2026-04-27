/**
 * BullMQ queue + worker definitions for job evaluations.
 *
 * Queues are safe to construct at import time (no connection until first use).
 * The Worker is NOT auto-started here — Workers are long-lived processes that
 * leak under Next.js hot-reload; they must be started by the standalone
 * `worker.ts` runner. This module just exports the factory.
 */
import { Queue, Worker, type Job, type Processor } from "bullmq"
import { getRedisConnection } from "./redis"
import { processEvaluation } from "./run-evaluation"

export const EVALUATION_QUEUE_NAME = "auto-apply.evaluations"

export interface EvaluationJobData {
  jobId: string
  userId: string
}

let queueSingleton: Queue<EvaluationJobData> | null = null

/**
 * Returns the shared evaluation queue, or null when Redis is not configured.
 * Lazy: the first call constructs the queue; subsequent calls reuse it.
 */
export function getEvaluationQueue(): Queue<EvaluationJobData> | null {
  if (queueSingleton) return queueSingleton
  const connection = getRedisConnection()
  if (!connection) return null

  queueSingleton = new Queue<EvaluationJobData>(EVALUATION_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      // Two attempts cover transient LLM/network blips without retrying broken JDs forever.
      attempts: 2,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  })

  return queueSingleton
}

/**
 * Best-effort enqueue. Returns true when the job was queued, false when Redis
 * is unavailable or the enqueue itself errored. Callers fall back to direct
 * execution on false.
 *
 * `jobId` (the BullMQ job ID, not the Job DB id) is set deterministically so
 * concurrent triggers (e.g. user double-clicks "Re-evaluate") don't fan out
 * into duplicate evaluations.
 */
export async function tryEnqueueEvaluation(
  data: EvaluationJobData
): Promise<boolean> {
  const queue = getEvaluationQueue()
  if (!queue) return false
  try {
    await queue.add("evaluate", data, {
      jobId: `evaluate:${data.jobId}`,
    })
    return true
  } catch (err) {
    console.warn(
      "[queue] enqueue failed, will fall back to direct execution:",
      err instanceof Error ? err.message : String(err)
    )
    return false
  }
}

/**
 * Construct a BullMQ Worker bound to `processEvaluation`. Caller is responsible
 * for `worker.run()`-style lifecycle and graceful shutdown. Returns null when
 * Redis is not configured (the standalone worker.ts script exits in that case).
 */
export function createEvaluationWorker(
  processor: Processor<EvaluationJobData> = defaultProcessor,
  concurrency = 5
): Worker<EvaluationJobData> | null {
  const connection = getRedisConnection()
  if (!connection) return null

  return new Worker<EvaluationJobData>(EVALUATION_QUEUE_NAME, processor, {
    connection,
    concurrency,
  })
}

const defaultProcessor: Processor<EvaluationJobData> = async (
  job: Job<EvaluationJobData>
) => {
  await processEvaluation(job.data.jobId, job.data.userId)
}
