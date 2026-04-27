import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  getEvaluationQueue,
  tryEnqueueEvaluation,
} from "./evaluation-queue"
import { _resetRedisConnectionForTests } from "./redis"

const ORIGINAL_URL = process.env.REDIS_URL

describe("evaluation-queue (no-redis paths)", () => {
  beforeEach(() => {
    _resetRedisConnectionForTests()
  })

  afterEach(() => {
    _resetRedisConnectionForTests()
    if (ORIGINAL_URL === undefined) {
      delete process.env.REDIS_URL
    } else {
      process.env.REDIS_URL = ORIGINAL_URL
    }
  })

  it("getEvaluationQueue returns null without REDIS_URL", () => {
    delete process.env.REDIS_URL
    expect(getEvaluationQueue()).toBeNull()
  })

  it("tryEnqueueEvaluation returns false when no queue (caller must fall back)", async () => {
    delete process.env.REDIS_URL
    const ok = await tryEnqueueEvaluation({ jobId: "abc", userId: "u1" })
    expect(ok).toBe(false)
  })
})
