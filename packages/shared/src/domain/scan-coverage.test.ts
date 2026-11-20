import { describe, expect, test } from 'bun:test'
import {
  assessScanCoverage,
  journeyStopCause,
  journeyStopSentence,
  UNAVAILABLE_STEP_REASONS,
  unavailableStepCopy,
} from './scan-coverage'

const captured = {
  url: 'https://example.com/',
  status: 'observed' as const,
  screenshotPath: '/evidence/page.jpg',
  visualCheckAvailable: true,
}

describe('scan coverage', () => {
  test('journeys the website does not offer do not make a check limited', () => {
    const coverage = assessScanCoverage('deep', [
      captured,
      { ...captured, status: 'reached', url: 'https://example.com/pricing' },
      { url: 'https://example.com/', status: 'unavailable' },
      { url: 'https://example.com/', status: 'unavailable' },
    ])
    expect(coverage.status).toBe('complete')
    expect(coverage.total).toBe(2)
    expect(coverage.unavailable).toBe(2)
  })
  test('a check where every journey was unavailable is still limited', () => {
    expect(
      assessScanCoverage('deep', [
        { url: 'https://example.com/', status: 'unavailable' },
      ]).status,
    ).toBe('partial')
  })
  test('a text-only extension check is limited, not unverifiable', () => {
    const coverage = assessScanCoverage('quick', [
      {
        url: 'https://example.com/',
        status: 'observed',
        pageTextCaptured: true,
      },
    ])
    expect(coverage.status).toBe('partial')
    expect(coverage.textOnly).toBe(true)
    expect(coverage.missingVisual).toBe(true)
  })
  test('a step without screenshot or page text still has no evidence', () => {
    expect(
      assessScanCoverage('quick', [
        { url: 'https://example.com/', status: 'observed' },
      ]).status,
    ).toBe('missing')
  })
  test('a truncated extension capture is not a complete page check', () => {
    expect(
      assessScanCoverage('quick', [{ ...captured, captureTruncated: true }])
        .status,
    ).toBe('partial')
  })
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
  test('a journey that ends before personal details stays complete', () => {
    const coverage = assessScanCoverage('deep', [
      captured,
      { ...captured, status: 'reached', url: 'https://example.com/book' },
      {
        url: 'https://example.com/book',
        status: 'unavailable',
        navReason: UNAVAILABLE_STEP_REASONS.needsDetails,
      },
    ])
    expect(coverage.status).toBe('complete')
    expect(coverage.completed).toBe(2)
    expect(coverage.total).toBe(2)
  })
})

describe('unavailable step copy', () => {
  test('names why each step was left out', () => {
    expect(unavailableStepCopy(UNAVAILABLE_STEP_REASONS.notOffered).label).toBe(
      'Not on this website',
    )
    expect(unavailableStepCopy(UNAVAILABLE_STEP_REASONS.notOnPage).label).toBe(
      'Not found',
    )
    expect(
      unavailableStepCopy(UNAVAILABLE_STEP_REASONS.needsDetails).outcome,
    ).toContain('never enters')
    expect(unavailableStepCopy(UNAVAILABLE_STEP_REASONS.noResponse).label).toBe(
      'Journey ended here',
    )
  })
  test('older saved steps without a known reason keep the original wording', () => {
    expect(unavailableStepCopy(undefined).label).toBe('Not on this website')
    expect(unavailableStepCopy('Target page returned HTTP 404').label).toBe(
      'Not on this website',
    )
  })
})

describe('journey stop cause', () => {
  const stopped = (navReason: string) => [
    captured,
    { url: 'https://example.com/next', status: 'not-reached', navReason },
  ]
  test('reads the reason a journey stopped', () => {
    expect(journeyStopCause([captured])).toBeNull()
    expect(journeyStopCause(stopped('Target page returned HTTP 403'))).toBe(
      'blocked',
    )
    expect(journeyStopCause(stopped('Target page returned HTTP 500'))).toBe(
      'page-error',
    )
    expect(
      journeyStopCause(
        stopped('The page stopped responding during this step (Target closed)'),
      ),
    ).toBe('page-error')
    expect(
      journeyStopCause(
        stopped('LLM fallback: LLM unavailable: Error: rate limited'),
      ),
    ).toBe('ai')
    expect(journeyStopCause(stopped('LLM fallback: Stuck: no cart'))).toBe(
      'navigation',
    )
  })
  test('treats a verification page as a block', () => {
    expect(
      journeyStopCause([
        { ...captured, url: 'https://example.com/captcha' },
        { url: 'https://example.com/', status: 'not-reached' },
      ]),
    ).toBe('blocked')
  })
  test('never blames the website for an AI outage', () => {
    expect(journeyStopSentence('ai')).not.toMatch(/website blocked/)
    expect(journeyStopSentence('navigation')).not.toMatch(/website/)
  })
})
