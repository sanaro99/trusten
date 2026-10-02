import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { closeDb, getDb, initializeDb } from '../lib/db'
import {
  createAuditJob,
  ensureTrustenSchema,
  getDomainSummaries,
  getDomainSummary,
  getGlobalStats,
  getTrustenScanById,
  getTrustenScanHistory,
  getTrustenScansByDomain,
  saveTrustenScan,
  updateAuditJob,
} from './db'
import type { ScanResult } from './types'

const databaseUrl = process.env.TRUSTEN_TEST_DATABASE_URL
describe.skipIf(!databaseUrl)('public audit history in PostgreSQL', () => {
  const ids: string[] = []
  const jobs: string[] = []
  beforeAll(async () => {
    initializeDb(databaseUrl)
    await ensureTrustenSchema()
  })
  afterAll(async () => {
    for (const id of jobs)
      await getDb()`DELETE FROM trusten_audit_jobs WHERE id=${id}`
    for (const id of ids)
      await getDb()`DELETE FROM trusten_scans WHERE id=${id}`
    await closeDb()
  })
  function scan(
    domain: string,
    scanType: 'quick' | 'deep' = 'deep',
    parentAuditId?: string,
  ): ScanResult {
    const id = `history-test-${crypto.randomUUID()}`
    ids.push(id)
    const now = new Date().toISOString()
    return {
      id,
      url: `https://${domain}/`,
      domain,
      scanType,
      parentAuditId,
      startedAt: now,
      completedAt: now,
      patterns: [],
      score: { numeric: 91, grade: 'A', categoryBreakdown: {}, summary: '' },
      workflowSteps: [
        {
          stepNumber: 1,
          action: 'Inspect the initial page',
          url: `https://${domain}/`,
          screenshot: '',
          screenshotPath: '/saved/evidence.jpg',
          patternsFound: [],
          timestamp: now,
          status: 'observed',
          visualCheckAvailable: true,
        },
      ],
    }
  }
  test('counts one public audit, hides children, and preserves their evidence', async () => {
    const domain = `history-${crypto.randomUUID()}.example`
    const before = await getGlobalStats()
    const job = await createAuditJob(`https://${domain}/`, domain, ['overview'])
    jobs.push(job)
    const quick = scan(domain, 'quick', job)
    const deep = scan(domain, 'deep', job)
    const summary = scan(domain)
    await saveTrustenScan(quick)
    await saveTrustenScan(deep, { workflowId: 'overview' })
    await saveTrustenScan(summary, { workflowId: 'full-audit' })
    await updateAuditJob(job, {
      status: 'done',
      scanIds: [quick.id, deep.id, summary.id],
    })
    expect(
      (await getTrustenScansByDomain(domain)).map((row) => row.id),
    ).toEqual([summary.id])
    expect(
      (await getTrustenScanHistory(1000))
        .filter((row) => row.domain === domain)
        .map((row) => row.id),
    ).toEqual([summary.id])
    expect(await getDomainSummary(domain)).toMatchObject({ scanCount: 1 })
    expect((await getGlobalStats()).totalScans - before.totalScans).toBe(1)
    expect(await getTrustenScanById(quick.id)).toMatchObject({ id: quick.id })
    expect(await getTrustenScanById(deep.id)).toMatchObject({ id: deep.id })
  })
  test('hides legacy audit members without changing standalone checks', async () => {
    const domain = `legacy-${crypto.randomUUID()}.example`
    const internal = scan(domain, 'quick')
    const standalone = scan(domain, 'quick')
    await saveTrustenScan(internal)
    await saveTrustenScan(standalone)
    const job = await createAuditJob(internal.url, domain, [])
    jobs.push(job)
    await updateAuditJob(job, { scanIds: [internal.id] })
    expect(
      (await getTrustenScansByDomain(domain)).map((row) => row.id),
    ).toEqual([standalone.id])
  })
  test('groups only the www alias and keeps other subdomains distinct', async () => {
    const domain = `aliases-${crypto.randomUUID()}.example`
    const apex = scan(domain, 'quick')
    const www = scan(`www.${domain}`)
    const shop = scan(`shop.${domain}`)
    await saveTrustenScan(apex)
    await saveTrustenScan(www)
    await saveTrustenScan(shop)
    expect(
      (await getTrustenScansByDomain(domain)).map((row) => row.id).sort(),
    ).toEqual([apex.id, www.id].sort())
    expect(
      (await getTrustenScansByDomain(`www.${domain}`))
        .map((row) => row.id)
        .sort(),
    ).toEqual([apex.id, www.id].sort())
    expect(await getDomainSummary(domain)).toMatchObject({
      domain,
      scanCount: 2,
    })
    expect(await getDomainSummary(`www.${domain}`)).toMatchObject({
      domain,
      scanCount: 2,
    })
    expect(await getDomainSummary(`shop.${domain}`)).toMatchObject({
      domain: `shop.${domain}`,
      scanCount: 1,
    })
    const summaries = await getDomainSummaries(1000)
    expect(summaries.filter((row) => row.domain === domain)).toHaveLength(1)
    expect(
      summaries.filter((row) => row.domain === `www.${domain}`),
    ).toHaveLength(0)
  })

  test('upgrades existing audit rows without deleting evidence or hiding their summary', async () => {
    await getDb().begin(async (tx) => {
      const schema = `audit_migration_${crypto.randomUUID().replaceAll('-', '')}`
      await tx.unsafe(`CREATE SCHEMA ${schema}`)
      await tx.unsafe(`SET LOCAL search_path TO ${schema}`)
      await tx.unsafe(
        readFileSync(
          new URL('../../migrations/001_initial.sql', import.meta.url),
          'utf8',
        ),
      )
      await tx`INSERT INTO trusten_scans(id,url,domain,scan_type,workflow_id,started_at,completed_at,score_numeric,score_grade,html_path)
        VALUES ('legacy-child','https://www.example.com','www.example.com','quick',null,now(),now(),100,'A','saved-child.html'),
        ('legacy-summary','https://example.com','example.com','deep','full-audit',now(),now(),90,'A','saved-summary.html')`
      await tx`INSERT INTO trusten_audit_jobs(id,url,domain,status,scan_ids)
        VALUES ('legacy-audit','https://example.com','example.com','done','["legacy-child","legacy-summary"]'::jsonb)`
      await tx.unsafe(
        readFileSync(
          new URL(
            '../../migrations/007_public_audit_history.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      )
      const rows =
        await tx`SELECT id,parent_audit_id,html_path FROM trusten_scans ORDER BY id`
      expect(rows).toEqual([
        {
          id: 'legacy-child',
          parent_audit_id: 'legacy-audit',
          html_path: 'saved-child.html',
        },
        {
          id: 'legacy-summary',
          parent_audit_id: null,
          html_path: 'saved-summary.html',
        },
      ])
      const publicRows =
        (await tx`SELECT id,canonical_domain FROM trusten_public_scans`) as Array<{
          id: string
          canonical_domain: string
        }>
      expect(publicRows).toEqual([
        { id: 'legacy-summary', canonical_domain: 'example.com' },
      ])
      // Provenance remains private even after audit-job retention removes it.
      await tx`DELETE FROM trusten_audit_jobs WHERE id='legacy-audit'`
      const afterRetention =
        (await tx`SELECT id FROM trusten_public_scans`) as Array<{ id: string }>
      expect(afterRetention).toEqual([{ id: 'legacy-summary' }])
      await tx.unsafe(`DROP SCHEMA ${schema} CASCADE`)
    })
  })
})
