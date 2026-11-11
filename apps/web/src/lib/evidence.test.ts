import { describe, expect, test } from 'bun:test'
import type { WorkflowStep } from '@trusten/shared/api'
import {
  DarkPatternCategory,
  type DetectedPattern,
} from '@trusten/shared/domain'
import { findingEvidence, focusView, stepForFinding } from './evidence'

function finding(
  id: string,
  text: string,
  extra: Partial<DetectedPattern> = {},
): DetectedPattern {
  return {
    id,
    category: DarkPatternCategory.DRIP_PRICING,
    severity: 'high',
    confidence: 0.9,
    description: '',
    element: { text, selector: '', html: '' },
    evidence: {},
    regulatoryViolations: [],
    detectedAt: '',
    url: 'https://shop.example/checkout',
    pageTitle: 'Checkout',
    ...extra,
  }
}

function step(
  stepNumber: number,
  url: string,
  patternsFound: DetectedPattern[] = [],
): WorkflowStep {
  return {
    stepNumber,
    action: 'Open checkout',
    url,
    screenshot: '[saved]',
    screenshotPath: `/trusten/report/scan-1/screenshot/${stepNumber}`,
    patternsFound,
    timestamp: '2026-11-11T00:00:00.000Z',
    status: 'reached',
  }
}

describe('finding evidence', () => {
  test('uses the finding’s own screenshot and box', () => {
    const fee = finding('fee', 'Service fee $9', {
      evidence: {
        capture: {
          scanId: 'scan-child',
          file: 'step-2-view-1.jpg',
          box: { x: 0.1, y: 0.8, width: 0.5, height: 0.05 },
        },
      },
    })
    const evidence = findingEvidence(
      'scan-1',
      [step(1, 'https://shop.example/checkout', [fee])],
      fee,
    )
    expect(evidence.src).toBe(
      '/trusten/report/scan-child/capture/step-2-view-1.jpg',
    )
    expect(evidence.box?.y).toBe(0.8)
    expect(evidence.step?.stepNumber).toBe(1)
  })

  test('falls back to the step screenshot without a highlight for older results', () => {
    const fee = finding('fee', 'Service fee $9')
    const evidence = findingEvidence(
      'scan 1',
      [step(3, 'https://shop.example/checkout', [fee])],
      fee,
    )
    expect(evidence.src).toBe('/trusten/report/scan%201/screenshot/3')
    expect(evidence.box).toBeUndefined()
  })

  test('ignores boxes outside the picture and unknown file names', () => {
    const odd = finding('odd', 'x', {
      evidence: {
        capture: {
          scanId: 'scan-1',
          file: 'step-1.jpg',
          box: { x: 0.9, y: 0, width: 0.5, height: 0.1 },
        },
      },
    })
    expect(findingEvidence('scan-1', [], odd).box).toBeUndefined()
    const bad = finding('bad', 'x', {
      evidence: { capture: { scanId: 'scan-1', file: '../secret' } },
    })
    expect(findingEvidence('scan-1', [], bad).src).toBeUndefined()
  })

  test('finds the page of a merged finding by its wording when the id differs', () => {
    const onPage = finding('step-copy', 'Service fee $9')
    const merged = finding('merged', 'Service  fee $9!')
    const steps = [
      step(1, 'https://shop.example/'),
      step(2, 'https://shop.example/checkout', [onPage]),
    ]
    expect(stepForFinding(steps, merged)?.stepNumber).toBe(2)
  })
})

describe('focus on the outlined element', () => {
  test('keeps a footer element inside the frame', () => {
    const ratio = 0.625
    const box = { x: 0.05, y: 0.94, width: 0.5, height: 0.04 }
    const view = focusView(box, ratio)
    const top = view.top + box.y * view.zoom * ratio
    const bottom = view.top + (box.y + box.height) * view.zoom * ratio
    expect(top).toBeGreaterThanOrEqual(0)
    expect(bottom).toBeLessThanOrEqual(view.height + 1e-9)
    expect(view.left).toBeLessThanOrEqual(0)
    expect(view.left).toBeGreaterThanOrEqual(1 - view.zoom)
  })

  test('never zooms out past the whole picture', () => {
    const view = focusView({ x: 0, y: 0, width: 1, height: 1 }, 0.625)
    expect(view).toEqual({ zoom: 1, left: 0, top: 0, height: 0.625 })
  })
})
