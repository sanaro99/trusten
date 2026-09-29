import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { closeDb, getDb, initializeDb } from '../../lib/db'
import { PuppeteerDriver } from '../browser/puppeteer-driver'
import { ensureTrustenSchema } from '../db'
import { FakeBotVerifier } from '../security/bot-verifier'
import {
  InMemoryCapabilityStore,
  JobCapabilityAccess,
} from '../security/job-capability'
import { PublicScanAdmission } from '../security/public-scan-admission'
import type { ScanResult } from '../types'
import { WORKFLOW_REGISTRY } from '../workflows/definitions'
import { createTrustenDashboardRoutes } from './routes'

const databaseUrl = process.env.TRUSTEN_TEST_DATABASE_URL
const enabled = process.env.TRUSTEN_BROWSER_TESTS === '1' && !!databaseUrl
const reportsDir = path.resolve('.trusten-local', 'audit-regression-reports')

describe.skipIf(!enabled)('audit API in Chromium and PostgreSQL', () => {
  let fixture: ReturnType<typeof Bun.serve>
  let driver: PuppeteerDriver
  let previousReportsDir: string | undefined
  let failDeep = false
  let blockedPricing = false
  let blockedRequests = 0
  const targets: string[] = []
  let app: ReturnType<typeof createTrustenDashboardRoutes>

  beforeAll(async () => {
    initializeDb(databaseUrl)
    await ensureTrustenSchema()
    previousReportsDir = process.env.TRUSTEN_REPORTS_DIR
    process.env.TRUSTEN_REPORTS_DIR = reportsDir
    WORKFLOW_REGISTRY['fixture-overview'] = {
      id: 'fixture-overview',
      name: 'Page overview',
      description: 'Inspect the starting page.',
      steps: [
        {
          id: 'observe',
          instruction: 'Inspect the current page.',
          analyzersToRun: [],
          timeout: 5,
          screenshotBefore: false,
          screenshotAfter: true,
        },
      ],
    }
    fixture = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/pricing' && blockedPricing) {
          blockedRequests++
          return new Response('<h1>Access forbidden</h1>', {
            status: 403,
            headers: { 'content-type': 'text/html' },
          })
        }
        const body =
          url.pathname === '/pricing'
            ? '<h1>Pricing</h1><p>Service fee $9 is added at checkout.</p><label><input type="checkbox" checked>Receive marketing offers</label>'
            : '<h1>Home</h1><a href="/pricing">Pricing</a>'
        return new Response(
          `<!doctype html><html><head><title>Test website</title></head><body><main>${body}</main></body></html>`,
          { headers: { 'content-type': 'text/html' } },
        )
      },
    })
    driver = new PuppeteerDriver()
    // Admission is tested against a public test hostname. Only this fixture
    // driver maps it to loopback; the application target policy is unchanged.
    const browser = new Proxy(driver, {
      get(target, key) {
        if (key === 'newPage')
          return (
            url: string,
            opts: Parameters<PuppeteerDriver['newPage']>[1],
          ) => {
            if (failDeep && opts?.videoDir)
              throw new Error('Journey browser unavailable')
            return target.newPage(
              url.startsWith('file:')
                ? url
                : `http://127.0.0.1:${fixture.port}${new URL(url).pathname}`,
              opts,
            )
          }
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    app = createTrustenDashboardRoutes({
      browser,
      executionDir: process.cwd(),
      secureCookies: false,
      admission: new PublicScanAdmission({
        botVerifier: new FakeBotVerifier(),
        sessionQuota: { limit: 100, windowMs: 1000 },
        ipQuota: { limit: 100, windowMs: 1000 },
        domainQuota: { limit: 100, windowMs: 1000 },
        maxOutstanding: 2,
        targetPolicy: { resolver: async () => ['93.184.216.34'] },
      }),
      capabilities: new JobCapabilityAccess({
        store: new InMemoryCapabilityStore(),
        hashKey: 'test-capability-hash-key-at-least-32-bytes',
      }),
    })
  })

  afterAll(async () => {
    for (const target of targets) {
      await getDb()`DELETE FROM trusten_audit_jobs WHERE url = ${target}`
      await getDb()`DELETE FROM trusten_scans WHERE url = ${target}`
    }
    await driver?.close()
    fixture?.stop(true)
    await closeDb()
    delete WORKFLOW_REGISTRY['fixture-overview']
    if (previousReportsDir === undefined) delete process.env.TRUSTEN_REPORTS_DIR
    else process.env.TRUSTEN_REPORTS_DIR = previousReportsDir
    if (!reportsDir.startsWith(path.resolve('.trusten-local') + path.sep))
      throw new Error('Unsafe cleanup path')
    rmSync(reportsDir, { recursive: true, force: true })
  })

  async function audit(workflows: string[]) {
    const url = `https://fixture.example/${crypto.randomUUID()}`
    targets.push(url)
    const start = await app.request('/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, mode: 'fixed', workflows }),
    })
    expect(start.status).toBe(200)
    const { jobId, capabilityToken } = (await start.json()) as {
      jobId: string
      capabilityToken: string
    }
    const deadline = Date.now() + 35_000
    while (Date.now() < deadline) {
      const response = await app.request(`/api/audit/${jobId}`, {
        headers: { authorization: `Bearer ${capabilityToken}` },
      })
      expect(response.status).toBe(200)
      const status = (await response.json()) as {
        status: string
        scanIds: string[]
        error: string | null
      }
      if (status.status === 'done' || status.status === 'failed') return status
      await Bun.sleep(100)
    }
    throw new Error('Audit did not complete')
  }

  test('preserves blocked workflow coverage after a successful page overview', async () => {
    blockedPricing = true
    blockedRequests = 0
    try {
      const status = await audit(['fixture-overview', 'pricing'])
      expect(status.error).toBeNull()
      expect(status.status).toBe('done')
      expect(blockedRequests).toBeGreaterThan(0)
      const resultId = status.scanIds.at(-1)!
      const response = await app.request(`/api/scan/${resultId}`)
      expect(response.status).toBe(200)
      const result = (await response.json()) as ScanResult
      const failedSteps = result.workflowSteps!.filter(
        (step) => step.status === 'not-reached' || step.status === 'skipped',
      )
      expect(failedSteps.map((step) => step.status)).toEqual([
        'not-reached',
        'skipped',
        'skipped',
      ])
      for (const step of failedSteps) {
        expect(step.patternsFound).toEqual([])
        expect(step.screenshot || '').toBe('')
        expect(step.screenshotPath).toBeUndefined()
        expect(
          (
            await app.request(
              `/report/${resultId}/screenshot/${step.stepNumber}`,
            )
          ).status,
        ).toBe(404)
      }
      const html = readFileSync(result.htmlPath!, 'utf8')
      expect(html).toContain('Limited check')
      expect(html).toContain('We could not complete the whole journey')
      expect(html).not.toContain('Trusten reached every planned step.')
    } finally {
      blockedPricing = false
    }
  }, 45_000)

  test('persists quick-report paths and serves its PDF with embedded page evidence', async () => {
    const url = `https://quick-${crypto.randomUUID()}.example/`
    targets.push(url)
    const checked = await app.request('/api/quick-scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    expect(checked.status).toBe(200)
    const { scanId } = (await checked.json()) as { scanId: string }
    const response = await app.request(`/api/scan/${scanId}`)
    expect(response.status).toBe(200)
    const saved = (await response.json()) as ScanResult
    expect(saved.scanType).toBe('quick')
    expect(saved.pdfPath).toEqual(expect.any(String))
    expect(saved.htmlPath).toEqual(expect.any(String))
    const pdf = await app.request(`/report/${scanId}/pdf`)
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('content-type')).toBe('application/pdf')
    expect(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe('%PDF')
    const html = readFileSync(saved.htmlPath!, 'utf8')
    expect(html).toContain('data:image/jpeg;base64,')
    const evidence = saved.workflowSteps!.find((step) => step.screenshotPath)!
    expect(
      (await app.request(`/report/${scanId}/screenshot/${evidence.stepNumber}`))
        .status,
    ).toBe(200)
  }, 20_000)

  test('returns a persisted combined result with downloadable page and report evidence', async () => {
    const status = await audit(['pricing'])
    expect(status.status).toBe('done')
    const resultId = status.scanIds.at(-1)!
    const response = await app.request(`/api/scan/${resultId}`)
    expect(response.status).toBe(200)
    const result = (await response.json()) as {
      scanType: string
      patterns: Array<{ category: string }>
      workflowSteps: Array<{ stepNumber: number; screenshotPath?: string }>
    }
    expect(result.scanType).toBe('deep')
    expect(status.scanIds).toHaveLength(3)
    expect(result.workflowSteps).toHaveLength(4)
    expect(result.patterns.some((p) => p.category === 'drip_pricing')).toBe(
      true,
    )
    const step = result.workflowSteps.find((s) => s.screenshotPath)!
    const screenshot = await app.request(
      `/report/${resultId}/screenshot/${step.stepNumber}`,
    )
    expect(screenshot.status).toBe(200)
    expect(screenshot.headers.get('content-type')).toBe('image/jpeg')
    const pdf = await app.request(`/report/${resultId}/pdf`)
    expect(pdf.status).toBe(200)
    expect(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe('%PDF')
  }, 45_000)

  test('marks the audit failed when every deep journey crashes', async () => {
    failDeep = true
    try {
      const status = await audit(['pricing'])
      expect(status.status).toBe('failed')
      expect(status.error).toContain('every requested journey')
    } finally {
      failDeep = false
    }
  }, 45_000)
})
