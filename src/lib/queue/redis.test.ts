import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  getRedisConnection,
  _resetRedisConnectionForTests,
} from "./redis"

const ORIGINAL_URL = process.env.REDIS_URL

describe("getRedisConnection", () => {
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

  it("returns null when REDIS_URL is not set", () => {
    delete process.env.REDIS_URL
    expect(getRedisConnection()).toBeNull()
  })

  it("returns null when REDIS_URL is empty", () => {
    process.env.REDIS_URL = ""
    expect(getRedisConnection()).toBeNull()
  })

  // We don't test the connected-singleton path here because instantiating
  // ioredis against a fake URL still returns an instance (it connects lazily),
  // and we don't want this test to require a live Redis. The "returns the same
  // instance across calls" property is covered by integration in the worker.
})
