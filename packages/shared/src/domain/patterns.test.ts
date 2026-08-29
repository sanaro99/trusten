import { describe, expect, test } from 'bun:test'
import {
  DarkPatternCategory,
  DetectedPatternSchema,
  SeveritySchema,
} from './patterns'

const validPattern = {
  id: 'p-1',
  category: DarkPatternCategory.FAKE_URGENCY,
  severity: 'critical',
  confidence: 0.87,
  description: 'Urgency language detected.',
  evidence: {},
  regulatoryViolations: [],
  detectedAt: '2026-08-28T10:00:00.000Z',
  url: 'https://example.com/checkout',
  pageTitle: 'Checkout',
}

describe('DetectedPatternSchema', () => {
  test('parses a well-formed pattern', () => {
    const parsed = DetectedPatternSchema.parse(validPattern)
    expect(parsed.category).toBe(DarkPatternCategory.FAKE_URGENCY)
    expect(parsed.confidence).toBe(0.87)
  })

  test('rejects an unknown severity', () => {
    expect(() =>
      DetectedPatternSchema.parse({ ...validPattern, severity: 'apocalyptic' }),
    ).toThrow()
  })

  test('rejects confidence outside 0..1', () => {
    expect(() =>
      DetectedPatternSchema.parse({ ...validPattern, confidence: 1.4 }),
    ).toThrow()
  })

  test('accepts an optional element with a bounding box', () => {
    const parsed = DetectedPatternSchema.parse({
      ...validPattern,
      element: {
        selector: '.countdown',
        text: 'Only 2 left',
        html: '<div>Only 2 left</div>',
        boundingBox: { x: 10, y: 20, width: 300, height: 48 },
      },
    })
    expect(parsed.element?.boundingBox?.width).toBe(300)
  })
})

describe('SeveritySchema', () => {
  test('accepts all four internal levels', () => {
    for (const s of ['critical', 'high', 'medium', 'low'] as const) {
      expect(SeveritySchema.parse(s)).toBe(s)
    }
  })
})

describe('DarkPatternCategory', () => {
  test('has 25 members', () => {
    // Verified against the source enum. Note the original file's comment
    // said "24 total" and was wrong -- trust the count, not the comment.
    expect(Object.keys(DarkPatternCategory)).toHaveLength(25)
  })
})
