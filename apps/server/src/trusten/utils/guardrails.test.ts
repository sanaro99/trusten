import { expect, test } from 'bun:test'
import { reserveRateLimit } from './guardrails'

test('a quick check does not block a deep check of the same domain', () => {
  const domain = `${crypto.randomUUID()}.example.com`
  const quick = reserveRateLimit(domain, 'quick')
  expect(quick.allowed).toBe(true)
  const deep = reserveRateLimit(domain, 'audit')
  expect(deep.allowed).toBe(true)
  if (quick.allowed) quick.cancel()
  if (deep.allowed) deep.cancel()
})
