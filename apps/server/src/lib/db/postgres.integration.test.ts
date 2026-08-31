import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
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
})
