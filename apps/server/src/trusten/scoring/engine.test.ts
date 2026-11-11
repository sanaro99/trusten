import { expect, test } from 'bun:test'
import type { DetectedPattern } from '../types'
import { calculateScore } from './engine'

function finding(
  severity: DetectedPattern['severity'],
  category = 'fake_urgency',
  confidence = 0.9,
): DetectedPattern {
  return {
    id: `${severity}-${category}-${confidence}`,
    category: category as DetectedPattern['category'],
    severity,
    confidence,
    description: 'Pressure',
    evidence: {},
    regulatoryViolations: [],
    detectedAt: '',
    url: 'https://shop.example',
    pageTitle: 'Shop',
  }
}
test('an important warning prevents an all-clear A grade', () => {
  const score = calculateScore([finding('high')])
  expect(score.numeric).toBeLessThanOrEqual(79)
  expect(score.grade).not.toBe('A')
})
test('a critical concern cannot be summarized as mostly fair', () => {
  const score = calculateScore([finding('critical')])
  expect(score.numeric).toBeLessThanOrEqual(59)
  expect(['A', 'B']).not.toContain(score.grade)
})
test('a category uses each finding severity rather than multiplying the worst severity', () => {
  // high (15) + medium at half weight as the category's second finding (4)
  const score = calculateScore([finding('high'), finding('medium')])
  expect(score.categoryBreakdown.fake_urgency?.score).toBe(19)
})
test('one trick repeated on every page cannot sink a site on its own', () => {
  const repeated = Array.from({ length: 10 }, () => finding('high'))
  expect(calculateScore(repeated).grade).toBe('B')
})
test('several distinct tricks add up below a B', () => {
  const score = calculateScore(
    [
      'fake_urgency',
      'confirmshaming',
      'preselected_options',
      'drip_pricing',
    ].map((category) => finding('high', category)),
  )
  expect(score.numeric).toBe(40)
  expect(score.grade).toBe('C')
})
test('wording-only concerns leave a fair site at A', () => {
  const score = calculateScore([
    finding('medium'),
    finding('medium', 'fake_scarcity'),
  ])
  expect(score.grade).toBe('A')
})
test('a less certain finding weighs half', () => {
  const sure = calculateScore([finding('medium')]).numeric
  const unsure = calculateScore([
    finding('medium', 'fake_urgency', 0.6),
  ]).numeric
  expect(100 - unsure).toBe((100 - sure) / 2)
})
