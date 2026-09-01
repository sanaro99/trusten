import { describe, expect, test } from 'bun:test'
import type { BrowserDriver } from '../browser/driver'
import type { BotVerifier } from '../security/bot-verifier'
import { FakeBotVerifier } from '../security/bot-verifier'
import {
  InMemoryCapabilityStore,
  JobCapabilityAccess,
} from '../security/job-capability'
import { PublicScanAdmission } from '../security/public-scan-admission'
import { createTrustenDashboardRoutes } from './routes'

function app(botVerifier: BotVerifier = new FakeBotVerifier()) {
  return createTrustenDashboardRoutes({
    browser: {} as BrowserDriver,
    executionDir: process.cwd(),
    secureCookies: false,
    capabilities: new JobCapabilityAccess({
      store: new InMemoryCapabilityStore(),
      hashKey: 'test-capability-hash-key-at-least-32-bytes',
    }),
    admission: new PublicScanAdmission({
      botVerifier,
      sessionQuota: { limit: 3, windowMs: 60_000 },
      ipQuota: { limit: 10, windowMs: 60_000 },
      domainQuota: { limit: 10, windowMs: 60_000 },
      maxOutstanding: 2,
      targetPolicy: { resolver: async () => ['93.184.216.34'] },
    }),
  })
}

describe('public scan route admission', () => {
  test('does not reveal audit job existence without a capability', async () => {
    const response = await app().request('/api/audit/some-job-id')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Job not found' })
  })

  test('rejects a non-public target before browser execution', async () => {
    const response = await app().request('/api/quick-scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1/' }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'TARGET_REJECTED' })
  })

  test('maps a rejected Turnstile token to a stable public error', async () => {
    const response = await app(
      new FakeBotVerifier({ verified: false, reason: 'invalid-token' }),
    ).request('/api/quick-scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/',
        turnstileToken: 'rejected-token',
      }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'BOT_REJECTED' })
  })

  test('ignores a malformed anonymous cookie instead of failing the request', async () => {
    const response = await app(
      new FakeBotVerifier({ verified: false, reason: 'invalid-token' }),
    ).request('/api/quick-scan', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'trusten_demo=%not-valid',
      },
      body: JSON.stringify({
        url: 'https://example.com/',
        turnstileToken: 'rejected-token',
      }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'BOT_REJECTED' })
  })

  test('ignores spoofable public forwarding headers', async () => {
    let remoteIp = ''
    const verifier: BotVerifier = {
      async verify(request) {
        remoteIp = request.remoteIp ?? ''
        return { verified: false, reason: 'invalid-token' }
      },
    }
    await app(verifier).request('/api/quick-scan', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '198.51.100.9',
        'x-forwarded-for': '203.0.113.7',
      },
      body: JSON.stringify({
        url: 'https://example.com/',
        turnstileToken: 'rejected-token',
      }),
    })

    expect(remoteIp).toBe('unknown')
  })

  test('uses only the proxy-owned canonical client IP header', async () => {
    let remoteIp = ''
    const verifier: BotVerifier = {
      async verify(request) {
        remoteIp = request.remoteIp ?? ''
        return { verified: false, reason: 'invalid-token' }
      },
    }
    await app(verifier).request('/api/quick-scan', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-trusten-client-ip': '192.0.2.10',
      },
      body: JSON.stringify({
        url: 'https://example.com/',
        turnstileToken: 'rejected-token',
      }),
    })

    expect(remoteIp).toBe('192.0.2.10')
  })
})
