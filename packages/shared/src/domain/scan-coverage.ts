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
}

export interface ScanCoverage {
  status: CoverageStatus
  scope: 'page' | 'journey'
  completed: number
  total: number
  missingVisual: boolean
}

export function assessScanCoverage(
  scanType: string,
  steps: readonly CoverageStep[] = [],
): ScanCoverage {
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
  if (evidenced.length === 0) {
    status = blocked
      ? 'blocked'
      : completed === 0 && steps.length > 0
        ? 'partial'
        : 'missing'
  } else if (
    completed < steps.length ||
    evidenced.length < completed ||
    missingVisual ||
    blocked
  ) {
    status = 'partial'
  }
  return { status, scope, completed, total: steps.length, missingVisual }
}
