import { expect, test } from 'bun:test'
import type { ScanHistoryRow } from '@trusten/shared/api'
import {
  canCompareChecks,
  canonicalDomain,
  groupHistory,
  matchesWebsite,
} from './history-content'
import { hasConclusiveGrade, historyCoverageLabel } from './history-coverage'

function scan(overrides: Partial<ScanHistoryRow> = {}): ScanHistoryRow {
  return {
    id: '1',
    url: 'https://example.com/',
    domain: 'example.com',
    scanType: 'deep',
    workflowId: null,
    startedAt: '',
    completedAt: '',
    scoreNumeric: 100,
    scoreGrade: 'A',
    quickCoverage: null,
    patternCount: 0,
    criticalCount: 0,
    highCount: 0,
    pdfPath: null,
    htmlPath: null,
    createdAt: '2026-10-02T00:00:00Z',
    ...overrides,
  }
}
test('legacy deep and incomplete visual checks cannot establish a grade', () => {
  expect(hasConclusiveGrade(scan())).toBe(false)
  expect(hasConclusiveGrade(scan({ coverage: 'partial' }))).toBe(false)
  expect(historyCoverageLabel(scan({ coverage: 'partial' }))).toBe(
    'Partial check',
  )
  expect(
    hasConclusiveGrade(
      scan({ coverage: 'complete', coverageScope: 'journey' }),
    ),
  ).toBe(true)
})
test('completed single-page checks label their scope', () => {
  expect(
    historyCoverageLabel(scan({ coverage: 'complete', coverageScope: 'page' })),
  ).toBe('Page check only')
})
test('groups www aliases while preserving distinct subdomains', () => {
  expect(canonicalDomain('WWW.Example.com')).toBe('example.com')
  expect(
    groupHistory([
      scan(),
      scan({ id: '2', domain: 'www.example.com' }),
      scan({ id: '3', domain: 'shop.example.com' }),
    ]),
  ).toHaveLength(2)
})
test('full URLs can search a website', () => {
  expect(
    matchesWebsite('example.com', 'https://www.example.com/cart?item=1'),
  ).toBe(true)
  expect(matchesWebsite('shop.example.com', 'https://example.com')).toBe(false)
})
test('trends require matching scope, check type and page for quick checks', () => {
  const full = scan({
    coverage: 'complete',
    coverageScope: 'journey',
    workflowId: 'checkout',
  })
  expect(canCompareChecks(full, full)).toBe(true)
  expect(
    canCompareChecks(
      full,
      scan({ coverage: 'complete', coverageScope: 'page' }),
    ),
  ).toBe(false)
  expect(
    canCompareChecks(
      full,
      scan({ coverage: 'partial', coverageScope: 'journey' }),
    ),
  ).toBe(false)
  const quick = scan({
    scanType: 'quick',
    coverage: 'complete',
    coverageScope: 'page',
  })
  expect(
    canCompareChecks(quick, { ...quick, url: 'https://example.com/cart' }),
  ).toBe(false)
  expect(
    canCompareChecks(quick, {
      ...quick,
      url: 'https://www.example.com/#section',
    }),
  ).toBe(true)
  expect(canCompareChecks(full, quick)).toBe(false)
  expect(
    canCompareChecks(full, { ...full, url: 'https://example.com/cancel' }),
  ).toBe(false)
  expect(
    canCompareChecks(
      { ...full, workflowId: 'full-audit' },
      { ...full, workflowId: 'full-audit' },
    ),
  ).toBe(false)
})
