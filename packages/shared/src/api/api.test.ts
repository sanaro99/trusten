import { describe, expect, test } from 'bun:test'
import {
  AuditRequestSchema,
  QuickScanRequestSchema,
  QuickScanResponseSchema,
} from './audit'
import { AnalyzePageRequestSchema } from './scan'

describe('QuickScanRequestSchema', () => {
  test('accepts a url', () => {
    expect(
      QuickScanRequestSchema.parse({ url: 'https://example.com' }).url,
    ).toBe('https://example.com')
  })

  test('rejects a missing url', () => {
    expect(() => QuickScanRequestSchema.parse({})).toThrow()
  })

  test('rejects a non-string url — the hole the old cast left open', () => {
    expect(() => QuickScanRequestSchema.parse({ url: 42 })).toThrow()
  })

  test('trims surrounding whitespace', () => {
    expect(
      QuickScanRequestSchema.parse({ url: '  https://example.com  ' }).url,
    ).toBe('https://example.com')
  })

  test('accepts an optional Turnstile token', () => {
    const parsed = QuickScanRequestSchema.parse({
      url: 'https://example.com',
      turnstileToken: 'test-token',
    })
    expect(parsed.turnstileToken).toBe('test-token')
  })
})

describe('QuickScanResponseSchema', () => {
  test('parses the literal shape the /api/quick-scan handler returns', () => {
    // patterns is a count here, not the DetectedPattern array ScanDetail
    // carries — this schema mirrors the summary response, not a full scan.
    const parsed = QuickScanResponseSchema.parse({
      scanId: 'scan-1',
      domain: 'example.com',
      grade: 'B',
      score: 82,
      patterns: 3,
    })
    expect(parsed.scanId).toBe('scan-1')
    expect(parsed.patterns).toBe(3)
  })

  test('rejects a patterns array — that would be ScanDetail, not this', () => {
    expect(() =>
      QuickScanResponseSchema.parse({
        scanId: 'scan-1',
        domain: 'example.com',
        grade: 'B',
        score: 82,
        patterns: [],
      }),
    ).toThrow()
  })
})

describe('AuditRequestSchema', () => {
  test('defaults mode to fixed and watch to false', () => {
    const parsed = AuditRequestSchema.parse({ url: 'https://example.com' })
    expect(parsed.mode).toBe('fixed')
    expect(parsed.watch).toBe(false)
  })

  test('rejects an unknown mode', () => {
    expect(() =>
      AuditRequestSchema.parse({ url: 'https://example.com', mode: 'psychic' }),
    ).toThrow()
  })

  test('accepts an optional Turnstile token', () => {
    const parsed = AuditRequestSchema.parse({
      url: 'https://example.com',
      turnstileToken: 'test-token',
    })
    expect(parsed.turnstileToken).toBe('test-token')
  })
})

describe('AnalyzePageRequestSchema', () => {
  test('requires url and html', () => {
    expect(() =>
      AnalyzePageRequestSchema.parse({ url: 'https://example.com' }),
    ).toThrow()
  })

  test('defaults optional text fields to empty strings', () => {
    const parsed = AnalyzePageRequestSchema.parse({
      url: 'https://example.com',
      html: '<html></html>',
    })
    expect(parsed.text).toBe('')
    expect(parsed.pageTitle).toBe('')
  })
})
