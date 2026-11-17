/**
 * Per-client limits for extension-submitted page content.
 *
 * The extension cannot show a Turnstile challenge, so `/api/analyze-page`
 * cannot go through public scan admission. Each request still runs every
 * analyzer and may call a vision model, so cap how often one client can
 * submit. Results never reach public history (see migration 008), so this
 * only bounds cost, not trust.
 *
 * In-memory and per process, like the per-domain scan rate limiter.
 */

export interface WindowLimit {
  limit: number
  windowMs: number
}

export type ProvidedContentDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

export const DEFAULT_PROVIDED_CONTENT_LIMITS: WindowLimit[] = [
  { limit: 10, windowMs: 60_000 },
  { limit: 60, windowMs: 60 * 60_000 },
]

/** Reads `TRUSTEN_EXTENSION_PER_MINUTE` / `TRUSTEN_EXTENSION_PER_HOUR`. */
export function providedContentLimitsFromEnv(
  env: Record<string, string | undefined> = process.env,
): WindowLimit[] {
  const read = (value: string | undefined, fallback: number) => {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
  }
  const [minute, hour] = DEFAULT_PROVIDED_CONTENT_LIMITS
  return [
    {
      limit: read(env.TRUSTEN_EXTENSION_PER_MINUTE, minute.limit),
      windowMs: minute.windowMs,
    },
    {
      limit: read(env.TRUSTEN_EXTENSION_PER_HOUR, hour.limit),
      windowMs: hour.windowMs,
    },
  ]
}

export class ProvidedContentLimiter {
  private readonly hits = new Map<string, number[]>()
  private readonly longestWindowMs: number

  constructor(
    private readonly limits: WindowLimit[] = DEFAULT_PROVIDED_CONTENT_LIMITS,
    private readonly now: () => number = Date.now,
    private readonly maxClients = 50_000,
  ) {
    if (limits.length === 0) throw new Error('At least one limit is required')
    this.longestWindowMs = Math.max(...limits.map((l) => l.windowMs))
  }

  /** Records the request when allowed; a refused request is not counted. */
  take(client: string): ProvidedContentDecision {
    const now = this.now()
    const recent = (this.hits.get(client) ?? []).filter(
      (at) => now - at < this.longestWindowMs,
    )
    let retryAfterMs = 0
    for (const { limit, windowMs } of this.limits) {
      const inWindow = recent.filter((at) => now - at < windowMs)
      if (inWindow.length >= limit)
        retryAfterMs = Math.max(
          retryAfterMs,
          inWindow[inWindow.length - limit] + windowMs - now,
        )
    }
    if (retryAfterMs > 0) {
      this.hits.set(client, recent)
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      }
    }
    recent.push(now)
    this.hits.delete(client)
    this.hits.set(client, recent)
    this.evict()
    return { allowed: true }
  }

  /** Map order is least-recently-used first, so drop clients from the front. */
  private evict(): void {
    for (const client of this.hits.keys()) {
      if (this.hits.size <= this.maxClients) break
      this.hits.delete(client)
    }
  }
}
