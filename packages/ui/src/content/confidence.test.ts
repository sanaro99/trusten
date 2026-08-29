import { describe, expect, test } from 'bun:test'
import { CONFIDENCE_PREFIX, toConfidenceBand } from './confidence'

describe('toConfidenceBand', () => {
  test('states findings we are sure about', () => {
    expect(toConfidenceBand(0.9)).toBe('stated')
    expect(toConfidenceBand(0.8)).toBe('stated')
  })

  test('hedges the middle band', () => {
    expect(toConfidenceBand(0.75)).toBe('hedged')
    expect(toConfidenceBand(0.7)).toBe('hedged')
  })

  test('moves weak findings aside', () => {
    expect(toConfidenceBand(0.69)).toBe('aside')
    expect(toConfidenceBand(0.55)).toBe('aside')
  })
})

describe('CONFIDENCE_PREFIX', () => {
  test('never contains a number', () => {
    for (const prefix of Object.values(CONFIDENCE_PREFIX)) {
      expect(prefix).not.toMatch(/\d/)
    }
  })

  test('reads as plain English', () => {
    expect(CONFIDENCE_PREFIX.stated).toBe('We found')
    expect(CONFIDENCE_PREFIX.hedged).toBe('This looks like')
  })
})
