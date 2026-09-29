import { describe, expect, test } from 'bun:test'
import { ApiError, api, publicScanErrorMessage } from './api'

describe('publicScanErrorMessage', () => {
  test('explains safety, quota, capacity, and bot-check failures', () => {
    expect(
      publicScanErrorMessage(new ApiError(403, 'TARGET_REJECTED')),
    ).toContain('safely')
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

  test.each([
    'SESSION_QUOTA_EXCEEDED',
    'IP_QUOTA_EXCEEDED',
  ])('explains the visitor demo limit for %s', (code) => {
    const message = publicScanErrorMessage(new ApiError(429, code, 90))
    expect(message).toContain('demo limit')
    expect(message).toContain('2 minutes')
  })

  test('explains a website cooldown without blaming the visitor quota', () => {
    const message = publicScanErrorMessage(
      new ApiError(429, 'DOMAIN_QUOTA_EXCEEDED', 30),
    )
    expect(message).toContain('This website was checked recently')
    expect(message).toContain('30 seconds')
    expect(message).toContain('different website')
    expect(message).not.toContain('demo limit')
  })

  test('explains an ordinary rate limit with its retry delay', () => {
    const message = publicScanErrorMessage(new ApiError(429, undefined, 5))
    expect(message).toContain('Too many requests')
    expect(message).toContain('5 seconds')
    expect(message).not.toContain('demo limit')
  })

  test('does not invent a retry delay when the server omits it', () => {
    const message = publicScanErrorMessage(new ApiError(429))
    expect(message).toContain('Too many requests')
    expect(message).toContain('later')
  })

  test('directs blocked-site checks to the Chrome extension', () => {
    const message = publicScanErrorMessage(new ApiError(422, 'SITE_BLOCKED'))
    expect(message).toContain('website blocked')
    expect(message).toContain('Chrome extension')
    expect(message).not.toContain('checking service')
  })

  test('explains that a page is still loading', () => {
    const message = publicScanErrorMessage(new ApiError(422, 'PAGE_NOT_READY'))
    expect(message).toContain('page did not finish loading')
    expect(message).toContain('try again')
  })

  test('explains a website load failure separately from service availability', () => {
    const message = publicScanErrorMessage(
      new ApiError(422, 'PAGE_LOAD_FAILED'),
    )
    expect(message).toContain('could not load that website')
    expect(message).not.toContain('checking service')
  })

  test('explains an actual service outage', () => {
    expect(
      publicScanErrorMessage(new ApiError(503, 'SERVICE_UNAVAILABLE')),
    ).toContain('service is temporarily unavailable')
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
  test('preserves a website cooldown code and Retry-After from the service', async () => {
    const fetcher = async () =>
      Response.json(
        { error: 'Quota exceeded', code: 'DOMAIN_QUOTA_EXCEEDED' },
        { status: 429, headers: { 'Retry-After': '30' } },
      )

    const error = await api
      .quickScan({ url: 'https://example.com' }, fetcher)
      .catch((error: unknown) => error)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('DOMAIN_QUOTA_EXCEEDED')
    expect((error as ApiError).retryAfterSeconds).toBe(30)
    expect(publicScanErrorMessage(error)).toContain('30 seconds')
  })

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

describe('scan request payloads', () => {
  test('sends the shared normalized URL for a quick scan', async () => {
    let body: unknown
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return Response.json({
        scanId: 'scan-1',
        domain: 'temu.com',
        grade: 'B',
        score: 82,
        patterns: 3,
      })
    }

    await api.quickScan({ url: ' temu.com/products?q=1 ' }, fetcher)

    expect(body).toEqual({ url: 'https://temu.com/products?q=1' })
  })

  test('sends the shared normalized URL for a deep audit', async () => {
    let body: unknown
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return Response.json({
        jobId: 'job-1',
        domain: 'temu.com',
        capabilityToken: 'capability-1',
        capabilityExpiresAt: 123456,
      })
    }

    await api.startAudit(
      { url: 'temu.com', mode: 'fixed', watch: false },
      fetcher,
    )

    expect(body).toEqual({
      url: 'https://temu.com',
      mode: 'fixed',
      watch: false,
    })
  })

  test('reports an empty URL as an input error before sending it', async () => {
    let requested = false
    const fetcher = async () => {
      requested = true
      return Response.json({ error: 'Unexpected request' }, { status: 500 })
    }

    const error = await api
      .quickScan({ url: ' ' }, fetcher)
      .catch((error: unknown) => error)

    expect(requested).toBe(false)
    expect(publicScanErrorMessage(error)).toContain('valid website address')
  })
})
