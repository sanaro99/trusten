import { describe, expect, test } from 'bun:test'
import { UNAVAILABLE_STEP_REASONS } from '@trusten/shared/domain'
import {
  interruptedSteps,
  type StepMissOutcome,
  unavailableStepReason,
} from './journey-outcome'
import type { WorkflowStep } from './types'

const miss = (overrides: Partial<StepMissOutcome> = {}): StepMissOutcome => ({
  reachedAnyStep: true,
  optional: false,
  missingPage: false,
  foundControl: false,
  hasDeterministicTarget: true,
  pageUnchanged: true,
  aiAtDetailsBoundary: false,
  ...overrides,
})

describe('unavailableStepReason', () => {
  test('a journey whose first control is missing is not offered by the website', () => {
    expect(unavailableStepReason(miss({ reachedAnyStep: false }))).toBe(
      UNAVAILABLE_STEP_REASONS.notOffered,
    )
  })

  test('a later control missing from the reached page is not a blocked check', () => {
    expect(unavailableStepReason(miss())).toBe(
      UNAVAILABLE_STEP_REASONS.notOnPage,
    )
  })

  test('a missing later control still counts when the page moved somewhere unexpected', () => {
    expect(unavailableStepReason(miss({ pageUnchanged: false }))).toBeNull()
    expect(
      unavailableStepReason(miss({ pageUnchanged: false, optional: true })),
    ).toBe(UNAVAILABLE_STEP_REASONS.notOnPage)
  })

  test('a missing page is not offered, or not on the page when reached mid-journey', () => {
    expect(
      unavailableStepReason(miss({ missingPage: true, reachedAnyStep: false })),
    ).toBe(UNAVAILABLE_STEP_REASONS.notOffered)
    expect(
      unavailableStepReason(miss({ missingPage: true, pageUnchanged: false })),
    ).toBe(UNAVAILABLE_STEP_REASONS.notOnPage)
  })

  test('stopping before personal details ends the journey', () => {
    expect(
      unavailableStepReason(
        miss({ foundControl: true, aiAtDetailsBoundary: true }),
      ),
    ).toBe(UNAVAILABLE_STEP_REASONS.needsDetails)
  })

  test('an optional last button that does nothing ends the journey', () => {
    const pressed = miss({ foundControl: true, optional: true })
    expect(unavailableStepReason(pressed)).toBe(
      UNAVAILABLE_STEP_REASONS.noResponse,
    )
    expect(
      unavailableStepReason({ ...pressed, pageAsksForDetails: true }),
    ).toBe(UNAVAILABLE_STEP_REASONS.needsDetails)
  })

  test('a required step whose button does nothing stays a gap in the check', () => {
    expect(unavailableStepReason(miss({ foundControl: true }))).toBeNull()
  })

  test('an optional step that never reached any page stays a gap in the check', () => {
    expect(
      unavailableStepReason(
        miss({ foundControl: true, optional: true, reachedAnyStep: false }),
      ),
    ).toBeNull()
  })

  test('a step with only an AI goal that failed stays a gap in the check', () => {
    expect(
      unavailableStepReason(miss({ hasDeterministicTarget: false })),
    ).toBeNull()
  })
})

describe('interruptedSteps', () => {
  const workflow = {
    steps: ['Open the shop', 'Open a product', 'Add to cart'].map(
      (instruction, i) => ({
        id: `s${i}`,
        instruction,
        analyzersToRun: [],
        timeout: 5,
        screenshotBefore: false,
        screenshotAfter: true,
      }),
    ),
  }
  const recorded: WorkflowStep[] = [
    {
      stepNumber: 0,
      action: 'Inspect the initial page',
      url: 'https://shop.example/',
      screenshot: '',
      patternsFound: [],
      timestamp: '',
      status: 'observed',
    },
    {
      stepNumber: 1,
      action: 'Open the shop',
      url: 'https://shop.example/deals',
      screenshot: '',
      patternsFound: [],
      timestamp: '',
      status: 'reached',
    },
  ]

  test('marks the running step stopped and the rest not attempted', () => {
    const rest = interruptedSteps(
      workflow,
      recorded,
      new Error('Target closed'),
    )
    expect(rest.map((s) => [s.stepNumber, s.status])).toEqual([
      [2, 'not-reached'],
      [3, 'skipped'],
    ])
    expect(rest[0].navReason).toContain('stopped responding')
    expect(rest[0].navReason).toContain('Target closed')
    expect(rest[0].url).toBe('https://shop.example/deals')
  })

  test('adds nothing when every step was already recorded', () => {
    expect(
      interruptedSteps(
        workflow,
        [...recorded, { ...recorded[1], stepNumber: 3 }],
        'x',
      ),
    ).toEqual([])
  })
})
