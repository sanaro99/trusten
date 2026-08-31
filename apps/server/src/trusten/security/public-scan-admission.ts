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
  maxOutstanding: number
  leaseDurationMs: number
  now: number
}
export type PublicScanAdmissionReservationResult =
  | { allowed: true; sessionId: string }
  | {
      allowed: false
      dimension: PublicScanQuotaDimension | 'capacity'
      retryAfterMs: number
    }
/** Atomically reserves all quota dimensions and one execution lease. */
export interface PublicScanAdmissionPersistence {
  reserve(
    reservation: PublicScanAdmissionReservation,
  ): Promise<PublicScanAdmissionReservationResult>
  release(id: string): Promise<boolean>
}
export interface PublicScanAdmissionOptions {
  botVerifier: BotVerifier
  sessionQuota: WindowQuota
  ipQuota: WindowQuota
  domainQuota: WindowQuota
  maxOutstanding: number
  leaseDurationMs?: number
  persistence?: PublicScanAdmissionPersistence
  targetPolicy?: TargetPolicyOptions
  now?: () => number
}
type QuotaEntry = { timestamps: number[] }

/** Deterministic process-local implementation for tests and local development. */
export class InMemoryPublicScanAdmissionPersistence
  implements PublicScanAdmissionPersistence
{
  private readonly knownSessions = new Set<string>()
  private readonly quotas: Record<
    PublicScanQuotaDimension,
    Map<string, QuotaEntry>
  > = {
    session: new Map(),
    ip: new Map(),
    domain: new Map(),
  }
  private readonly leases = new Map<string, number>()

  async reserve(
    r: PublicScanAdmissionReservation,
  ): Promise<PublicScanAdmissionReservationResult> {
    this.expireLeases(r.now)
    const sessionId =
      r.anonymousSession && this.knownSessions.has(r.anonymousSession)
        ? r.anonymousSession
        : r.generatedSessionId
    this.knownSessions.add(sessionId)
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
    if (this.leases.size >= r.maxOutstanding) {
      return { allowed: false, dimension: 'capacity', retryAfterMs: 1_000 }
    }
    for (const check of checks) this.record(check.dimension, check.key, r.now)
    this.leases.set(r.id, r.now + r.leaseDurationMs)
    return { allowed: true, sessionId }
  }

  async release(id: string): Promise<boolean> {
    return this.leases.delete(id)
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
      retryAfterMs: timestamps[0] + quota.windowMs - now,
    }
  }
  private activeTimestamps(
    dimension: PublicScanQuotaDimension,
    key: string,
    windowMs: number,
    now: number,
  ): number[] {
    const map = this.quotas[dimension]
    const entry = map.get(key)
    if (!entry) return []
    entry.timestamps = entry.timestamps.filter(
      (timestamp) => now - timestamp < windowMs,
    )
    if (!entry.timestamps.length) map.delete(key)
    return entry.timestamps
  }
  private record(
    dimension: PublicScanQuotaDimension,
    key: string,
    now: number,
  ): void {
    const entry = this.quotas[dimension].get(key) ?? { timestamps: [] }
    entry.timestamps.push(now)
    this.quotas[dimension].set(key, entry)
  }
  private expireLeases(now: number): void {
    for (const [id, expiresAt] of this.leases)
      if (expiresAt <= now) this.leases.delete(id)
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
      maxOutstanding: this.options.maxOutstanding,
      leaseDurationMs: this.leaseDurationMs,
      now: this.now(),
    })
    if (!result.allowed) {
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
