import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createAuditJob, saveTrustenScan } from '../../trusten/db'
import { JobCapabilityAccess } from '../../trusten/security/job-capability'
import { PostgreSqlCapabilityStore } from '../../trusten/security/postgres-capability-store'
import { PostgresPublicScanAdmissionPersistence } from '../../trusten/security/postgres-public-scan-admission'
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
      '004_refundable_scan_quotas.sql',
      '005_scan_attempt_throttle.sql',
      '006_scan_reservation_retention.sql',
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
      'trusten_public_scan_attempts',
    ]) {
      expect(tables.has(table)).toBe(true)
    }
  })

  test('allows a previous application image to insert a lease after the retention migration', async () => {
    const id = crypto.randomUUID()
    const sql = getDb()
    try {
      const [lease] = await sql`
        INSERT INTO trusten_public_scan_leases (id, expires_at)
        VALUES (${id}, now() + interval '15 minutes')
        RETURNING refund_expires_at
      `
      expect(lease.refund_expires_at).toBeInstanceOf(Date)
    } finally {
      await sql`DELETE FROM trusten_public_scan_leases WHERE id = ${id}`
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

  test('refunds only the failed reservation while retaining completed scan allowances', async () => {
    const sql = getDb()
    const persistence = new PostgresPublicScanAdmissionPersistence(sql)
    const completedId = crypto.randomUUID()
    const failedId = crypto.randomUUID()
    const key = crypto.randomUUID()
    const session = `quota-test-${key}`
    const reserve = (id: string) =>
      persistence.reserve({
        id,
        kind: 'quick',
        generatedSessionId: session,
        clientIp: key,
        domain: key,
        attemptQuota: { limit: 2, windowMs: 60000 },
        sessionQuota: { limit: 3, windowMs: 60000 },
        ipQuota: { limit: 3, windowMs: 60000 },
        domainQuota: { limit: 3, windowMs: 60000 },
        maxOutstanding: 100,
        leaseDurationMs: 30000,
        now: Date.now(),
      })
    try {
      expect((await reserve(completedId)).allowed).toBe(true)
      expect((await reserve(failedId)).allowed).toBe(true)
      expect(await persistence.release(completedId)).toBe(true)
      expect(await persistence.release(failedId, true)).toBe(true)
      expect(await persistence.release(completedId, true)).toBe(false)
      expect(await persistence.release(failedId, true)).toBe(false)
      const [row] =
        await sql`SELECT COUNT(*)::integer AS count FROM trusten_public_scan_quota_events WHERE reservation_id = ${completedId}`
      expect(row.count).toBe(3)
      const retry = await reserve(crypto.randomUUID())
      expect(retry.allowed).toBe(false)
      if (!retry.allowed) expect(retry.dimension).toBe('retry')
    } finally {
      await sql`DELETE FROM trusten_public_scan_leases WHERE id = ${completedId} OR id = ${failedId}`
      await sql`DELETE FROM trusten_public_scan_attempts WHERE client_ip = ${key}`
      await sql`DELETE FROM trusten_public_scan_quota_events WHERE reservation_id IN (${completedId}, ${failedId})`
      await sql`DELETE FROM trusten_public_scan_sessions WHERE id = ${session}`
    }
  })

  test('retains refund ownership after capacity expiry and finalizes a completed reservation once', async () => {
    const sql = getDb()
    const persistence = new PostgresPublicScanAdmissionPersistence(sql)
    const key = `expired-${crypto.randomUUID()}`
    const failedId = crypto.randomUUID()
    const completedId = crypto.randomUUID()
    const unrelatedId = crypto.randomUUID()
    const cleanupTriggerId = crypto.randomUUID()
    const reserve = (id: string, quotaKey = key) =>
      persistence.reserve({
        id,
        kind: 'quick',
        generatedSessionId: quotaKey,
        clientIp: quotaKey,
        domain: quotaKey,
        sessionQuota: { limit: 1, windowMs: 60000 },
        ipQuota: { limit: 1, windowMs: 60000 },
        domainQuota: { limit: 1, windowMs: 60000 },
        maxOutstanding: 100,
        leaseDurationMs: 1000,
        now: Date.now(),
      })
    try {
      expect((await reserve(failedId)).allowed).toBe(true)
      await sql`UPDATE trusten_public_scan_leases SET expires_at = now() - interval '1 second' WHERE id = ${failedId}`
      expect((await reserve(unrelatedId, `${key}-other`)).allowed).toBe(true)
      await persistence.release(unrelatedId, true)
      expect(await persistence.release(failedId, true)).toBe(true)
      expect(await persistence.release(failedId, true)).toBe(false)
      expect((await reserve(completedId)).allowed).toBe(true)
      await sql`UPDATE trusten_public_scan_leases SET expires_at = now() - interval '1 second' WHERE id = ${completedId}`
      await reserve(cleanupTriggerId, `${key}-other`)
      expect(await persistence.release(completedId)).toBe(true)
      expect(await persistence.release(completedId, true)).toBe(false)
      const retry = await reserve(crypto.randomUUID())
      expect(retry.allowed).toBe(false)
      if (!retry.allowed) expect(retry.dimension).toBe('session')
    } finally {
      await sql`DELETE FROM trusten_public_scan_leases WHERE id IN (${failedId}, ${completedId}, ${unrelatedId}, ${cleanupTriggerId})`
      await sql`DELETE FROM trusten_public_scan_attempts WHERE client_ip IN (${key}, ${`${key}-other`})`
      await sql`DELETE FROM trusten_public_scan_quota_events WHERE reservation_id IN (${failedId}, ${completedId}, ${unrelatedId}, ${cleanupTriggerId})`
      await sql`DELETE FROM trusten_public_scan_sessions WHERE id IN (${key}, ${`${key}-other`})`
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
