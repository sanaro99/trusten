import { describe, expect, test } from 'bun:test'
import type { BrowserDriver } from '../browser/driver'
import type { BotVerifier } from '../security/bot-verifier'
import { FakeBotVerifier } from '../security/bot-verifier'
import {
  InMemoryCapabilityStore,
  JobCapabilityAccess,
} from '../security/job-capability'
import { ProvidedContentLimiter } from '../security/provided-content-limit'
import { PublicScanAdmission } from '../security/public-scan-admission'
import { createTrustenDashboardRoutes } from './routes'

function app(
  botVerifier: BotVerifier = new FakeBotVerifier(),
  providedContentLimiter?: ProvidedContentLimiter,
) {
  return createTrustenDashboardRoutes({
    providedContentLimiter,
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

describe('extension page submissions', () => {
  const post = (
    target: ReturnType<typeof app>,
    body: unknown,
    ip = '203.0.113.7',
  ) => {
    const json = JSON.stringify(body)
    return target.request('/api/analyze-page', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(json)),
        'x-trusten-client-ip': ip,
      },
      body: json,
    })
  }

  test('rate limits each client before reading the page', async () => {
    const target = app(
      undefined,
      new ProvidedContentLimiter([{ limit: 2, windowMs: 60_000 }]),
    )
    for (let i = 0; i < 2; i++)
      expect((await post(target, { url: 'https://example.com/' })).status).toBe(
        400,
      )
    const limited = await post(target, { url: 'https://example.com/' })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('60')
    expect(await limited.json()).toMatchObject({
      code: 'EXTENSION_RATE_LIMITED',
    })
    expect(
      (await post(target, { url: 'https://example.com/' }, '203.0.113.8'))
        .status,
    ).toBe(400)
  })

  test('rejects a request body larger than every field at its cap', async () => {
    const response = await post(app(), {
      url: 'https://example.com/',
      html: 'x'.repeat(10_000_000),
    })
    expect(response.status).toBe(413)
  })

  test('stops reading a body without a declared length at the cap', async () => {
    const response = await app().request('/api/analyze-page', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new Blob([
        JSON.stringify({
          url: 'https://example.com/',
          html: 'x'.repeat(10_000_000),
        }),
      ]).stream(),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      fields: { _: 'Body must be JSON' },
    })
  })

  test('rejects html beyond the capture limit', async () => {
    const response = await post(app(), {
      url: 'https://example.com/',
      html: 'x'.repeat(600_001),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      fields: { html: 'html is too large' },
    })
  })
})
