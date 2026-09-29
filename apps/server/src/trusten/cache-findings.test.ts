import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import type { BrowserDriver } from './browser/driver'
import { TrustenEngine } from './index'
import { getTrustenLLM } from './llm/client'
import type { ScanStore } from './store'
import {
  DarkPatternCategory,
  type DetectedPattern,
  type ScanResult,
} from './types'

const url = 'https://example.test/books'
const cachedAt = '2026-09-28T12:00:00.000Z'
const llm = getTrustenLLM()
let restoreCompletion: (() => void) | undefined
beforeEach(() => {
  const completion = spyOn(llm, 'complete').mockRejectedValue(
    new Error('No model in this deterministic test'),
  )
  restoreCompletion = () => completion.mockRestore()
})
afterEach(() => restoreCompletion?.())

function cachedPattern(
  id: string,
  html = '',
  category = DarkPatternCategory.DISGUISED_ADS,
): DetectedPattern {
  return {
    id,
    category,
    severity: 'high',
    confidence: 0.85,
    description: 'Cached concern from a previous deep journey',
    element: { selector: `[data-cached="${id}"]`, html, text: '' },
    evidence: { domSnapshot: html },
    regulatoryViolations: [],
    detectedAt: cachedAt,
    url,
    pageTitle: 'Books',
  }
}

function fixture(patterns: DetectedPattern[]) {
  const saved: ScanResult[] = []
  const store: ScanStore = {
    saveScan: async (result) => {
      saved.push(result)
    },
    cachePageFindings: async () => {},
    getCachedPageFindings: async () => ({
      patterns,
      cachedAt,
      scanId: 'previous-deep-scan',
    }),
  }
  const browser = {} as BrowserDriver
  return { engine: new TrustenEngine(browser, undefined, store), saved }
}

async function analyze(patterns: DetectedPattern[]) {
  const { engine, saved } = fixture(patterns)
  const result = await engine.analyzeProvidedContent(
    url,
    '<main><h1>Books</h1><p>Browse our reading guides.</p></main>',
    'Books. Browse our reading guides.',
    'Books',
  )
  expect(saved).toHaveLength(1)
  return result
}

describe('cached advertising findings', () => {
  test('a clean live scan drops obsolete header, clearly labeled ad, plain-text, and missing-evidence claims', async () => {
    const result = await analyze([
      cachedPattern('old-header', '<div class="page-header action">'),
      cachedPattern(
        'labeled-ad',
        '<div class="ad-container"><div>Partner product</div><span>Sponsored</span></div>',
      ),
      cachedPattern(
        'ordinary-mention',
        '<p>There are no ads on this page.</p>',
      ),
      cachedPattern('empty-slot', '<div class="ad-slot"></div>'),
      cachedPattern('unsupported-claim'),
    ])

    expect(
      result.patterns.filter(
        (pattern) => pattern.category === DarkPatternCategory.DISGUISED_ADS,
      ),
    ).toEqual([])
    expect(result.score.grade).toBe('A')
  })

  test('retains genuine tiny and unlabeled ad evidence from an earlier journey after a clean live scan', async () => {
    const result = await analyze([
      cachedPattern(
        'tiny-disclosure',
        '<span style="font-size:9px">Sponsored</span>',
      ),
      cachedPattern(
        'unlabeled-content',
        '<article class="native ad-container"><h2>Partner product</h2><a href="/offer">Learn more</a></article>',
      ),
      cachedPattern(
        'other-journey-finding',
        '',
        DarkPatternCategory.HARD_TO_CANCEL,
      ),
    ])

    expect(result.patterns.map((pattern) => pattern.id)).toEqual([
      'tiny-disclosure',
      'unlabeled-content',
      'other-journey-finding',
    ])
    expect(
      result.patterns.every(
        (pattern) =>
          pattern.source === 'deep-cache' && pattern.cachedAt === cachedAt,
      ),
    ).toBe(true)
  })

  test('supports actual element HTML evidence when the older cache has no DOM snapshot', async () => {
    const valid = cachedPattern(
      'element-only',
      '<span style="font-size:9px">Sponsored</span>',
    )
    valid.evidence = {}
    const result = await analyze([valid])

    expect(result.patterns.map((pattern) => pattern.id)).toEqual([
      'element-only',
    ])
  })

  test('does not use an unrelated real ad elsewhere in saved page HTML to validate an obsolete header claim', async () => {
    const invalid = cachedPattern(
      'old-header',
      '<div class="page-header action">',
    )
    invalid.evidence.domSnapshot =
      '<div class="page-header action"><h1>Books</h1></div><aside class="ad-container"><h2>Partner offer</h2></aside>'
    const result = await analyze([invalid])

    expect(result.patterns).toEqual([])
  })

  test('uses saved element HTML when a historical DOM excerpt contains only plain text', async () => {
    const valid = cachedPattern(
      'tiny-element',
      '<span style="font-size:9px">Sponsored</span>',
    )
    valid.evidence.domSnapshot = 'A paid offer appeared in the earlier journey.'
    const result = await analyze([valid])

    expect(result.patterns.map((pattern) => pattern.id)).toEqual([
      'tiny-element',
    ])
  })
})
