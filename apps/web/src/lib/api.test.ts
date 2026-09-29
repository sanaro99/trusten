import { describe, expect, test } from 'bun:test'
import { ApiError, api, publicScanErrorMessage } from './api'

describe('publicScanErrorMessage', () => {
  test('explains safety, quota, capacity, and bot-check failures', () => {
    expect(
      publicScanErrorMessage(new ApiError(403, 'TARGET_REJECTED')),
    ).toContain('safely')
    expect(publicScanErrorMessage(new ApiError(429))).toContain('demo limit')
    expect(publicScanErrorMessage(new ApiError(503, 'DEMO_BUSY'))).toContain(
      'busy',
    )
    expect(publicScanErrorMessage(new ApiError(403, 'BOT_REJECTED'))).toContain(
      'visitor check',
    )
    expect(
      publicScanErrorMessage(new ApiError(422, 'SCAN_INCOMPLETE')),
    ).toContain('could not inspect enough')
  })

  test('keeps a generic fallback for transport failures', () => {
    expect(publicScanErrorMessage(new Error('offline'))).toContain(
      'checking service',
    )
  })

  test('explains an unavailable audit or saved check after a terminal not-found response', () => {
    expect(publicScanErrorMessage(new ApiError(404))).toContain(
      'no longer available',
    )
  })
})

describe('API failures', () => {
  test('preserves service error details for audit status requests', async () => {
    const response = new Response(
      JSON.stringify({ error: 'Not authorized', code: 'BOT_REJECTED' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
    const fetcher = async () => response

    const error = await api
      .getAuditStatus('job', 'token', fetcher)
      .catch((error: unknown) => error)

    expect(error).toBeInstanceOf(ApiError)
    expect(publicScanErrorMessage(error)).toContain('visitor check')
  })

  test('explains invalid URLs after the service rejects a quick check', async () => {
    const fetcher = async () =>
      Response.json({ error: 'Invalid URL' }, { status: 400 })

    const error = await api
      .quickScan({ url: 'not a url' }, fetcher)
      .catch((error: unknown) => error)

    expect(publicScanErrorMessage(error)).toContain('valid website address')
  })

  test('explains a website refusing checks without calling it a connection failure', async () => {
    const fetcher = async () =>
      Response.json(
        { error: "Scanning this URL is disallowed by the site's robots.txt" },
        { status: 403 },
      )

    const error = await api
      .quickScan({ url: 'https://example.com' }, fetcher)
      .catch((error: unknown) => error)

    expect(publicScanErrorMessage(error)).toContain('does not allow')
  })

  test('handles a malformed error code without crashing the scan error display', async () => {
    const fetcher = async () =>
      Response.json({ code: { private: 'diagnostic' } }, { status: 500 })

    const error = await api
      .quickScan({ url: 'https://example.com' }, fetcher)
      .catch((error: unknown) => error)

    expect(publicScanErrorMessage(error)).toContain('could not complete')
  })
})
