import { describe, expect, test } from 'bun:test'
import type { BotVerifier } from './bot-verifier'
import { FakeBotVerifier } from './bot-verifier'
import {
  PublicScanAdmission,
  PublicScanAdmissionError,
  type PublicScanAdmissionErrorCode,
  type PublicScanAdmissionOptions,
} from './public-scan-admission'

const resolver = async () => ['93.184.216.34']

function admission(overrides: Partial<PublicScanAdmissionOptions> = {}) {
  return new PublicScanAdmission({
    botVerifier: new FakeBotVerifier(),
    sessionQuota: { limit: 3, windowMs: 60_000 },
    ipQuota: { limit: 10, windowMs: 60_000 },
    domainQuota: { limit: 10, windowMs: 60_000 },
    maxOutstanding: 2,
    targetPolicy: { resolver },
    ...overrides,
  })
}

const request = {
  kind: 'quick' as const,
  target: 'https://example.com/path#fragment',
  domain: 'example.com',
  turnstileToken: 'token',
  clientIp: '203.0.113.10',
}

async function expectCode(
  promise: Promise<unknown>,
  code: PublicScanAdmissionErrorCode,
) {
  try {
    await promise
    throw new Error('Expected admission to reject')
  } catch (error) {
    expect(error).toBeInstanceOf(PublicScanAdmissionError)
    expect((error as PublicScanAdmissionError).code).toBe(code)
    return error as PublicScanAdmissionError
  }
}

describe('PublicScanAdmission', () => {
  test('returns a canonical authorized target and cryptographic session', async () => {
    const grant = await admission().admit(request)

    expect(grant.target.url).toBe('https://example.com/path')
    expect(grant.target.addresses).toEqual(['93.184.216.34'])
    expect(grant.sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(grant.id.length).toBeGreaterThan(20)
  })

  test('validates target before bot verification or quota reservation', async () => {
    let botCalls = 0
    const botVerifier: BotVerifier = {
      async verify() {
        botCalls++
        return { verified: true }
      },
    }
    const gate = admission({ botVerifier })

    await expectCode(
      gate.admit({ ...request, target: 'http://127.0.0.1/' }),
      'TARGET_REJECTED',
    )
    expect(botCalls).toBe(0)
    expect((await gate.admit(request)).target.hostname).toBe('example.com')
  })

  test('maps bot rejection and provider outage to stable errors', async () => {
    await expectCode(
      admission({
        botVerifier: new FakeBotVerifier({
          verified: false,
          reason: 'invalid-token',
        }),
      }).admit(request),
      'BOT_REJECTED',
    )
    await expectCode(
      admission({
        botVerifier: new FakeBotVerifier({
          verified: false,
          reason: 'unavailable',
        }),
      }).admit(request),
      'BOT_UNAVAILABLE',
    )
  })

  test('enforces session quota and reports a stable retry delay', async () => {
    let now = 1_000
    const gate = admission({
      sessionQuota: { limit: 1, windowMs: 10_000 },
      now: () => now,
    })
    const first = await gate.admit(request)
    await gate.release(first.id)

    const error = await expectCode(
      gate.admit({ ...request, anonymousSession: first.sessionId }),
      'SESSION_QUOTA_EXCEEDED',
    )
    expect(error.retryAfterSeconds).toBe(10)

    now += 10_000
    expect(
      (await gate.admit({ ...request, anonymousSession: first.sessionId }))
        .sessionId,
    ).toBe(first.sessionId)
  })

  test('enforces IP and domain quotas independently', async () => {
    const ipGate = admission({ ipQuota: { limit: 1, windowMs: 60_000 } })
    const firstIp = await ipGate.admit(request)
    await ipGate.release(firstIp.id)
    await expectCode(ipGate.admit(request), 'IP_QUOTA_EXCEEDED')

    const domainGate = admission({
      domainQuota: { limit: 1, windowMs: 60_000 },
    })
    const firstDomain = await domainGate.admit(request)
    await domainGate.release(firstDomain.id)
    await expectCode(
      domainGate.admit({ ...request, clientIp: '203.0.113.11' }),
      'DOMAIN_QUOTA_EXCEEDED',
    )
  })

  test('reserves global capacity atomically and release is idempotent', async () => {
    const gate = admission({ maxOutstanding: 1 })
    const first = await gate.admit(request)

    await expectCode(gate.admit(request), 'DEMO_BUSY')
    expect(await gate.release(first.id)).toBe(true)
    expect(await gate.release(first.id)).toBe(false)
    expect((await gate.admit(request)).id).not.toBe(first.id)
  })

  test('requires supplied domain to match the authorized target', async () => {
    await expectCode(
      gate().admit({ ...request, domain: 'other.example' }),
      'DOMAIN_MISMATCH',
    )
  })

  test('recovers capacity when an unreleased lease expires', async () => {
    let now = 1_000
    const gate = admission({
      maxOutstanding: 1,
      leaseDurationMs: 5_000,
      now: () => now,
    })
    await gate.admit(request)
    await expectCode(gate.admit(request), 'DEMO_BUSY')

    now += 5_000
    await expect(gate.admit(request)).resolves.toHaveProperty('id')
  })
})

function gate() {
  return admission()
}
