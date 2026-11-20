/** Browser access gates are evidence of a blocked check, not the target page. */
export function isAccessChallengeUrl(value: string): boolean {
  try {
    const pathname = new URL(value).pathname.toLowerCase()
    return /(?:^|\/)bgn_verification\.html$|(?:^|\/)cdn-cgi\/challenge-platform(?:\/|$)|(?:^|\/)(?:captcha|challenge|verify-human)(?:\/|$)/.test(
      pathname,
    )
  } catch {
    return false
  }
}

export type CoverageStatus = 'complete' | 'partial' | 'missing' | 'blocked'

/** Structural input shared by saved server steps and validated API steps. */
export interface CoverageStep {
  url: string
  status?: string
  screenshot?: string
  screenshotPath?: string
  visualCheckAvailable?: boolean
  navAdvanced?: boolean
  captureTruncated?: boolean
  /** The page text was analyzed even though no screenshot exists. */
  pageTextCaptured?: boolean
  navReason?: string
}

export interface ScanCoverage {
  status: CoverageStatus
  scope: 'page' | 'journey'
  completed: number
  total: number
  missingVisual: boolean
  /** Only page text was checked: no screenshot was captured. */
  textOnly: boolean
  /** Steps of journeys this website does not offer (not counted in total). */
  unavailable: number
}

export function assessScanCoverage(
  scanType: string,
  allSteps: readonly CoverageStep[] = [],
): ScanCoverage {
  // A journey the website does not offer (no basket on a news site) is not a
  // gap in the check, so it neither counts toward nor against coverage.
  const steps = allSteps.filter((step) => step.status !== 'unavailable')
  const unavailable = allSteps.length - steps.length
  const completedSteps = steps.filter(
    (step) =>
      !step.status || step.status === 'observed' || step.status === 'reached',
  )
  const hasCapture = (step: CoverageStep) =>
    !!step.screenshotPath ||
    (!!step.screenshot && !step.screenshot.startsWith('['))
  const evidenced = completedSteps.filter(
    (step) => hasCapture(step) && !isAccessChallengeUrl(step.url),
  )
  const blocked = steps.some((step) => isAccessChallengeUrl(step.url))
  const completed = completedSteps.length
  const textOnly =
    evidenced.length === 0 &&
    !blocked &&
    completedSteps.some(
      (step) => step.pageTextCaptured && !isAccessChallengeUrl(step.url),
    )
  const missingVisual = evidenced.some(
    (step) => step.visualCheckAvailable !== true,
  )
  const scope =
    scanType === 'quick' ||
    (!completedSteps.some(
      (step) => step.status === 'reached' || step.navAdvanced === true,
    ) &&
      new Set(completedSteps.map((step) => step.url)).size <= 1)
      ? 'page'
      : 'journey'
  let status: CoverageStatus = 'complete'
  if (steps.length === 0 && unavailable > 0) {
    status = 'partial'
  } else if (evidenced.length === 0 && !textOnly) {
    status = blocked
      ? 'blocked'
      : completed === 0 && steps.length > 0
        ? 'partial'
        : 'missing'
  } else if (
    textOnly ||
    completed < steps.length ||
    evidenced.length < completed ||
    missingVisual ||
    steps.some((step) => step.captureTruncated) ||
    blocked
  ) {
    status = 'partial'
  }
  return {
    status,
    scope,
    completed,
    total: steps.length,
    missingVisual: missingVisual || textOnly,
    textOnly,
    unavailable,
  }
}

/**
 * Why a journey step was left out of coverage (status `unavailable`). Saved as
 * the step's `navReason`, so the wording here must stay stable.
 */
export const UNAVAILABLE_STEP_REASONS = {
  /** The journey's entry point is not on the website (no basket on a news site). */
  notOffered: 'This website does not appear to offer this part of the journey',
  /** A later step's control is not on the page the journey reached. */
  notOnPage:
    'The page Trusten reached does not offer the next part of this journey',
  /** Going further would mean entering personal or payment details. */
  needsDetails:
    'The next part of this journey needs personal or payment details, which Trusten does not enter',
  /** An optional last step's button did nothing, so the journey ends here. */
  noResponse:
    'The website did not move on from this page, so the journey ends here',
} as const

export interface UnavailableStepCopy {
  label: string
  outcome: string
}

/** Plain-language label and outcome for a step left out of coverage. */
export function unavailableStepCopy(navReason?: string): UnavailableStepCopy {
  if (navReason === UNAVAILABLE_STEP_REASONS.needsDetails) {
    return {
      label: 'Stopped before personal details',
      outcome:
        'Going further needs personal or payment details, which Trusten never enters. The pages before this step were checked, so it is not counted against the check.',
    }
  }
  if (navReason === UNAVAILABLE_STEP_REASONS.noResponse) {
    return {
      label: 'Journey ended here',
      outcome:
        'Trusten pressed the button for this step, but the website stayed on the same page, often because it wants details Trusten does not enter. The pages before this step were checked, so it is not counted against the check.',
    }
  }
  if (navReason === UNAVAILABLE_STEP_REASONS.notOnPage) {
    return {
      label: 'Not found',
      outcome:
        'Trusten did not find this part of the journey on the pages it reached, so it is not counted against the check.',
    }
  }
  return {
    label: 'Not on this website',
    outcome:
      'Trusten did not find this part of the journey on the website, so it is not counted against the check.',
  }
}

export type JourneyStopCause = 'blocked' | 'page-error' | 'ai' | 'navigation'

/** Why a journey did not reach every step, for limited-check copy. */
export function journeyStopCause(
  steps: readonly CoverageStep[],
): JourneyStopCause | null {
  const stopped = steps.filter(
    (step) => step.status === 'not-reached' || step.status === 'no-navigation',
  )
  if (stopped.length === 0) return null
  const reasons = stopped.map((step) => step.navReason ?? '')
  if (
    steps.some((step) => isAccessChallengeUrl(step.url)) ||
    reasons.some((r) => /HTTP (?:401|403|429)|verification|blocked/i.test(r))
  )
    return 'blocked'
  if (
    reasons.some((r) =>
      /HTTP [45]\d\d|did not load the next page|stopped responding/i.test(r),
    )
  )
    return 'page-error'
  if (
    reasons.some((r) =>
      /LLM unavailable|No LLM configured|snapshot unavailable/i.test(r),
    )
  )
    return 'ai'
  return 'navigation'
}

const STOP_CAUSE_SENTENCES: Record<JourneyStopCause, string> = {
  blocked: 'The website blocked Trusten before every step was reached.',
  'page-error':
    'A page on the website failed to load, so not every step was reached.',
  ai: 'The AI navigator was unavailable for part of the journey, so not every step was reached.',
  navigation:
    'Trusten could not get past one part of the journey, so not every step was reached.',
}

/** One plain sentence saying why a journey stopped early. */
export function journeyStopSentence(cause: JourneyStopCause): string {
  return STOP_CAUSE_SENTENCES[cause]
}
