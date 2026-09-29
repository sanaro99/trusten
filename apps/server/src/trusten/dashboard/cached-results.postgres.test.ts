import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { closeDb, getDb, initializeDb } from '../../lib/db'
import type { BrowserDriver } from '../browser/driver'
import {
  createAuditJob,
  ensureTrustenSchema,
  saveTrustenScan,
  updateAuditJob,
} from '../db'
import { FakeBotVerifier } from '../security/bot-verifier'
import {
  InMemoryCapabilityStore,
  JobCapabilityAccess,
} from '../security/job-capability'
import { PostgresPublicScanAdmissionPersistence } from '../security/postgres-public-scan-admission'
import { PublicScanAdmission } from '../security/public-scan-admission'
import type { ScanResult } from '../types'
import { createTrustenDashboardRoutes } from './routes'

const databaseUrl = process.env.TRUSTEN_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)('saved public scan responses', () => {
  const scanIds: string[] = []
  const jobIds: string[] = []
  const reservationIds: string[] = []
  const sessionIds: string[] = []
  const browser = {
    newPage: async () => {
      throw new Error('A saved result must not start a browser')
    },
  } as unknown as BrowserDriver

  beforeAll(async () => {
    initializeDb(databaseUrl)
    await ensureTrustenSchema()
  })

  afterAll(async () => {
    for (const id of jobIds)
      await getDb()`DELETE FROM trusten_audit_jobs WHERE id = ${id}`
    for (const id of scanIds)
      await getDb()`DELETE FROM trusten_scans WHERE id = ${id}`
    for (const id of reservationIds) {
      await getDb()`DELETE FROM trusten_public_scan_quota_events WHERE reservation_id = ${id}`
      await getDb()`DELETE FROM trusten_public_scan_attempts WHERE id = ${id}`
    }
    for (const id of sessionIds)
      await getDb()`DELETE FROM trusten_public_scan_sessions WHERE id = ${id}`
    await closeDb()
  })

  function fixture(
    url: string,
    type: 'quick' | 'deep',
    publicPage = true,
    completedAt = new Date().toISOString(),
  ) {
    const result: ScanResult = {
      id: `cache-test-${crypto.randomUUID()}`,
      url,
      domain: new URL(url).hostname,
      scanType: type,
      startedAt: completedAt,
      completedAt,
      patterns: [],
      score: {
        numeric: 91,
        grade: 'A',
        categoryBreakdown: {},
        summary: 'A saved check',
      },
      ...(type === 'quick' && publicPage
        ? {
            workflowSteps: [
              {
                stepNumber: 1,
                action: 'Inspect the initial page',
                url,
                screenshot: '',
                screenshotPath: 'saved-evidence.jpg',
                patternsFound: [],
                timestamp: completedAt,
                status: 'observed' as const,
              },
            ],
          }
        : {}),
    }
    scanIds.push(result.id)
    return result
  }

  function route() {
    const admission = new PublicScanAdmission({
      botVerifier: new FakeBotVerifier(),
      sessionQuota: { limit: 1, windowMs: 600_000 },
      ipQuota: { limit: 1, windowMs: 600_000 },
      domainQuota: { limit: 1, windowMs: 600_000 },
      maxOutstanding: 2,
      targetPolicy: { resolver: async () => ['93.184.216.34'] },
    })
    const capabilities = new JobCapabilityAccess({
      store: new InMemoryCapabilityStore(),
      hashKey: 'cache-test-capability-key-at-least-32-bytes',
    })
    return {
      admission,
      app: createTrustenDashboardRoutes({
        browser,
        admission,
        executionDir: process.cwd(),
        secureCookies: false,
        capabilities,
      }),
    }
  }

  async function useAllowance(
    admission: PublicScanAdmission,
    url: string,
    kind: 'quick' | 'audit',
  ) {
    const grant = await admission.admit({
      kind,
      target: url,
      domain: new URL(url).hostname,
      clientIp: '203.0.113.10',
    })
    await admission.release(grant.id)
    return `trusten_demo=${grant.sessionId}`
  }

  test('returns a dated public quick result even when its allowance is exhausted', async () => {
    const url = `https://example.com/${crypto.randomUUID()}`
    const saved = fixture(
      url,
      'quick',
      true,
      new Date(Date.now() - 20 * 60_000).toISOString(),
    )
    await saveTrustenScan(saved)
    const { app, admission } = route()
    const cookie = await useAllowance(admission, url, 'quick')

    const response = await app.request('/api/quick-scan', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-trusten-client-ip': '203.0.113.10',
        cookie,
      },
      body: JSON.stringify({ url }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      scanId: saved.id,
      cached: true,
      checkedAt: saved.completedAt,
    })
  })

  test('does not offer extension-captured content as a public cached result', async () => {
    const url = `https://example.com/${crypto.randomUUID()}`
    await saveTrustenScan(fixture(url, 'quick', false))
    const { app, admission } = route()
    const cookie = await useAllowance(admission, url, 'quick')
    const response = await app.request('/api/quick-scan', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-trusten-client-ip': '203.0.113.10',
        cookie,
      },
      body: JSON.stringify({ url }),
    })
    expect(response.status).toBe(429)
    expect((await response.json()).code).toBe('SESSION_QUOTA_EXCEEDED')
  })

  test('returns the completed deep audit with a fresh viewing capability', async () => {
    const url = `https://example.com/${crypto.randomUUID()}`
    const saved = fixture(url, 'deep')
    await saveTrustenScan(saved)
    const jobId = await createAuditJob(url, 'example.com', [])
    jobIds.push(jobId)
    await updateAuditJob(jobId, {
      status: 'done',
      scanIds: [saved.id],
      completedAt: saved.completedAt,
    })
    const { app, admission } = route()
    const cookie = await useAllowance(admission, url, 'audit')
    const response = await app.request('/api/audit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-trusten-client-ip': '203.0.113.10',
        cookie,
      },
      body: JSON.stringify({ url, mode: 'discover' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      jobId,
      cached: true,
      checkedAt: saved.completedAt,
    })
    const status = await app.request(`/api/audit/${jobId}`, {
      headers: { authorization: `Bearer ${body.capabilityToken}` },
    })
    expect(status.status).toBe(200)
    expect((await status.json()).scanIds).toEqual([saved.id])
  })

  test('PostgreSQL grants a first deep check after a completed quick check', async () => {
    const domain = `${crypto.randomUUID()}.example.com`
    const request = {
      target: `https://${domain}/`,
      domain,
      clientIp: `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
    }
    const admission = new PublicScanAdmission({
      botVerifier: new FakeBotVerifier(),
      persistence: new PostgresPublicScanAdmissionPersistence(getDb()),
      sessionQuota: { limit: 10, windowMs: 600_000 },
      ipQuota: { limit: 10, windowMs: 600_000 },
      domainQuota: { limit: 1, windowMs: 600_000 },
      maxOutstanding: 2,
      targetPolicy: { resolver: async () => ['93.184.216.34'] },
    })
    const quick = await admission.admit({ ...request, kind: 'quick' })
    reservationIds.push(quick.id)
    sessionIds.push(quick.sessionId)
    await admission.release(quick.id)
    const deep = await admission.admit({
      ...request,
      kind: 'audit',
      anonymousSession: quick.sessionId,
    })
    reservationIds.push(deep.id)
    await admission.release(deep.id)
    expect(deep.target.url).toBe(`https://${domain}/`)
    await expect(
      admission.admit({
        ...request,
        kind: 'quick',
        anonymousSession: quick.sessionId,
      }),
    ).rejects.toMatchObject({ code: 'DOMAIN_QUOTA_EXCEEDED' })
  })
})
