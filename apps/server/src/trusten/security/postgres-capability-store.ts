import type { SQL } from 'bun'

import { getDb } from '../../lib/db'
import type {
  CapabilityRecord,
  CapabilityStore,
  JobCapabilityScope,
} from './job-capability'

type CapabilityRow = Record<string, unknown>

/** PostgreSQL-backed capability persistence. Token values never enter this store. */
export class PostgreSqlCapabilityStore implements CapabilityStore {
  constructor(private readonly db: SQL = getDb()) {}

  async create(record: CapabilityRecord): Promise<void> {
    await this.db`INSERT INTO trusten_job_capabilities (
      id, kind, job_id, token_hash, scopes, expires_at, revoked_at, consumed_at, created_at
    ) VALUES (
      ${record.id},
      ${record.kind},
      ${record.jobId},
      ${record.tokenHash},
      ${[...record.scopes]},
      ${toDate(record.expiresAt)},
      ${optionalDate(record.revokedAt)},
      ${optionalDate(record.consumedAt)},
      ${toDate(record.createdAt)}
    )`
  }

  async findByTokenHash(tokenHash: string): Promise<CapabilityRecord | null> {
    const [row] = await this.db`SELECT
      id, kind, job_id, token_hash, scopes, expires_at, revoked_at, consumed_at, created_at
      FROM trusten_job_capabilities
      WHERE token_hash = ${tokenHash}
      LIMIT 1`
    return row ? mapCapabilityRow(row) : null
  }

  async revoke(id: string, revokedAt: number): Promise<boolean> {
    const result = await this.db`UPDATE trusten_job_capabilities
      SET revoked_at = ${toDate(revokedAt)}
      WHERE id = ${id} AND revoked_at IS NULL`
    return result.count > 0
  }

  async consumeLiveTicket(
    tokenHash: string,
    jobId: string,
    now: number,
  ): Promise<CapabilityRecord | null> {
    const [row] = await this.db`UPDATE trusten_job_capabilities
      SET consumed_at = ${toDate(now)}
      WHERE token_hash = ${tokenHash}
        AND job_id = ${jobId}
        AND kind = 'live-ticket'
        AND revoked_at IS NULL
        AND consumed_at IS NULL
        AND expires_at > ${toDate(now)}
      RETURNING id, kind, job_id, token_hash, scopes, expires_at, revoked_at, consumed_at, created_at`
    return row ? mapCapabilityRow(row) : null
  }
}

/** Maps Bun's native PostgreSQL timestamp and text-array values to the port. */
export function mapCapabilityRow(row: CapabilityRow): CapabilityRecord {
  return {
    id: text(row.id, 'id'),
    kind: capabilityKind(row.kind),
    jobId: text(row.job_id, 'job_id'),
    tokenHash: text(row.token_hash, 'token_hash'),
    scopes: scopes(row.scopes),
    expiresAt: timestamp(row.expires_at, 'expires_at'),
    revokedAt: optionalTimestamp(row.revoked_at, 'revoked_at'),
    consumedAt: optionalTimestamp(row.consumed_at, 'consumed_at'),
    createdAt: timestamp(row.created_at, 'created_at'),
  }
}

function toDate(milliseconds: number): Date {
  const date = new Date(milliseconds)
  if (!Number.isFinite(milliseconds) || Number.isNaN(date.getTime())) {
    throw new TypeError('Capability timestamps must be finite milliseconds')
  }
  return date
}

function optionalDate(milliseconds: number | undefined): Date | null {
  return milliseconds === undefined ? null : toDate(milliseconds)
}

function timestamp(value: unknown, column: string): number {
  const date = value instanceof Date ? value : new Date(text(value, column))
  const milliseconds = date.getTime()
  if (Number.isNaN(milliseconds)) {
    throw new TypeError(`${column} must be a valid PostgreSQL timestamp`)
  }
  return milliseconds
}

function optionalTimestamp(value: unknown, column: string): number | undefined {
  return value == null ? undefined : timestamp(value, column)
}

function text(value: unknown, column: string): string {
  if (typeof value !== 'string') throw new TypeError(`${column} must be text`)
  return value
}

function capabilityKind(value: unknown): CapabilityRecord['kind'] {
  if (value === 'job' || value === 'live-ticket') return value
  throw new TypeError('kind must be a valid capability kind')
}

function scopes(value: unknown): JobCapabilityScope[] {
  if (
    !Array.isArray(value) ||
    value.some((scope) => typeof scope !== 'string')
  ) {
    throw new TypeError('scopes must be a PostgreSQL text array')
  }
  return value as JobCapabilityScope[]
}
