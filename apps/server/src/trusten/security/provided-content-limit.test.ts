import { describe, expect, test } from 'bun:test'
import {
  ProvidedContentLimiter,
  providedContentLimitsFromEnv,
} from './provided-content-limit'

describe('ProvidedContentLimiter', () => {
  test('enforces every window and reports when the client may retry', () => {
    let now = 0
    const limiter = new ProvidedContentLimiter(
      [
        { limit: 2, windowMs: 1_000 },
        { limit: 3, windowMs: 10_000 },
      ],
      () => now,
    )
    expect(limiter.take('a').allowed).toBe(true)
    expect(limiter.take('a').allowed).toBe(true)
    expect(limiter.take('a')).toEqual({ allowed: false, retryAfterSeconds: 1 })
    expect(limiter.take('b').allowed).toBe(true)
    now = 1_000
    expect(limiter.take('a').allowed).toBe(true)
    expect(limiter.take('a')).toEqual({ allowed: false, retryAfterSeconds: 9 })
    now = 10_000
    expect(limiter.take('a').allowed).toBe(true)
  })

  test('forgets the least recently seen clients beyond its capacity', () => {
    const limiter = new ProvidedContentLimiter(
      [{ limit: 1, windowMs: 60_000 }],
      () => 0,
      2,
    )
    limiter.take('a')
    limiter.take('b')
    limiter.take('c')
    expect(limiter.take('a').allowed).toBe(true)
    expect(limiter.take('c').allowed).toBe(false)
  })

  test('reads positive integer limits from the environment', () => {
    expect(
      providedContentLimitsFromEnv({
        TRUSTEN_EXTENSION_PER_MINUTE: '3',
        TRUSTEN_EXTENSION_PER_HOUR: 'nope',
      }).map((l) => l.limit),
    ).toEqual([3, 60])
  })
})
