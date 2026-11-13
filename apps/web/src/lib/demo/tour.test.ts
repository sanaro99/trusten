import { describe, expect, test } from 'bun:test'
import type { ScanHistoryRow } from '@trusten/shared/api'
import {
  isOnStepPage,
  pickExample,
  pickJourney,
  stepPath,
  TOUR_STEPS,
  tourSteps,
} from './tour'

function scan(overrides: Partial<ScanHistoryRow>): ScanHistoryRow {
  return {
    id: 'scan-1',
    url: 'https://shop.example/',
    domain: 'shop.example',
    scanType: 'quick',
    workflowId: null,
    startedAt: '2026-11-01T10:00:00.000Z',
    completedAt: '2026-11-01T10:01:00.000Z',
    scoreNumeric: 60,
    scoreGrade: 'C',
    quickCoverage: 'complete',
    coverage: 'complete',
    coverageScope: 'page',
    patternCount: 3,
    criticalCount: 0,
    highCount: 1,
    pdfPath: null,
    htmlPath: null,
    createdAt: '2026-11-01T10:01:00.000Z',
    ...overrides,
  }
}

describe('demo tour', () => {
  test('shows a complete result with findings over a newer partial one', () => {
    expect(
      pickExample([
        scan({ id: 'partial', coverage: 'partial', completedAt: '2026-11-09' }),
        scan({ id: 'clean', patternCount: 0, completedAt: '2026-11-08' }),
        scan({ id: 'blocked', coverage: 'blocked', completedAt: '2026-11-07' }),
        scan({ id: 'complete', completedAt: '2026-11-02' }),
      ]),
    ).toBe('complete')
  })

  test('prefers a real website to the practice shop', () => {
    expect(
      pickExample([
        scan({
          id: 'practice',
          url: 'https://trusten.example/demo/shop',
          completedAt: '2026-11-09',
        }),
        scan({ id: 'real', completedAt: '2026-11-01' }),
      ]),
    ).toBe('real')
    expect(
      pickExample([
        scan({ id: 'practice', url: 'https://trusten.example/demo/shop' }),
      ]),
    ).toBe('practice')
  })

  test('picks a full check with findings for the journey step', () => {
    expect(
      pickJourney([
        scan({ id: 'page' }),
        scan({
          id: 'empty',
          coverageScope: 'journey',
          patternCount: 0,
          completedAt: '2026-11-09',
        }),
        scan({ id: 'found', coverageScope: 'journey', coverage: 'partial' }),
      ]),
    ).toBe('found')
    expect(pickJourney([scan({ id: 'page' })])).toBeUndefined()
  })

  test('leaves out steps whose saved result is missing', () => {
    const all = tourSteps({ example: 'a', journey: 'b' })
    expect(all).toHaveLength(TOUR_STEPS.length)
    const none = tourSteps({})
    expect(none.some((step) => step.place === 'example')).toBe(false)
    expect(none.some((step) => step.place === 'journey')).toBe(false)
    expect(none[0]?.id).toBe('welcome')
    expect(none.at(-1)?.id).toBe('done')
  })

  test('maps steps to pages', () => {
    const result = TOUR_STEPS.find((step) => step.place === 'example')!
    expect(stepPath(result, { example: 'scan-9' })).toBe('/scan/scan-9')
    expect(isOnStepPage('/scan/scan-9', result, { example: 'scan-9' })).toBe(
      true,
    )
    expect(isOnStepPage('/scan/other', result, { example: 'scan-9' })).toBe(
      false,
    )
    expect(isOnStepPage('/', TOUR_STEPS[0], {})).toBe(true)
  })
})
