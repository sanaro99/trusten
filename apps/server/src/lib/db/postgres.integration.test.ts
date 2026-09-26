import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createAuditJob, saveTrustenScan } from '../../trusten/db'
import { JobCapabilityAccess } from '../../trusten/security/job-capability'
import { PostgreSqlCapabilityStore } from '../../trusten/security/postgres-capability-store'
import { closeDb, getDb, initializeDb, migrateDb } from './index'

const databaseUrl = process.env.TRUSTEN_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)('PostgreSQL migrations', () => {
  beforeAll(async () => {
    initializeDb(databaseUrl)
    await migrateDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  test('apply idempotently and record immutable checksums', async () => {
    await migrateDb()
    const rows = (await getDb()`
      SELECT version, checksum
      FROM trusten_schema_migrations
      ORDER BY version
    `) as Array<{ version: string; checksum: string }>

    expect(rows.map((row) => row.version)).toEqual([
      '001_initial.sql',
      '002_job_capabilities.sql',
      '003_public_scan_admission.sql',
    ])
    expect(
      rows.every((row) => /^[0-9a-f]{64}$/.test(String(row.checksum))),
    ).toBe(true)
  })

  test('creates the cloud storage and security tables', async () => {
    const rows = (await getDb()`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'trusten_%'
    `) as Array<{ table_name: string }>
    const tables = new Set(rows.map((row) => String(row.table_name)))

    for (const table of [
      'trusten_scans',
      'trusten_audit_jobs',
      'trusten_page_cache',
      'trusten_job_capabilities',
      'trusten_public_scan_sessions',
      'trusten_public_scan_quota_events',
      'trusten_public_scan_leases',
    ]) {
      expect(tables.has(table)).toBe(true)
    }
  })

  test('persists scan patterns as a JSON array', async () => {
    const id = 'postgres-json-array-integration-test'
    await getDb()`DELETE FROM trusten_scans WHERE id = ${id}`
    try {
      await saveTrustenScan({
        id,
        url: 'https://example.com',
        domain: 'example.com',
        scanType: 'quick',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        patterns: [],
        score: {
          numeric: 100,
          grade: 'A',
          categoryBreakdown: {},
          summary: '',
        },
      })
      const [row] = (await getDb()`
        SELECT jsonb_typeof(patterns) AS kind
        FROM trusten_scans
        WHERE id = ${id}
      `) as Array<{ kind: string }>
      expect(row?.kind).toBe('array')
    } finally {
      await getDb()`DELETE FROM trusten_scans WHERE id = ${id}`
    }
  })

  test('creates discover-mode audit jobs with an empty workflow array', async () => {
    const id = await createAuditJob('https://www.temu.com/', 'www.temu.com', [])
    try {
      const [row] = (await getDb()`
        SELECT jsonb_typeof(workflows) AS kind, workflows
        FROM trusten_audit_jobs
        WHERE id = ${id}
      `) as Array<{ kind: string; workflows: unknown }>
      expect(row?.kind).toBe('array')
      expect(row?.workflows).toEqual([])
    } finally {
      await getDb()`DELETE FROM trusten_audit_jobs WHERE id = ${id}`
    }
  })

  test('persists the scopes for a newly issued audit capability', async () => {
    const jobId = await createAuditJob(
      'https://www.temu.com/',
      'www.temu.com',
      [],
    )
    try {
      const access = new JobCapabilityAccess({
        store: new PostgreSqlCapabilityStore(getDb()),
        hashKey: 'test-capability-hash-key-at-least-32-bytes',
      })
      const issued = await access.issue(jobId)

      const [row] = (await getDb()`
        SELECT scopes
        FROM trusten_job_capabilities
        WHERE id = ${issued.id}
      `) as Array<{ scopes: string[] }>
      expect(row?.scopes).toEqual([
        'status',
        'result',
        'report',
        'artifact',
        'live',
      ])
    } finally {
      await getDb()`DELETE FROM trusten_job_capabilities WHERE job_id = ${jobId}`
      await getDb()`DELETE FROM trusten_audit_jobs WHERE id = ${jobId}`
    }
  })
})
