import { describe, expect, test } from 'bun:test'
import type { ScanHistoryRow } from '@trusten/shared/api'
import { ApiError } from './api'
import { findSavedEvidence, validateWebsiteInput } from './submission'

function saved(id: string, url: string, scanType = 'quick'): ScanHistoryRow {
  return {
    id,
    url,
    domain: new URL(url).hostname,
    scanType,
    workflowId: null,
    startedAt: '2026-10-01T00:00:00Z',
    completedAt: '2026-10-01T00:01:00Z',
    scoreNumeric: 90,
    scoreGrade: 'A',
    quickCoverage: 'complete',
    patternCount: 0,
    criticalCount: 0,
    highCount: 0,
    pdfPath: null,
    htmlPath: null,
    createdAt: '2026-10-01T00:01:00Z',
  }
}

describe('website submission preflight', () => {
  test('normalizes a bare address and rejects malformed input before visitor verification', () => {
    expect(validateWebsiteInput('  example.com/store  ')).toBe(
      'https://example.com/store',
    )
    for (const input of [
      '',
      'not a website',
      'https://',
      'javascript:alert(1)',
      'https://exa mple.com',
    ]) {
      expect(validateWebsiteInput(input)).toBeNull()
    }
  })
})

describe('saved evidence after admission limits', () => {
  test('offers only a matching URL and check type, keeping paths and queries distinct', async () => {
    const history = [
      saved('other-page', 'https://example.com/checkout'),
      saved('wrong-type', 'https://example.com/', 'deep'),
      saved('matching', 'https://example.com/'),
    ]
    const result = await findSavedEvidence(
      new ApiError(429, 'SESSION_QUOTA_EXCEEDED'),
      'https://example.com',
      'quick',
      async () => ({ scans: history, total: history.length }),
    )
    expect(result?.id).toBe('matching')
    expect(
      await findSavedEvidence(
        new ApiError(429, 'DOMAIN_QUOTA_EXCEEDED'),
        'https://example.com/?offer=2',
        'quick',
        async () => ({ scans: history, total: history.length }),
      ),
    ).toBeNull()
  })

  test('does not read history when visitor verification or target policy fails', async () => {
    let reads = 0
    for (const code of [
      'BOT_TOKEN_INVALID',
      'TARGET_REJECTED',
      'SITE_BLOCKED',
    ]) {
      expect(
        await findSavedEvidence(
          new ApiError(403, code),
          'https://example.com',
          'quick',
          async () => {
            reads++
            return { scans: [], total: 0 }
          },
        ),
      ).toBeNull()
    }
    expect(reads).toBe(0)
  })

  test('keeps the admission message usable when saved history is unavailable', async () => {
    expect(
      await findSavedEvidence(
        new ApiError(429, 'IP_QUOTA_EXCEEDED'),
        'https://example.com',
        'deep',
        async () => {
          throw new TypeError('offline')
        },
      ),
    ).toBeNull()
  })
})
