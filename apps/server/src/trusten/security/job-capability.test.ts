import { describe, expect, test } from 'bun:test'
import {
  type CapabilityStore,
  InMemoryCapabilityStore,
  JobCapabilityAccess,
} from './job-capability'

const hashKey = 'a-secure-deployment-specific-key-with-more-than-32-bytes'

function access(
  store = new InMemoryCapabilityStore(),
  options: {
    now?: () => number
    capabilityTtlMs?: number
    liveTicketTtlMs?: number
  } = {},
) {
  return {
    store,
    capabilities: new JobCapabilityAccess({ store, hashKey, ...options }),
  }
}

describe('JobCapabilityAccess', () => {
  test('issues a 256-bit opaque token but persists only its HMAC', async () => {
    const { store, capabilities } = access()
    const issued = await capabilities.issue('job-1', ['status', 'report'])
    const [record] = store.records()

    expect(Buffer.from(issued.token, 'base64url').byteLength).toBe(32)
    expect(record.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(record)).not.toContain(issued.token)
    expect(record.scopes).toEqual(['status', 'report'])
  })

  test('authorizes only the matching job, token, and scope', async () => {
    const { capabilities } = access()
    const issued = await capabilities.issue('job-1', ['status'])

    expect(
      await capabilities.authorize('job-1', issued.token, 'status'),
    ).toMatchObject({
      authorized: true,
    })
    expect(
      await capabilities.authorize('job-2', issued.token, 'status'),
    ).toEqual({
      authorized: false,
      code: 'NOT_AUTHORIZED',
    })
    expect(
      await capabilities.authorize('job-1', issued.token, 'report'),
    ).toEqual({
      authorized: false,
      code: 'NOT_AUTHORIZED',
    })
    expect(
      await capabilities.authorize('job-1', 'wrong-token', 'status'),
    ).toEqual({
      authorized: false,
      code: 'NOT_AUTHORIZED',
    })
  })

  test('enforces expiry and revocation', async () => {
    let now = 1_000
    const { capabilities } = access(new InMemoryCapabilityStore(), {
      now: () => now,
      capabilityTtlMs: 500,
    })
    const expired = await capabilities.issue('job-expired', ['result'])
    now = 1_500
    expect(
      await capabilities.authorize('job-expired', expired.token, 'result'),
    ).toMatchObject({
      authorized: false,
    })

    now = 2_000
    const revoked = await capabilities.issue('job-revoked', ['result'])
    expect(await capabilities.revoke(revoked.id)).toBe(true)
    expect(await capabilities.revoke(revoked.id)).toBe(false)
    expect(
      await capabilities.authorize('job-revoked', revoked.token, 'result'),
    ).toMatchObject({
      authorized: false,
    })
  })

  test('exchanges live scope for a short-lived single-use ticket', async () => {
    let now = 5_000
    const { capabilities } = access(new InMemoryCapabilityStore(), {
      now: () => now,
      liveTicketTtlMs: 1_000,
    })
    const capability = await capabilities.issue('job-1', ['live'])
    const ticket = await capabilities.issueLiveTicket('job-1', capability.token)
    expect(ticket).not.toBeNull()
    expect(ticket!.expiresAt).toBe(6_000)

    expect(
      await capabilities.consumeLiveTicket('job-2', ticket!.token),
    ).toMatchObject({
      authorized: false,
    })
    expect(
      await capabilities.consumeLiveTicket('job-1', ticket!.token),
    ).toMatchObject({
      authorized: true,
    })
    expect(
      await capabilities.consumeLiveTicket('job-1', ticket!.token),
    ).toEqual({
      authorized: false,
      code: 'NOT_AUTHORIZED',
    })

    const expiring = await capabilities.issueLiveTicket(
      'job-1',
      capability.token,
    )
    now = 6_000
    expect(
      await capabilities.consumeLiveTicket('job-1', expiring!.token),
    ).toMatchObject({
      authorized: false,
    })
  })

  test('refuses live-ticket exchange without live scope', async () => {
    const { capabilities } = access()
    const statusOnly = await capabilities.issue('job-1', ['status'])
    expect(
      await capabilities.issueLiveTicket('job-1', statusOnly.token),
    ).toBeNull()
  })

  test('depends only on the CapabilityStore port', async () => {
    const backing = new InMemoryCapabilityStore()
    const store: CapabilityStore = backing
    const capabilities = new JobCapabilityAccess({ store, hashKey })
    expect((await capabilities.issue('job-1')).token).toBeTruthy()
  })
})
