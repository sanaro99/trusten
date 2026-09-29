import { randomBytes, randomUUID } from 'node:crypto'
import type { BotVerifier } from './bot-verifier'
import {
  type AuthorizedTarget,
  authorizeTarget,
  TargetPolicyError,
  type TargetPolicyOptions,
} from './target-policy'

export type PublicScanKind = 'quick' | 'audit'
export type PublicScanQuotaDimension = 'session' | 'ip' | 'domain'
export interface PublicScanAdmissionRequest {
  kind: PublicScanKind
  target: string
  domain: string
  turnstileToken?: string
  anonymousSession?: string
  clientIp: string
}
export interface PublicScanAdmissionGrant {
  id: string
  sessionId: string
  target: AuthorizedTarget
}
export type PublicScanAdmissionErrorCode =
  | 'TARGET_REJECTED'
  | 'DOMAIN_MISMATCH'
  | 'BOT_REJECTED'
  | 'BOT_UNAVAILABLE'
  | 'SESSION_QUOTA_EXCEEDED'
  | 'IP_QUOTA_EXCEEDED'
  | 'DOMAIN_QUOTA_EXCEEDED'
  | 'SCAN_RETRY_LIMITED'
  | 'DEMO_BUSY'
export class PublicScanAdmissionError extends Error {
  constructor(
    readonly code: PublicScanAdmissionErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'PublicScanAdmissionError'
  }
}
export interface WindowQuota {
  limit: number
  windowMs: number
}
export interface PublicScanAdmissionReservation {
  id: string
  anonymousSession?: string
  generatedSessionId: string
  clientIp: string
  domain: string
  sessionQuota: WindowQuota
  ipQuota: WindowQuota
  domainQuota: WindowQuota
  attemptQuota?: WindowQuota
  maxOutstanding: number
  leaseDurationMs: number
  now: number
}
export type PublicScanAdmissionReservationResult =
  | { allowed: true; sessionId: string }
  | {
      allowed: false
      dimension: PublicScanQuotaDimension | 'capacity' | 'retry'
      retryAfterMs: number
    }
/** Atomically reserves all quota dimensions and one execution lease. */
export interface PublicScanAdmissionPersistence {
  reserve(
    reservation: PublicScanAdmissionReservation,
  ): Promise<PublicScanAdmissionReservationResult>
  release(id: string, refundQuota?: boolean): Promise<boolean>
}
export interface PublicScanAdmissionOptions {
  botVerifier: BotVerifier
  sessionQuota: WindowQuota
  ipQuota: WindowQuota
  domainQuota: WindowQuota
  attemptQuota?: WindowQuota
  maxOutstanding: number
  leaseDurationMs?: number
  persistence?: PublicScanAdmissionPersistence
  targetPolicy?: TargetPolicyOptions
  now?: () => number
}
type QuotaEvent = { id: string; at: number }
type QuotaEntry = { timestamps: QuotaEvent[] }
export const DEFAULT_ATTEMPT_QUOTA: WindowQuota = { limit: 10, windowMs: 60000 }

/** Deterministic process-local implementation for tests and local development. */
export class InMemoryPublicScanAdmissionPersistence
  implements PublicScanAdmissionPersistence
{
  private readonly knownSessions = new Set<string>()
  private readonly attempts = new Map<string, number[]>()
  private readonly quotas: Record<
    PublicScanQuotaDimension,
    Map<string, QuotaEntry>
  > = {
    session: new Map(),
    ip: new Map(),
    domain: new Map(),
  }
  private readonly leases = new Map<
    string,
    {
      expiresAt: number
      refundExpiresAt: number
      keys: Record<PublicScanQuotaDimension, string>
    }
  >()

  async reserve(
    r: PublicScanAdmissionReservation,
  ): Promise<PublicScanAdmissionReservationResult> {
    this.expireLeases(r.now)
    const sessionId =
      r.anonymousSession && this.knownSessions.has(r.anonymousSession)
        ? r.anonymousSession
        : r.generatedSessionId
    const checks = [
      this.checkQuota('session', sessionId, r.sessionQuota, r.now),
      this.checkQuota('ip', r.clientIp, r.ipQuota, r.now),
      this.checkQuota('domain', r.domain, r.domainQuota, r.now),
    ] as const
    for (const check of checks) {
      if (!check.allowed)
        return {
          allowed: false,
          dimension: check.dimension,
          retryAfterMs: check.retryAfterMs,
        }
    }
    const attemptQuota = r.attemptQuota ?? DEFAULT_ATTEMPT_QUOTA
    const attempts = (this.attempts.get(r.clientIp) ?? []).filter(
      (at) => r.now - at < attemptQuota.windowMs,
    )
    this.attempts.set(r.clientIp, attempts)
    if (attempts.length >= attemptQuota.limit)
      return {
        allowed: false,
        dimension: 'retry',
        retryAfterMs: attempts[0] + attemptQuota.windowMs - r.now,
      }
    const outstanding = [...this.leases.values()].filter(
      (lease) => lease.expiresAt > r.now,
    ).length
    if (outstanding >= r.maxOutstanding) {
      return { allowed: false, dimension: 'capacity', retryAfterMs: 1_000 }
    }
    attempts.push(r.now)
    this.knownSessions.add(sessionId)
    for (const check of checks)
      this.record(check.dimension, check.key, r.now, r.id)
    this.leases.set(r.id, {
      expiresAt: r.now + r.leaseDurationMs,
      refundExpiresAt:
        r.now +
        Math.max(
          r.sessionQuota.windowMs,
          r.ipQuota.windowMs,
          r.domainQuota.windowMs,
        ),
      keys: { session: sessionId, ip: r.clientIp, domain: r.domain },
    })
    return { allowed: true, sessionId }
  }

  async release(id: string, refundQuota = false): Promise<boolean> {
    const lease = this.leases.get(id)
    if (!lease) return false
    this.leases.delete(id)
    if (refundQuota) {
      for (const dimension of ['session', 'ip', 'domain'] as const) {
        const entry = this.quotas[dimension].get(lease.keys[dimension])
        if (entry)
          entry.timestamps = entry.timestamps.filter((event) => event.id !== id)
      }
    }
    return true
  }

  private checkQuota(
    dimension: PublicScanQuotaDimension,
    key: string,
    quota: WindowQuota,
    now: number,
  ):
    | { allowed: true; dimension: PublicScanQuotaDimension; key: string }
    | {
        allowed: false
        dimension: PublicScanQuotaDimension
        key: string
        retryAfterMs: number
      } {
    const timestamps = this.activeTimestamps(
      dimension,
      key,
      quota.windowMs,
      now,
    )
    if (timestamps.length < quota.limit)
      return { allowed: true, dimension, key }
    return {
      allowed: false,
      dimension,
      key,
      retryAfterMs: timestamps[0].at + quota.windowMs - now,
    }
  }
  private activeTimestamps(
    dimension: PublicScanQuotaDimension,
    key: string,
    windowMs: number,
    now: number,
  ): QuotaEvent[] {
    const map = this.quotas[dimension]
    const entry = map.get(key)
    if (!entry) return []
    entry.timestamps = entry.timestamps.filter(
      (event) => now - event.at < windowMs,
    )
    if (!entry.timestamps.length) map.delete(key)
    return entry.timestamps
  }
  private record(
    dimension: PublicScanQuotaDimension,
    key: string,
    now: number,
    id: string,
  ): void {
    const entry = this.quotas[dimension].get(key) ?? { timestamps: [] }
    entry.timestamps.push({ id, at: now })
    this.quotas[dimension].set(key, entry)
  }
  private expireLeases(now: number): void {
    // Capacity can expire while the scan is still running. Retain its
    // cancellation ownership for as long as its allowance is counted.
    for (const [id, lease] of this.leases)
      if (lease.expiresAt <= now && lease.refundExpiresAt <= now)
        this.leases.delete(id)
  }
}

export class PublicScanAdmission {
  private readonly now: () => number
  private readonly persistence: PublicScanAdmissionPersistence
  private readonly leaseDurationMs: number
  constructor(private readonly options: PublicScanAdmissionOptions) {
    validateOptions(options)
    this.now = options.now ?? Date.now
    this.leaseDurationMs = options.leaseDurationMs ?? 15 * 60_000
    this.persistence =
      options.persistence ?? new InMemoryPublicScanAdmissionPersistence()
  }
  async admit(
    request: PublicScanAdmissionRequest,
  ): Promise<PublicScanAdmissionGrant> {
    let target: AuthorizedTarget
    try {
      target = await authorizeTarget(request.target, this.options.targetPolicy)
    } catch (cause) {
      if (cause instanceof TargetPolicyError) {
        throw new PublicScanAdmissionError(
          'TARGET_REJECTED',
          'The requested target is not allowed',
          undefined,
          cause,
        )
      }
      throw cause
    }
    const domain = normalizeDomain(request.domain)
    if (!domain || domain !== target.hostname) {
      throw new PublicScanAdmissionError(
        'DOMAIN_MISMATCH',
        'The supplied domain does not match the authorized target',
      )
    }
    const bot = await this.options.botVerifier.verify({
      token: request.turnstileToken ?? '',
      remoteIp: request.clientIp,
    })
    if (!bot.verified) {
      if (bot.reason === 'unavailable')
        throw new PublicScanAdmissionError(
          'BOT_UNAVAILABLE',
          'Bot verification is temporarily unavailable',
        )
      throw new PublicScanAdmissionError(
        'BOT_REJECTED',
        'Bot verification failed',
      )
    }
    const id = randomUUID()
    const result = await this.persistence.reserve({
      id,
      anonymousSession: request.anonymousSession,
      generatedSessionId: randomBytes(32).toString('base64url'),
      clientIp: request.clientIp,
      domain,
      sessionQuota: this.options.sessionQuota,
      ipQuota: this.options.ipQuota,
      domainQuota: this.options.domainQuota,
      attemptQuota: this.options.attemptQuota,
      maxOutstanding: this.options.maxOutstanding,
      leaseDurationMs: this.leaseDurationMs,
      now: this.now(),
    })
    if (!result.allowed) {
      if (result.dimension === 'retry')
        throw new PublicScanAdmissionError(
          'SCAN_RETRY_LIMITED',
          'Too many recent scan attempts',
          Math.max(1, Math.ceil(result.retryAfterMs / 1000)),
        )
      if (result.dimension === 'capacity')
        throw new PublicScanAdmissionError(
          'DEMO_BUSY',
          'The public demo is busy',
          1,
        )
      throw new PublicScanAdmissionError(
        quotaErrorCode(result.dimension),
        `${result.dimension} scan quota exceeded`,
        Math.max(1, Math.ceil(result.retryAfterMs / 1_000)),
      )
    }
    return { id, sessionId: result.sessionId, target }
  }
  release(id: string): Promise<boolean> {
    return this.persistence.release(id).catch(() => false)
  }
  /** A failed check releases capacity and refunds its own reserved allowance. */
  cancel(id: string): Promise<boolean> {
    return this.persistence.release(id, true).catch(() => false)
  }
}
function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, '')
}
function quotaErrorCode(
  dimension: PublicScanQuotaDimension,
): PublicScanAdmissionErrorCode {
  if (dimension === 'session') return 'SESSION_QUOTA_EXCEEDED'
  if (dimension === 'ip') return 'IP_QUOTA_EXCEEDED'
  return 'DOMAIN_QUOTA_EXCEEDED'
}
function validateOptions(options: PublicScanAdmissionOptions): void {
  for (const [name, quota] of [
    ['sessionQuota', options.sessionQuota],
    ['ipQuota', options.ipQuota],
    ['domainQuota', options.domainQuota],
    ['attemptQuota', options.attemptQuota ?? DEFAULT_ATTEMPT_QUOTA],
  ] as const) {
    if (!Number.isInteger(quota.limit) || quota.limit < 1)
      throw new TypeError(`${name}.limit must be a positive integer`)
    if (!Number.isFinite(quota.windowMs) || quota.windowMs <= 0)
      throw new TypeError(`${name}.windowMs must be positive`)
  }
  if (!Number.isInteger(options.maxOutstanding) || options.maxOutstanding < 1)
    throw new TypeError('maxOutstanding must be a positive integer')
  if (
    options.leaseDurationMs !== undefined &&
    (!Number.isFinite(options.leaseDurationMs) || options.leaseDurationMs <= 0)
  )
    throw new TypeError('leaseDurationMs must be positive')
}
