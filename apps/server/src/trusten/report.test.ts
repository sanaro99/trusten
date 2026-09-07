import { describe, expect, test } from 'bun:test'
import { generateReportHtml } from './report'
import { DarkPatternCategory, type ScanResult } from './types'

function scanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    id: 'scan-report-test',
    url: 'https://example.com/start?session=private#offer',
    domain: 'example.com',
    scanType: 'deep',
    startedAt: '2026-09-06T10:00:00.000Z',
    completedAt: '2026-09-06T10:01:00.000Z',
    patterns: [],
    score: {
      numeric: 82,
      grade: 'B',
      categoryBreakdown: {},
      summary: 'Internal score summary that should not be shown.',
    },
    ...overrides,
  }
}

describe('generateReportHtml', () => {
  test('makes incomplete coverage obvious without exposing navigation internals', () => {
    const result = scanResult({
      workflowSteps: [
        {
          stepNumber: 1,
          action: 'Use the search field and submit the query',
          url: 'https://example.com/search?q=shoes&session=private',
          screenshot: '',
          patternsFound: [],
          timestamp: '2026-09-06T10:00:10.000Z',
          status: 'reached',
          navReason: 'DOM materially changed',
        },
        {
          stepNumber: 2,
          action: 'Use selector #cart after opening a product',
          url: 'https://example.com/search?q=shoes&session=private',
          screenshot: '',
          patternsFound: [],
          timestamp: '2026-09-06T10:00:20.000Z',
          status: 'not-reached',
          navReason: 'LLM fallback: selector #cart timed out',
        },
        {
          stepNumber: 3,
          action: 'Navigate to checkout',
          url: 'https://example.com/search?q=shoes&session=private',
          screenshot: '',
          patternsFound: [],
          timestamp: '2026-09-06T10:00:30.000Z',
          status: 'skipped',
          navReason: 'Skipped because prior navigation failed',
        },
      ],
    })

    const html = generateReportHtml(result, 'Automated ecommerce workflow')

    expect(html).toContain('Limited check')
    expect(html).toContain('1 of 3 steps completed')
    expect(html).toContain('Provisional grade B for the pages checked')
    expect(html).toContain('Search the website')
    expect(html).toContain("Couldn't continue")
    expect(html).toContain('https://example.com/search')
    expect(html).not.toContain('session=private')
    expect(html).not.toContain('LLM fallback')
    expect(html).not.toContain('selector #cart')
    expect(html).not.toContain('Internal score summary')
    expect(html).not.toContain('Trust Score')
  })

  test('uses plain website language for findings and avoids false certainty', () => {
    const pattern = {
      id: 'pattern-1',
      category: DarkPatternCategory.FAKE_URGENCY,
      severity: 'high' as const,
      confidence: 0.72,
      description: 'Timer detected by internal analyzer.',
      element: {
        selector: '#timer',
        text: 'Offer ends in 04:59',
        html: '<div id="timer">Offer ends in 04:59</div>',
      },
      evidence: { domSnapshot: '<html>large internal snapshot</html>' },
      regulatoryViolations: [],
      detectedAt: '2026-09-06T10:00:10.000Z',
      url: 'https://example.com/item',
      pageTitle: 'Example item',
    }
    const html = generateReportHtml(
      scanResult({
        patterns: [pattern],
        score: { numeric: 64, grade: 'C', categoryBreakdown: {}, summary: '' },
      }),
    )

    expect(html).toContain('This website uses some unfair tricks')
    expect(html).toContain('A fake deadline')
    expect(html).toContain('This website used a countdown')
    expect(html).toContain('What Trusten saw')
    expect(html).toContain('Offer ends in 04:59')
    expect(html).toContain('Possible concern')
    expect(html).not.toContain('large internal snapshot')
    expect(html).not.toContain('% confidence')
    expect(html).not.toContain('No dark patterns found')
  })
})
