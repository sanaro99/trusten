import { describe, expect, test } from 'bun:test'
import type { SQL } from 'bun'
import { PostgresPublicScanAdmissionPersistence } from './postgres-public-scan-admission'
import type { PublicScanAdmissionReservation } from './public-scan-admission'

type SqlTag = ((
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>) & {
  begin<T>(callback: (tx: SqlTag) => Promise<T>): Promise<T>
}

function recordingSql(quotaCounts: number[]) {
  const statements: string[] = []
  const sql = (async (strings: TemplateStringsArray) => {
    const statement = strings.join('?').replace(/\s+/g, ' ').trim()
    statements.push(statement)
    if (
      statement.startsWith('SELECT COUNT(*)') &&
      statement.includes('FROM trusten_public_scan_quota_events')
    ) {
      return [{ count: quotaCounts.shift() ?? 0, oldest: null }]
    }
    if (
      statement.startsWith('SELECT COUNT(*)') &&
      statement.includes('FROM trusten_public_scan_leases')
    ) {
      return [{ count: 0 }]
    }
    if (statement.includes('RETURNING id')) return [{ id: 'lease-1' }]
    return []
  }) as SqlTag
  sql.begin = async <T>(callback: (tx: SqlTag) => Promise<T>) => callback(sql)
  return { sql: sql as unknown as SQL, statements }
}

function reservation(
  overrides: Partial<PublicScanAdmissionReservation> = {},
): PublicScanAdmissionReservation {
  return {
    id: 'lease-1',
    generatedSessionId: 'session-1',
    clientIp: '203.0.113.10',
    domain: 'example.com',
    sessionQuota: { limit: 2, windowMs: 60_000 },
    ipQuota: { limit: 2, windowMs: 60_000 },
    domainQuota: { limit: 2, windowMs: 60_000 },
    maxOutstanding: 2,
    leaseDurationMs: 30_000,
    now: 1_000,
    ...overrides,
  }
}

describe('PostgresPublicScanAdmissionPersistence', () => {
  test('does not write quota events or a lease when any dimension rejects', async () => {
    const { sql, statements } = recordingSql([2])
    const store = new PostgresPublicScanAdmissionPersistence(sql)

    await expect(store.reserve(reservation())).resolves.toEqual({
      allowed: false,
      dimension: 'session',
      retryAfterMs: 60_000,
    })
    expect(
      statements.some((statement) =>
        statement.includes('pg_advisory_xact_lock'),
      ),
    ).toBe(true)
    expect(
      statements.some((statement) =>
        statement.startsWith('INSERT INTO trusten_public_scan_quota_events'),
      ),
    ).toBe(false)
    expect(
      statements.some((statement) =>
        statement.startsWith('INSERT INTO trusten_public_scan_leases'),
      ),
    ).toBe(false)
  })

  test('writes all quota dimensions and an expiring lease after checks pass', async () => {
    const { sql, statements } = recordingSql([0, 0, 0])
    const store = new PostgresPublicScanAdmissionPersistence(sql)

    await expect(store.reserve(reservation())).resolves.toEqual({
      allowed: true,
      sessionId: 'session-1',
    })
    expect(
      statements.filter((statement) =>
        statement.startsWith('INSERT INTO trusten_public_scan_quota_events'),
      ),
    ).toHaveLength(3)
    expect(
      statements.some((statement) =>
        statement.startsWith('INSERT INTO trusten_public_scan_leases'),
      ),
    ).toBe(true)
    await expect(store.release('lease-1')).resolves.toBe(true)
  })
})
