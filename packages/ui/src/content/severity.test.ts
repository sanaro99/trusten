import { describe, expect, test } from 'bun:test'
import { compareSeverity, SHOWN_LEVELS, toShownLevel } from './severity'

describe('toShownLevel', () => {
  test('collapses critical and high to serious', () => {
    expect(toShownLevel('critical')).toBe('serious')
    expect(toShownLevel('high')).toBe('serious')
  })

  test('maps medium to worth-knowing and low to minor', () => {
    expect(toShownLevel('medium')).toBe('worth-knowing')
    expect(toShownLevel('low')).toBe('minor')
  })
})

describe('SHOWN_LEVELS', () => {
  test('every level has a label, an explanation and an icon', () => {
    for (const level of Object.values(SHOWN_LEVELS)) {
      expect(level.label.length).toBeGreaterThan(0)
      expect(level.meaning.length).toBeGreaterThan(0)
      expect(level.icon.length).toBeGreaterThan(0)
    }
  })

  test('never relies on colour alone — each level carries a word', () => {
    // Accessibility constraint: colour + word + icon (spec 2.3)
    for (const level of Object.values(SHOWN_LEVELS)) {
      expect(level.label).not.toMatch(/^#[0-9a-f]{3,8}$/i)
    }
  })

  test('uses no internal jargon in shown copy', () => {
    const banned = /severity|confidence|dark pattern|analyzer/i
    for (const level of Object.values(SHOWN_LEVELS)) {
      expect(level.label).not.toMatch(banned)
      expect(level.meaning).not.toMatch(banned)
    }
  })
})

describe('compareSeverity', () => {
  test('sorts most serious first', () => {
    const sorted = (['low', 'critical', 'medium', 'high'] as const)
      .slice()
      .sort(compareSeverity)
    expect(sorted).toEqual(['critical', 'high', 'medium', 'low'])
  })
})
