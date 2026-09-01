import { describe, expect, test } from 'bun:test'
import { FakeBotVerifier } from './bot-verifier'
import { CloudflareTurnstileVerifier } from './cloudflare-turnstile'

function verifier(payload: unknown, status = 200) {
  return new CloudflareTurnstileVerifier({
    secretKey: 'secret',
    expectedHostname: 'demo.example.com',
    expectedAction: 'scan-submit',
    fetch: (async (_input, init) => {
      expect(init?.method).toBe('POST')
      return new Response(JSON.stringify(payload), { status })
    }) as typeof fetch,
  })
}

describe('CloudflareTurnstileVerifier', () => {
  test('accepts only successful responses with matching hostname and action', async () => {
    const result = await verifier({
      success: true,
      hostname: 'Demo.Example.com',
      action: 'scan-submit',
    }).verify({ token: 'token', remoteIp: '203.0.113.10' })

    expect(result).toEqual({ verified: true })
  })

  test('rejects provider failures and preserves error codes', async () => {
    expect(
      await verifier({
        success: false,
        'error-codes': ['timeout-or-duplicate'],
      }).verify({
        token: 'token',
      }),
    ).toEqual({
      verified: false,
      reason: 'invalid-token',
      errorCodes: ['timeout-or-duplicate'],
    })
  })

  test('rejects hostname and action mismatches', async () => {
    expect(
      await verifier({
        success: true,
        hostname: 'evil.example',
        action: 'scan-submit',
      }).verify({
        token: 'token',
      }),
    ).toEqual({ verified: false, reason: 'hostname-mismatch' })

    expect(
      await verifier({
        success: true,
        hostname: 'demo.example.com',
        action: 'login',
      }).verify({
        token: 'token',
      }),
    ).toEqual({ verified: false, reason: 'action-mismatch' })
  })

  test('fails closed for blank tokens and unavailable verification', async () => {
    expect(await verifier({ success: true }).verify({ token: ' ' })).toEqual({
      verified: false,
      reason: 'invalid-token',
    })
    expect(await verifier({}, 503).verify({ token: 'token' })).toEqual({
      verified: false,
      reason: 'unavailable',
    })
  })

  test('provides a deterministic fake adapter', async () => {
    expect(await new FakeBotVerifier().verify({ token: 'anything' })).toEqual({
      verified: true,
    })
  })
})
