import { describe, expect, test } from 'bun:test'
import { DarkPatternCategory } from '@trusten/shared/domain'
import { splitFindings } from './findings'

function pattern(confidence: number, severity: 'critical' | 'low', id: string) {
  return {
    id,
    category: DarkPatternCategory.FAKE_URGENCY,
    severity,
    confidence,
    description: '',
    evidence: {},
    regulatoryViolations: [],
    detectedAt: '',
    url: '',
    pageTitle: '',
  }
}

describe('splitFindings', () => {
  test('moves weak findings aside without discarding them', () => {
    const { main, aside } = splitFindings([
      pattern(0.9, 'critical', 'a'),
      pattern(0.55, 'critical', 'b'),
    ])
    expect(main.map((p) => p.id)).toEqual(['a'])
    expect(aside.map((p) => p.id)).toEqual(['b'])
  })

  test('orders the main list most serious first', () => {
    const { main } = splitFindings([
      pattern(0.9, 'low', 'low-one'),
      pattern(0.9, 'critical', 'critical-one'),
    ])
    expect(main[0].id).toBe('critical-one')
  })

  test('breaks severity ties by how sure we are', () => {
    const { main } = splitFindings([
      pattern(0.82, 'critical', 'less-sure'),
      pattern(0.95, 'critical', 'more-sure'),
    ])
    expect(main[0].id).toBe('more-sure')
  })

  test('handles an empty scan', () => {
    expect(splitFindings([])).toEqual({ main: [], aside: [] })
  })
})
