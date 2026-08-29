import { describe, expect, test } from 'bun:test'
import { DarkPatternCategory } from '@trusten/shared/domain'
import { getPatternContent, PATTERN_CONTENT } from './patterns'

// Jargon that must never reach a reader (spec 2.2). Includes our own
// vocabulary and the research taxonomy the enum names come from.
const BANNED = [
  'dark pattern',
  'analyzer',
  'heuristic',
  'confidence',
  'severity',
  'deduction',
  'fomo',
  'loss aversion',
  'zuckering',
  'roach motel',
  'confirmshaming',
  'drip pricing',
  'basket sneaking',
  'bait and switch',
  'dark consent',
]

describe('PATTERN_CONTENT', () => {
  test('covers every DarkPatternCategory', () => {
    const missing = Object.values(DarkPatternCategory).filter(
      (c) => !PATTERN_CONTENT[c],
    )
    expect(missing).toEqual([])
  })

  test('every entry fills all five fields', () => {
    for (const [category, content] of Object.entries(PATTERN_CONTENT)) {
      for (const field of ['name', 'what', 'why', 'watchFor', 'lawPlain']) {
        const value = content[field as keyof typeof content]
        expect(
          typeof value === 'string' && value.trim().length > 0,
          `${category}.${field} is empty`,
        ).toBe(true)
      }
    }
  })

  test('uses no jargon anywhere in reader-facing copy', () => {
    for (const [category, content] of Object.entries(PATTERN_CONTENT)) {
      const blob = Object.values(content).join(' ').toLowerCase()
      for (const word of BANNED) {
        expect(blob.includes(word), `${category} contains "${word}"`).toBe(
          false,
        )
      }
    }
  })

  test('keeps sentences short enough to read easily', () => {
    // Rough readability guard: no sentence over 25 words.
    for (const [category, content] of Object.entries(PATTERN_CONTENT)) {
      for (const sentence of `${content.what} ${content.why}`.split(/[.!?]+/)) {
        const words = sentence.trim().split(/\s+/).filter(Boolean)
        expect(
          words.length <= 25,
          `${category} has a ${words.length}-word sentence`,
        ).toBe(true)
      }
    }
  })

  test('marks any entry that disclaims illegality as contested', () => {
    // A lawPlain that hedges must set `contested`, so renderers introduce the
    // citation list as rules regulators have pointed to rather than as proven
    // breaches. Without the flag the card contradicts itself: "not clearly
    // against the law", followed by a citation saying it is prohibited.
    let flagged = 0
    for (const [category, content] of Object.entries(PATTERN_CONTENT)) {
      if (!/not clearly|grey area/i.test(content.lawPlain)) continue
      flagged++
      expect(
        content.contested,
        `${category} hedges its law line without contested: true`,
      ).toBe(true)
    }
    // Guard against the check passing because nothing matched any more.
    expect(flagged).toBeGreaterThan(0)
  })

  test('names do not reuse the enum key', () => {
    // "Fake Urgency" prettified from fake_urgency is not a translation.
    for (const [category, content] of Object.entries(PATTERN_CONTENT)) {
      const prettified = category.replace(/_/g, ' ')
      expect(content.name.toLowerCase()).not.toBe(prettified)
    }
  })
})

describe('getPatternContent', () => {
  test('returns the entry for a known category', () => {
    const content = getPatternContent(DarkPatternCategory.FAKE_URGENCY)
    expect(content.name).toBe('A fake deadline')
  })
})
