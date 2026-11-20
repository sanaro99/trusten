import { UNAVAILABLE_STEP_REASONS } from '@trusten/shared/domain'
import type { ScanWorkflow, WorkflowStep } from './types'

export interface StepMissOutcome {
  /** An earlier step of this journey reached a new page. */
  reachedAnyStep: boolean
  /** The workflow marks this step as fine to miss (a last, optional step). */
  optional: boolean
  /** The step's own address returned 404 or 410. */
  missingPage: boolean
  /** A matching search box, button or link was found and used. */
  foundControl: boolean
  /** The step names a search, button text or first-result click to look for. */
  hasDeterministicTarget: boolean
  /** The page looks the same as before the step. */
  pageUnchanged: boolean
  /** The AI navigator stopped before typing personal or payment details. */
  aiAtDetailsBoundary: boolean
  /** The page shows a form asking for personal or payment details. */
  pageAsksForDetails?: boolean
}

/**
 * Decide whether a journey step that did not reach a new page is a gap in the
 * check (null: stays `not-reached`) or simply what the website offers, in
 * which case the step is `unavailable` for the returned reason.
 */
export function unavailableStepReason(miss: StepMissOutcome): string | null {
  if (miss.missingPage) {
    return miss.reachedAnyStep
      ? UNAVAILABLE_STEP_REASONS.notOnPage
      : UNAVAILABLE_STEP_REASONS.notOffered
  }
  if (miss.aiAtDetailsBoundary && miss.pageUnchanged) {
    return UNAVAILABLE_STEP_REASONS.needsDetails
  }
  if (!miss.foundControl && miss.hasDeterministicTarget) {
    if (!miss.reachedAnyStep) return UNAVAILABLE_STEP_REASONS.notOffered
    // A page that moved (the AI navigator tried elsewhere) is only a gap when
    // the step was required.
    if (miss.pageUnchanged || miss.optional)
      return UNAVAILABLE_STEP_REASONS.notOnPage
    return null
  }
  if (
    miss.foundControl &&
    miss.optional &&
    miss.reachedAnyStep &&
    miss.pageUnchanged
  ) {
    return miss.pageAsksForDetails
      ? UNAVAILABLE_STEP_REASONS.needsDetails
      : UNAVAILABLE_STEP_REASONS.noResponse
  }
  return null
}

/** Browser script: does the page ask for personal or payment details? */
export const ASKS_FOR_DETAILS_SCRIPT = `(function() {
  var fields = Array.from(document.querySelectorAll('input,select,textarea'));
  return fields.some(function(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (['hidden','checkbox','radio','submit','button','search','image','reset'].indexOf(type) >= 0) return false;
    if (['email','tel','password'].indexOf(type) >= 0) return true;
    var hint = [el.getAttribute('name'), el.getAttribute('id'), el.getAttribute('autocomplete'), el.getAttribute('placeholder'), el.getAttribute('aria-label')].join(' ').toLowerCase();
    return el.required || /(?:e-?mail|phone|name|address|postcode|zip|city|card|cc-|cvc|cvv|expir|password|birth)/.test(hint);
  });
})()`

/**
 * Steps of a journey that a page crash or timeout stopped: the step that was
 * running did not finish, and later steps were never tried.
 */
export function interruptedSteps(
  workflow: Pick<ScanWorkflow, 'steps'>,
  recorded: readonly WorkflowStep[],
  error: unknown,
): WorkflowStep[] {
  const done = recorded.reduce(
    (last, step) => Math.max(last, step.stepNumber),
    0,
  )
  const lastUrl = recorded.at(-1)?.url ?? ''
  const timestamp = new Date().toISOString()
  const detail = error instanceof Error ? error.message : String(error)
  return workflow.steps.slice(done).map((step, index) => ({
    stepNumber: done + index + 1,
    action: step.instruction,
    url: lastUrl,
    screenshot: '',
    patternsFound: [],
    timestamp,
    status: index === 0 ? 'not-reached' : 'skipped',
    navAdvanced: false,
    navReason:
      index === 0
        ? `The page stopped responding during this step (${detail.slice(0, 120)})`
        : 'Skipped because an earlier part of this journey failed.',
  }))
}
