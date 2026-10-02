import { describe, expect, test } from 'bun:test'
import { assessScanCoverage } from './scan-coverage'

const captured = {
  url: 'https://example.com/',
  status: 'observed' as const,
  screenshotPath: '/evidence/page.jpg',
  visualCheckAvailable: true,
}

describe('scan coverage', () => {
  test('withholds complete coverage when a reached page has no visual analysis', () => {
    const coverage = assessScanCoverage('deep', [
      captured,
      { ...captured, status: 'reached', visualCheckAvailable: false },
    ])
    expect(coverage.status).toBe('partial')
    expect(coverage.missingVisual).toBe(true)
    expect(coverage.completed).toBe(2)
  })
  test('does not interpret legacy missing visual metadata as successful analysis', () => {
    expect(
      assessScanCoverage('deep', [
        { ...captured, visualCheckAvailable: undefined },
      ]).status,
    ).toBe('partial')
  })
  test('distinguishes homepage observations from a reached journey', () => {
    expect(assessScanCoverage('deep', [captured, captured]).scope).toBe('page')
    expect(
      assessScanCoverage('deep', [captured, { ...captured, status: 'reached' }])
        .scope,
    ).toBe('journey')
  })
  test('does not call a verification screenshot completed target coverage', () => {
    expect(
      assessScanCoverage('quick', [
        { ...captured, url: 'https://example.com/captcha' },
      ]).status,
    ).toBe('blocked')
  })
  test('requires reviewable page evidence before a result is complete', () => {
    expect(
      assessScanCoverage('quick', [{ ...captured, screenshotPath: undefined }])
        .status,
    ).toBe('missing')
    expect(assessScanCoverage('deep', []).status).toBe('missing')
  })
  test('failed navigation limits a fully analyzed earlier page', () => {
    const coverage = assessScanCoverage('deep', [
      captured,
      { ...captured, status: 'not-reached' },
    ])
    expect(coverage.status).toBe('partial')
    expect(coverage.completed).toBe(1)
    expect(coverage.total).toBe(2)
  })
  test('a real captured and analyzed journey remains complete', () => {
    expect(
      assessScanCoverage('deep', [
        captured,
        { ...captured, url: 'https://example.com/cart', status: 'reached' },
      ]).status,
    ).toBe('complete')
  })
})
