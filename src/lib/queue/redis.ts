/**
 * Shared Redis connection for BullMQ. Lazy + optional:
 *   - Returns the same `IORedis` instance across calls (singleton).
 *   - Returns null if `REDIS_URL` is not set, so the rest of the app can fall
 *     back to direct execution without crashing at boot.
 *
 * BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck: false` on
 * the connection used by Workers — we set both here so any consumer (Queue,
 * Worker, QueueEvents) can share the connection safely.
 */
import IORedis, { type Redis } from "ioredis"

let connection: Redis | null = null

export function getRedisConnection(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (connection) return connection

  try {
    connection = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
    connection.on("error", (err) => {
      // Soft-log; one-off transient errors shouldn't crash callers.
      console.warn("[redis] connection error:", err.message)
    })
    return connection
  } catch (err) {
    console.warn(
      "[redis] could not initialise connection from REDIS_URL:",
      err instanceof Error ? err.message : String(err)
    )
    return null
  }
}

/** Reset the cached connection (used by tests; safe to call from anywhere). */
export function _resetRedisConnectionForTests(): void {
  if (connection) {
    void connection.quit().catch(() => {})
  }
  connection = null
}
