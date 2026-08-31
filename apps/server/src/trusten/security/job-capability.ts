import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'

export const JOB_CAPABILITY_SCOPES = [
  'status',
  'result',
  'report',
  'artifact',
  'live',
] as const

export type JobCapabilityScope = (typeof JOB_CAPABILITY_SCOPES)[number]

export interface CapabilityRecord {
  id: string
  kind: 'job' | 'live-ticket'
  jobId: string
  tokenHash: string
  scopes: readonly JobCapabilityScope[]
  expiresAt: number
  revokedAt?: number
  consumedAt?: number
  createdAt: number
}

export interface CapabilityStore {
  create(record: CapabilityRecord): Promise<void>
  findByTokenHash(tokenHash: string): Promise<CapabilityRecord | null>
  revoke(id: string, revokedAt: number): Promise<boolean>
  /** Atomically mark a usable live ticket consumed and return it. */
  consumeLiveTicket(
    tokenHash: string,
    jobId: string,
    now: number,
  ): Promise<CapabilityRecord | null>
}

export interface IssuedCapability {
  id: string
  /** Returned once. Persistence receives only `tokenHash`. */
  token: string
  expiresAt: number
}

export type CapabilityAuthorization =
  | { authorized: true; capabilityId: string }
  | { authorized: false; code: 'NOT_AUTHORIZED' }

export interface JobCapabilityOptions {
  store: CapabilityStore
  /** Deployment secret used to HMAC tokens. Must contain at least 256 bits. */
  hashKey: string | Uint8Array
  capabilityTtlMs?: number
  liveTicketTtlMs?: number
  now?: () => number
}

/** Capability issuance and authorization for anonymous job resources. */
export class JobCapabilityAccess {
  private readonly now: () => number
  private readonly hashKey: string | Uint8Array
  private readonly capabilityTtlMs: number
  private readonly liveTicketTtlMs: number

  constructor(private readonly options: JobCapabilityOptions) {
    const keyBytes =
      typeof options.hashKey === 'string'
        ? Buffer.from(options.hashKey, 'utf8')
        : Buffer.from(options.hashKey)
    if (keyBytes.byteLength < 32)
      throw new TypeError('hashKey must contain at least 32 bytes')

    this.hashKey = options.hashKey
    this.now = options.now ?? Date.now
    this.capabilityTtlMs = positiveDuration(
      'capabilityTtlMs',
      options.capabilityTtlMs ?? 24 * 60 * 60 * 1_000,
    )
    this.liveTicketTtlMs = positiveDuration(
      'liveTicketTtlMs',
      options.liveTicketTtlMs ?? 60_000,
    )
    if (this.liveTicketTtlMs > 5 * 60_000) {
      throw new TypeError('liveTicketTtlMs must not exceed 5 minutes')
    }
  }

  async issue(
    jobId: string,
    scopes: readonly JobCapabilityScope[] = JOB_CAPABILITY_SCOPES,
  ): Promise<IssuedCapability> {
    const normalizedScopes = validateScopes(scopes)
    const now = this.now()
    const token = opaqueToken()
    const record: CapabilityRecord = {
      id: randomUUID(),
      kind: 'job',
      jobId,
      tokenHash: this.hash(token),
      scopes: normalizedScopes,
      createdAt: now,
      expiresAt: now + this.capabilityTtlMs,
    }
    await this.options.store.create(record)
    return { id: record.id, token, expiresAt: record.expiresAt }
  }

  async authorize(
    jobId: string,
    token: string,
    scope: JobCapabilityScope,
  ): Promise<CapabilityAuthorization> {
    const tokenHash = this.hash(token)
    const record = await this.options.store.findByTokenHash(tokenHash)
    if (!this.isUsable(record, tokenHash, jobId, scope, 'job')) {
      return { authorized: false, code: 'NOT_AUTHORIZED' }
    }
    return { authorized: true, capabilityId: record.id }
  }

  async revoke(capabilityId: string): Promise<boolean> {
    return this.options.store.revoke(capabilityId, this.now())
  }

  async issueLiveTicket(
    jobId: string,
    capabilityToken: string,
  ): Promise<IssuedCapability | null> {
    const authorization = await this.authorize(jobId, capabilityToken, 'live')
    if (!authorization.authorized) return null

    const now = this.now()
    const token = opaqueToken()
    const record: CapabilityRecord = {
      id: randomUUID(),
      kind: 'live-ticket',
      jobId,
      tokenHash: this.hash(token),
      scopes: ['live'],
      createdAt: now,
      expiresAt: now + this.liveTicketTtlMs,
    }
    await this.options.store.create(record)
    return { id: record.id, token, expiresAt: record.expiresAt }
  }

  async consumeLiveTicket(
    jobId: string,
    token: string,
  ): Promise<CapabilityAuthorization> {
    const tokenHash = this.hash(token)
    const record = await this.options.store.consumeLiveTicket(
      tokenHash,
      jobId,
      this.now(),
    )
    if (!this.isUsable(record, tokenHash, jobId, 'live', 'live-ticket')) {
      return { authorized: false, code: 'NOT_AUTHORIZED' }
    }
    return { authorized: true, capabilityId: record.id }
  }

  private isUsable(
    record: CapabilityRecord | null,
    suppliedHash: string,
    jobId: string,
    scope: JobCapabilityScope,
    kind: CapabilityRecord['kind'],
  ): record is CapabilityRecord {
    if (!record) return false
    const expected = Buffer.from(record.tokenHash, 'hex')
    const supplied = Buffer.from(suppliedHash, 'hex')
    const hashMatches =
      expected.byteLength === supplied.byteLength &&
      timingSafeEqual(expected, supplied)
    return (
      hashMatches &&
      record.kind === kind &&
      record.jobId === jobId &&
      record.scopes.includes(scope) &&
      record.expiresAt > this.now() &&
      record.revokedAt === undefined &&
      (kind !== 'live-ticket' || record.consumedAt !== undefined)
    )
  }

  private hash(token: string): string {
    return createHmac('sha256', this.hashKey)
      .update(token, 'utf8')
      .digest('hex')
  }
}

/** Process-local adapter for tests and single-process development. */
export class InMemoryCapabilityStore implements CapabilityStore {
  private readonly recordsById = new Map<string, CapabilityRecord>()
  private readonly idsByHash = new Map<string, string>()

  async create(record: CapabilityRecord): Promise<void> {
    if (
      this.recordsById.has(record.id) ||
      this.idsByHash.has(record.tokenHash)
    ) {
      throw new Error('Capability already exists')
    }
    const copy = cloneRecord(record)
    this.recordsById.set(copy.id, copy)
    this.idsByHash.set(copy.tokenHash, copy.id)
  }

  async findByTokenHash(tokenHash: string): Promise<CapabilityRecord | null> {
    const id = this.idsByHash.get(tokenHash)
    const record = id ? this.recordsById.get(id) : undefined
    return record ? cloneRecord(record) : null
  }

  async revoke(id: string, revokedAt: number): Promise<boolean> {
    const record = this.recordsById.get(id)
    if (!record || record.revokedAt !== undefined) return false
    record.revokedAt = revokedAt
    return true
  }

  async consumeLiveTicket(
    tokenHash: string,
    jobId: string,
    now: number,
  ): Promise<CapabilityRecord | null> {
    const id = this.idsByHash.get(tokenHash)
    const record = id ? this.recordsById.get(id) : undefined
    if (
      !record ||
      record.kind !== 'live-ticket' ||
      record.jobId !== jobId ||
      record.revokedAt !== undefined ||
      record.consumedAt !== undefined ||
      record.expiresAt <= now
    ) {
      return null
    }
    record.consumedAt = now
    return cloneRecord(record)
  }

  /** Test inspection only; returns defensive copies. */
  records(): CapabilityRecord[] {
    return [...this.recordsById.values()].map(cloneRecord)
  }
}

function opaqueToken(): string {
  return randomBytes(32).toString('base64url')
}

function validateScopes(
  scopes: readonly JobCapabilityScope[],
): JobCapabilityScope[] {
  const normalized = [...new Set(scopes)]
  if (normalized.length === 0)
    throw new TypeError('At least one capability scope is required')
  if (normalized.some((scope) => !JOB_CAPABILITY_SCOPES.includes(scope))) {
    throw new TypeError('Unknown capability scope')
  }
  return normalized
}

function positiveDuration(name: string, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new TypeError(`${name} must be positive`)
  }
  return duration
}

function cloneRecord(record: CapabilityRecord): CapabilityRecord {
  return { ...record, scopes: [...record.scopes] }
}
