import { describe, expect, test } from 'bun:test'
import type { WorkflowStep } from '@trusten/shared/api'
import {
  completedJourneySteps,
  getJourneyStepContent,
  pageName,
} from './journey-content'

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    stepNumber: 1,
    action: 'Click Checkout or Proceed to Checkout and observe any new fees.',
    url: 'https://example.com/checkout?session=secret',
    screenshot: '',
    patternsFound: [],
    timestamp: '2026-01-01T00:00:00Z',
    status: 'reached',
    ...overrides,
  }
}

describe('journey content', () => {
  test('turns scanner instructions into short reader-facing copy', () => {
    const content = getJourneyStepContent(step())
    expect(content.title).toBe('Start checkout')
    expect(content.description).not.toMatch(/proceed|observe/i)
    expect(content.pageLabel).toBe('example.com · checkout')
    expect(content.pageLabel).not.toContain('session')
  })

  test('never exposes navigation diagnostics as the outcome', () => {
    const content = getJourneyStepContent(
      step({
        status: 'no-navigation',
        navReason: 'No LLM configured and no deterministic fallback',
      }),
    )
    expect(content.statusLabel).toBe('Couldn’t continue')
    expect(content.outcome).not.toMatch(/LLM|deterministic/i)
  })

  test('counts legacy recorded steps as completed', () => {
    expect(
      completedJourneySteps([
        step({ status: undefined }),
        step({ stepNumber: 2, status: 'skipped' }),
      ]),
    ).toBe(1)
  })
})

describe('page names', () => {
  test('name a step after its page when the action is not recognised', () => {
    expect(pageName('https://shop.example/')).toBe('Homepage')
    expect(pageName('https://shop.example/checkout')).toBe('Checkout page')
    expect(pageName('https://shop.example/help/order-status.html')).toBe(
      'Order status page',
    )
    expect(pageName('https://shop.example/landing-page')).toBe('Landing page')
    expect(pageName('not a url')).toBe('Website page')
  })
})
