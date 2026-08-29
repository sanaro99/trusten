import { describe, expect, test } from 'bun:test'
import { AuditRequestSchema, QuickScanRequestSchema } from './audit'
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
