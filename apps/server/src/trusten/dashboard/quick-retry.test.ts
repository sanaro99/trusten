import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { BrowserDriver } from '../browser/driver'
import { ScanIncompleteError } from '../scan-incomplete-error'
import { FakeBotVerifier } from '../security/bot-verifier'
import {
  InMemoryCapabilityStore,
  JobCapabilityAccess,
} from '../security/job-capability'
import { PublicScanAdmission } from '../security/public-scan-admission'
import { createTrustenDashboardRoutes } from './routes'

describe('retrying an unsuccessful quick check', () => {
  const previousIgnoreRobots = process.env.TRUSTEN_IGNORE_ROBOTS
  beforeAll(() => {
    process.env.TRUSTEN_IGNORE_ROBOTS = '1'
  })
  afterAll(() => {
    if (previousIgnoreRobots === undefined)
      delete process.env.TRUSTEN_IGNORE_ROBOTS
    else process.env.TRUSTEN_IGNORE_ROBOTS = previousIgnoreRobots
  })
  for (const failure of [
    new ScanIncompleteError('The site could not be inspected'),
    new Error('Connection closed.'),
  ]) {
    test(`does not spend the visitor allowance after ${failure.name}`, async () => {
      const admission = new PublicScanAdmission({
        botVerifier: new FakeBotVerifier(),
        sessionQuota: { limit: 1, windowMs: 60000 },
        ipQuota: { limit: 1, windowMs: 60000 },
        domainQuota: { limit: 1, windowMs: 60000 },
        maxOutstanding: 1,
        targetPolicy: { resolver: async () => ['93.184.216.34'] },
      })
      let attempts = 0
      const browser = {
        newPage: async () => {
          attempts++
          throw failure
        },
      } as unknown as BrowserDriver
      const app = createTrustenDashboardRoutes({
        browser,
        admission,
        executionDir: process.cwd(),
        secureCookies: false,
        capabilities: new JobCapabilityAccess({
          store: new InMemoryCapabilityStore(),
          hashKey: 'test-capability-key-at-least-thirty-two-bytes',
        }),
      })
      const url = `https://${crypto.randomUUID()}.example.com/`
      let cookie = ''
      const submit = () =>
        app.request('/api/quick-scan', {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ url }),
        })
      const first = await submit()
      expect(first.status).toBe(
        failure instanceof ScanIncompleteError ? 422 : 500,
      )
      cookie = first.headers.get('set-cookie')?.split(';')[0] ?? ''
      expect(cookie).toContain('trusten_demo=')
      const second = await submit()
      expect(second.status).toBe(first.status)
      expect(attempts).toBe(2)
    })
  }

  test('normalization preserves the target guard for bare private hosts, credentials and unsupported schemes', async () => {
    let attempts = 0
    const app = createTrustenDashboardRoutes({
      browser: {
        newPage: async () => {
          attempts++
          throw new Error('Unexpected browser launch')
        },
      } as unknown as BrowserDriver,
      executionDir: process.cwd(),
      admission: new PublicScanAdmission({
        botVerifier: new FakeBotVerifier(),
        sessionQuota: { limit: 1, windowMs: 60000 },
        ipQuota: { limit: 1, windowMs: 60000 },
        domainQuota: { limit: 1, windowMs: 60000 },
        maxOutstanding: 1,
        targetPolicy: { resolver: async () => ['93.184.216.34'] },
      }),
      capabilities: new JobCapabilityAccess({
        store: new InMemoryCapabilityStore(),
        hashKey: 'test-capability-key-at-least-thirty-two-bytes',
      }),
    })
    for (const url of [
      '127.0.0.1',
      'localhost',
      'ftp://example.com',
      'https://user:password@example.com/',
    ]) {
      const response = await app.request('/api/quick-scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (url === 'localhost') {
        expect(response.status).toBe(400)
        continue
      }
      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe('TARGET_REJECTED')
    }
    expect(attempts).toBe(0)
  })
})
