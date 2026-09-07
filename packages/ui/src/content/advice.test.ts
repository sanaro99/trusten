import { describe, expect, test } from 'bun:test'
import { DarkPatternCategory } from '@trusten/shared/domain'
import { PATTERN_ADVICE } from './advice'

describe('PATTERN_ADVICE', () => {
  test('gives every finding a short, practical next step', () => {
    expect(Object.keys(PATTERN_ADVICE).sort()).toEqual(
      Object.values(DarkPatternCategory).sort(),
    )
    for (const advice of Object.values(PATTERN_ADVICE)) {
      expect(advice.length).toBeGreaterThan(20)
      expect(advice).not.toMatch(/dark pattern|confidence|heuristic|analyzer/i)
    }
  })
})
