/**
 * Standalone evaluation worker.
 *
 * Run with `npm run worker` (which uses tsx). Long-lived process — connects
 * to Redis, pulls evaluation jobs from the BullMQ queue, runs `processEvaluation`
 * with the configured concurrency. Exits cleanly on SIGINT / SIGTERM.
 *
 * If `REDIS_URL` is not set, exits with a helpful message — there's no point
 * running the worker without a queue to consume.
 */
import "dotenv/config"
import { createEvaluationWorker } from "@/lib/queue/evaluation-queue"

const concurrency = Number(process.env.WORKER_CONCURRENCY) || 5

const maybeWorker = createEvaluationWorker(undefined, concurrency)

if (!maybeWorker) {
  console.error(
    "[worker] REDIS_URL is not set — there's no queue to consume from. Set REDIS_URL and try again."
  )
  process.exit(1)
}

// After the early-exit `process.exit` (which TS doesn't model as `never` here),
// reassign to a non-nullable local for the rest of the script.
const worker = maybeWorker

console.log(
  `[worker] evaluation worker started; concurrency=${concurrency}; pid=${process.pid}`
)

worker.on("completed", (job) => {
  console.log(`[worker] ✓ ${job.id} (job ${job.data.jobId})`)
})

worker.on("failed", (job, err) => {
  console.error(`[worker] ✗ ${job?.id} (job ${job?.data.jobId}):`, err.message)
})

async function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, draining...`)
  try {
    await worker.close()
  } catch (err) {
    console.error("[worker] error during shutdown:", err)
  }
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
