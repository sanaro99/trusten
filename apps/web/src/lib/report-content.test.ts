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
    screenshotPath: '/evidence/page.jpg',
    visualCheckAvailable: true,
  }))

describe('getReportSummary', () => {
  test('does not call a visually incomplete journey fair', () => {
    const incomplete = steps(['observed', 'reached'])
    incomplete[1].visualCheckAvailable = false
    const summary = getReportSummary('A', 0, incomplete)
    expect(summary.limited).toBe(true)
    expect(summary.headline).not.toMatch(/fair/)
    expect(summary.sub).toContain('visual')
  })
  test('describes homepage-only observations as a page check', () => {
    const summary = getReportSummary('A', 0, steps(['observed', 'observed']))
    expect(summary.headline).toContain('page')
    expect(summary.headline).not.toMatch(/website looks fair/)
  })
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

  test('does not give a conclusive grade when only the final checkout step was blocked', () => {
    const summary = getReportSummary(
      'A',
      0,
      steps(['reached', 'observed', 'reached', 'reached', 'not-reached']),
    )

    expect(summary.limited).toBe(true)
    expect(summary.completed).toBe(4)
    expect(summary.total).toBe(5)
    expect(summary.headline).not.toMatch(/fair|good|grade/i)
    expect(summary.sub).toContain('4 of 5 journey steps')
    expect(summary.sub).toContain('not conclusive')
  })

  test('keeps the normal verdict for a fully completed journey', () => {
    expect(
      getReportSummary('B', 1, steps(['reached', 'observed', 'reached']))
        .limited,
    ).toBe(false)
  })
})
