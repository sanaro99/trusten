import { describe, expect, test } from 'bun:test'
import { gradeHeadline } from './grade'

describe('gradeHeadline', () => {
  test('gives a plain sentence, never a score', () => {
    const { headline, sub } = gradeHeadline('D', 4)
    expect(headline).toBe('This website uses several unfair tricks')
    expect(sub).toContain('4 things')
    expect(`${headline} ${sub}`).not.toMatch(/\d+\s*\/\s*100|score/i)
  })

  test('reassures plainly when nothing was found', () => {
    const { headline, sub } = gradeHeadline('A', 0)
    expect(headline).toMatch(/fair|nothing|clean/i)
    expect(sub).not.toMatch(/0 things/)
  })

  test('uses singular wording for a single finding', () => {
    expect(gradeHeadline('B', 1).sub).toContain('1 thing you should know')
  })

  test('covers every grade', () => {
    for (const g of ['A', 'B', 'C', 'D', 'F'] as const) {
      expect(gradeHeadline(g, 2).headline.length).toBeGreaterThan(0)
    }
  })
})
