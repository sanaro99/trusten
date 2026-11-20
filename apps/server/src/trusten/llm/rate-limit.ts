/**
 * Trusten LLM rate limiting
 *
 * Keeps AI requests inside free-tier limits: a small per-provider queue,
 * pacing to each provider's requests-per-minute, and waits that honor a 429's
 * Retry-After (or the wait named in its body) before trying again.
 */

import type { TrustenLLMProvider } from '../types'

/**
 * A page check fires several analyzers at once, and a full check visits many
 * pages, which used to burst past free-tier rate limits. Requests to one
 * provider are queued to this many at a time.
 */
const LLM_CONCURRENCY = Math.max(
  1,
  Number(process.env.TRUSTEN_LLM_CONCURRENCY ?? 3),
)
/** Longest single wait a rate-limited (429) request will sit out. */
const LLM_RATE_LIMIT_WAIT_MS = Number(
  process.env.TRUSTEN_LLM_RATE_LIMIT_WAIT_MS ?? 60_000,
)
/** How many times one request waits out a 429 before trying the next provider. */
const LLM_RATE_LIMIT_RETRIES = Math.max(
  0,
  Number(process.env.TRUSTEN_LLM_RATE_LIMIT_RETRIES ?? 4),
)
/** First backoff when a 429 response gives no Retry-After; doubles each time. */
const DEFAULT_RATE_LIMIT_PAUSE_MS = 5_000
const RATE_WINDOW_MS = 60_000
/**
 * Requests per minute each provider's free tier allows. Requests are paced to
 * stay under it, so a scan waits briefly instead of collecting 429s.
 * TRUSTEN_LLM_RPM overrides this for every provider (0 turns pacing off).
 */
const FREE_TIER_RPM: Record<TrustenLLMProvider, number> = {
  cloudflare: 300,
  groq: 30,
  gemini: 10,
  'nvidia-nim': 40,
  openrouter: 20,
  ollama: 0,
}

function requestsPerMinute(provider: TrustenLLMProvider): number {
  const override = process.env.TRUSTEN_LLM_RPM
  if (override !== undefined && override.trim() !== '') {
    const value = Number(override)
    if (Number.isFinite(value) && value >= 0) return value
  }
  return FREE_TIER_RPM[provider]
}

/** Queue and rate-limit settings; tests pass small values and a fake clock. */
export interface TrustenLLMLimits {
  concurrency: number
  /** Requests per rolling minute for a provider; 0 means no pacing. */
  requestsPerMinute: (provider: TrustenLLMProvider) => number
  rateLimitRetries: number
  rateLimitMaxWaitMs: number
  rateLimitBaseWaitMs: number
  now: () => number
  sleep: (ms: number) => Promise<void>
}

export function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

/**
 * Some providers (Gemini, Groq) put the wait in the error body instead of a
 * Retry-After header: `"retryDelay": "37s"` or "Please try again in 7.5s".
 */
export function retryDelayFromBody(body: string): number | undefined {
  const match =
    body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/) ??
    body.match(/try again in\s+(?:(\d+)m)?(\d+(?:\.\d+)?)(ms|s)\b/i)
  if (!match) return undefined
  if (match.length === 2) return Math.ceil(Number(match[1]) * 1000)
  const minutes = Number(match[1] ?? 0)
  const amount = Number(match[2])
  const ms = match[3].toLowerCase() === 'ms' ? amount : amount * 1000
  return Math.ceil(minutes * 60_000 + ms)
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Per-provider request gate: a few requests at a time, paced to the provider's
 * per-minute budget, and held back together while a 429 pause runs.
 */
export class ProviderGate {
  readonly limits: TrustenLLMLimits
  private readonly inFlight = new Map<TrustenLLMProvider, number>()
  private readonly queued = new Map<TrustenLLMProvider, Array<() => void>>()
  private readonly pausedUntil = new Map<TrustenLLMProvider, number>()
  private readonly recentStarts = new Map<TrustenLLMProvider, number[]>()

  constructor(limits?: Partial<TrustenLLMLimits>) {
    this.limits = {
      concurrency: LLM_CONCURRENCY,
      requestsPerMinute,
      rateLimitRetries: LLM_RATE_LIMIT_RETRIES,
      rateLimitMaxWaitMs: LLM_RATE_LIMIT_WAIT_MS,
      rateLimitBaseWaitMs: DEFAULT_RATE_LIMIT_PAUSE_MS,
      now: Date.now,
      sleep: wait,
      ...limits,
    }
  }

  /**
   * Wait for a free request slot on a provider, then for any rate-limit pause
   * and for room in the provider's per-minute budget.
   */
  async acquire(provider: TrustenLLMProvider): Promise<void> {
    while ((this.inFlight.get(provider) ?? 0) >= this.limits.concurrency) {
      await new Promise<void>((resolve) => {
        const queue = this.queued.get(provider) ?? []
        queue.push(resolve)
        this.queued.set(provider, queue)
      })
    }
    this.inFlight.set(provider, (this.inFlight.get(provider) ?? 0) + 1)
    for (;;) {
      const pause = (this.pausedUntil.get(provider) ?? 0) - this.limits.now()
      const delay = pause > 0 ? pause : this.reserveRequest(provider)
      if (delay <= 0) return
      await this.limits.sleep(delay)
    }
  }

  /**
   * Book a request in the provider's rolling one-minute window. Returns 0 when
   * booked, otherwise how long until the oldest booking leaves the window.
   * Checking and booking happen together, so parallel callers cannot overbook.
   */
  private reserveRequest(provider: TrustenLLMProvider): number {
    const rpm = this.limits.requestsPerMinute(provider)
    if (!(rpm > 0)) return 0
    const now = this.limits.now()
    const starts = (this.recentStarts.get(provider) ?? []).filter(
      (at) => now - at < RATE_WINDOW_MS,
    )
    this.recentStarts.set(provider, starts)
    if (starts.length < rpm) {
      starts.push(now)
      return 0
    }
    return Math.max(1, starts[0] + RATE_WINDOW_MS - now)
  }

  release(provider: TrustenLLMProvider): void {
    this.inFlight.set(
      provider,
      Math.max(0, (this.inFlight.get(provider) ?? 1) - 1),
    )
    this.queued.get(provider)?.shift()?.()
  }

  /** Hold back every request to a provider until the pause ends. */
  pause(provider: TrustenLLMProvider, ms: number): void {
    this.pausedUntil.set(
      provider,
      Math.max(this.pausedUntil.get(provider) ?? 0, this.limits.now() + ms),
    )
  }

  /**
   * How long to sit out a 429, or undefined to give up on this provider. The
   * provider's own wait wins; otherwise the wait doubles each time. A wait past
   * the limit (such as a daily quota) moves on to the next provider instead.
   */
  rateLimitWait(
    retryAfter: number | undefined,
    waitsSoFar: number,
  ): number | undefined {
    const pause =
      retryAfter ?? this.limits.rateLimitBaseWaitMs * 2 ** waitsSoFar
    if (
      waitsSoFar >= this.limits.rateLimitRetries ||
      pause > this.limits.rateLimitMaxWaitMs
    )
      return undefined
    return pause
  }
}
