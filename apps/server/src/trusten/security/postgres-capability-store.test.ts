import { describe, expect, test } from 'bun:test'
import type { SQL } from 'bun'

import {
  mapCapabilityRow,
  PostgreSqlCapabilityStore,
} from './postgres-capability-store'

describe('PostgreSqlCapabilityStore', () => {
  test('maps PostgreSQL dates to epoch milliseconds and nulls to undefined', () => {
    expect(
      mapCapabilityRow({
        id: 'cap-1',
        kind: 'live-ticket',
        job_id: 'job-1',
        token_hash: 'a'.repeat(64),
        scopes: ['live'],
        expires_at: new Date('2026-01-01T00:01:00.000Z'),
        revoked_at: null,
        consumed_at: '2026-01-01T00:00:30.000Z',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).toEqual({
      id: 'cap-1',
      kind: 'live-ticket',
      jobId: 'job-1',
      tokenHash: 'a'.repeat(64),
      scopes: ['live'],
      expiresAt: Date.parse('2026-01-01T00:01:00.000Z'),
      consumedAt: Date.parse('2026-01-01T00:00:30.000Z'),
      createdAt: Date.parse('2026-01-01T00:00:00.000Z'),
    })
  })

  test('uses a conditional update with RETURNING for atomic ticket consumption', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const sql = Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ sql: strings.join('?'), values })
        return Promise.resolve([
          {
            id: 'ticket-1',
            kind: 'live-ticket',
            job_id: 'job-1',
            token_hash: 'b'.repeat(64),
            scopes: ['live'],
            expires_at: new Date('2026-01-01T00:01:00.000Z'),
            revoked_at: null,
            consumed_at: new Date('2026-01-01T00:00:30.000Z'),
            created_at: new Date('2026-01-01T00:00:00.000Z'),
          },
        ])
      },
      { close: async () => {} },
    ) as unknown as SQL
    const store = new PostgreSqlCapabilityStore(sql)

    const result = await store.consumeLiveTicket(
      'b'.repeat(64),
      'job-1',
      Date.parse('2026-01-01T00:00:30.000Z'),
    )

    expect(result?.consumedAt).toBe(Date.parse('2026-01-01T00:00:30.000Z'))
    expect(calls[0]?.sql).toContain('consumed_at IS NULL')
    expect(calls[0]?.sql).toContain('expires_at > ?')
    expect(calls[0]?.sql).toContain('RETURNING')
    expect(calls[0]?.values).toHaveLength(4)
    expect(calls[0]?.values[0]).toBeInstanceOf(Date)
    expect(calls[0]?.values[3]).toBeInstanceOf(Date)
  })
})
