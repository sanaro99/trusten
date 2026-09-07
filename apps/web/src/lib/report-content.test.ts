import { describe, expect, test } from 'bun:test'
import type { WorkflowStep } from '@trusten/shared/api'
import { getReportSummary } from './report-content'

const steps = (statuses: WorkflowStep['status'][]): WorkflowStep[] =>
  statuses.map((status, i) => ({
    stepNumber: i + 1,
    action: 'Review the page',
    url: 'https://example.com',
    screenshot: '',
    patternsFound: [],
    timestamp: '2026-01-01T00:00:00Z',
    status,
  }))

describe('getReportSummary', () => {
  test('does not present a grade as conclusive when no journey step succeeded', () => {
    const summary = getReportSummary(
      'A',
      0,
      steps(['not-reached', 'skipped', 'skipped']),
    )
    expect(summary.limited).toBe(true)
    expect(summary.headline).not.toMatch(/fair|good|grade/i)
  })

  test('limits a report when fewer than half the journey succeeded', () => {
    expect(
      getReportSummary('B', 1, steps(['reached', 'not-reached', 'skipped']))
        .limited,
    ).toBe(true)
  })

  test('keeps the normal verdict for a well-covered journey', () => {
    expect(
      getReportSummary('B', 1, steps(['reached', 'observed', 'skipped']))
        .limited,
    ).toBe(false)
  })
})
