import { describe, expect, test } from 'bun:test'
import { ApiError, publicScanErrorMessage } from './api'

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
  })

  test('keeps a generic fallback for transport failures', () => {
    expect(publicScanErrorMessage(new Error('offline'))).toContain(
      'checking service',
    )
  })
})
