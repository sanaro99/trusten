import { expect, test } from 'bun:test'
import { consolidateFindings, hasCategoryEvidence } from './findings'
import { DarkPatternCategory, type DetectedPattern } from './patterns'

function finding(id: string, text: string, selector = ''): DetectedPattern {
  return {
    id,
    category: DarkPatternCategory.FAKE_URGENCY,
    severity: 'high',
    confidence: 0.85,
    description: 'Time pressure',
    element: { text, selector, html: '' },
    evidence: {},
    regulatoryViolations: [],
    detectedAt: '',
    url: 'https://shop.example/',
    pageTitle: 'Shop',
  }
}
test('merges text and vision evidence of the same banner without losing its locator', () => {
  const result = consolidateFindings([
    finding('text', 'TODAY ONLY', '#promotion'),
    finding('vision', 'TODAY ONLY! $8 PJS 05:00:00'),
  ])
  expect(result).toHaveLength(1)
  expect(result[0].element?.selector).toBe('#promotion')
  expect(result[0].element?.text).toContain('$8 PJS')
})
test('keeps identical messages on two separately identified products', () => {
  expect(
    consolidateFindings([
      finding('one', 'Offer ends soon', '#product-one'),
      finding('two', 'Offer ends soon', '#product-two'),
    ]),
  ).toHaveLength(2)
})
test('keeps separate categories and pages even when their text overlaps', () => {
  const first = finding('one', 'Offer ends soon')
  expect(
    consolidateFindings([
      first,
      { ...first, id: 'two', category: DarkPatternCategory.DARK_CONSENT },
      { ...first, id: 'three', url: 'https://shop.example/cart' },
    ]),
  ).toHaveLength(3)
})
test('does not discard complementary screenshot evidence during a merge', () => {
  const first = finding('one', 'TODAY ONLY')
  first.evidence = { screenshot: undefined, domSnapshot: 'The promotion' }
  const second = finding('two', 'TODAY ONLY! $8 PJS')
  second.evidence = { screenshot: 'image-bytes', domSnapshot: undefined }
  const merged = consolidateFindings([first, second])[0]
  expect(merged.evidence.screenshot).toBe('image-bytes')
  expect(merged.evidence.domSnapshot).toBe('The promotion')
})
test('combines an animated timer label with its visual clock evidence', () => {
  const first = finding('dom', 'Countdown timer', '[class*=countdown]')
  const second = finding('vision', '10h:06m:20s')
  const result = consolidateFindings([first, second])
  expect(result).toHaveLength(1)
  expect(result[0].element?.text).toBe('10h:06m:20s')
})

test('keeps countdowns belonging to different products', () => {
  expect(
    consolidateFindings([
      finding('one', 'Product A offer 01:00:00'),
      finding('two', 'Product B offer 05:00:00'),
    ]),
  ).toHaveLength(2)
})

test('model evidence of a time of day is not a countdown', () => {
  expect(
    hasCategoryEvidence('fake_urgency', 'Construction starts at 10:30'),
  ).toBe(false)
  expect(hasCategoryEvidence('fake_urgency', 'Deal ends in 04:59:12')).toBe(
    true,
  )
  expect(hasCategoryEvidence('fake_urgency', '04:59:12')).toBe(true)
})

test('retail fine print is not a low stock claim', () => {
  expect(
    hasCategoryEvidence('fake_scarcity', 'Limited quantities. No rainchecks.'),
  ).toBe(false)
  expect(
    hasCategoryEvidence('fake_scarcity', 'While supplies last — only 2 left!'),
  ).toBe(true)
})
