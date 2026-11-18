import type { WorkflowStep } from '@trusten/shared/api'
import { assessScanCoverage, type Grade } from '@trusten/shared/domain'
import { gradeHeadline } from '@trusten/ui/content'

export interface ReportSummary {
  limited: boolean
  completed: number
  total: number
  eyebrow: string
  headline: string
  sub: string
  /**
   * The website blocked the automated check, or no page evidence was saved, so
   * checking the loaded page in Chrome may help.
   */
  extensionHelps: boolean
}

export function getReportSummary(
  grade: Grade,
  findingCount: number,
  steps: WorkflowStep[],
  scanType: string = 'deep',
): ReportSummary {
  const coverage = assessScanCoverage(scanType, steps)
  const { completed, total } = coverage
  const limited = coverage.status !== 'complete'
  const extensionHelps =
    coverage.status === 'blocked' ||
    coverage.status === 'missing' ||
    steps.some(
      (step) =>
        step.status === 'not-reached' &&
        /HTTP (?:401|403|429)|verification|blocked/i.test(step.navReason ?? ''),
    )
  if (limited) {
    if (coverage.status === 'missing' || coverage.status === 'blocked') {
      return {
        limited,
        completed,
        total,
        extensionHelps,
        eyebrow:
          coverage.status === 'blocked'
            ? 'Check blocked'
            : 'Evidence unavailable',
        headline:
          coverage.status === 'blocked'
            ? 'We could not inspect this website'
            : 'We cannot verify this check',
        sub:
          coverage.status === 'blocked'
            ? 'A verification page stopped the check. This result does not assess the requested website.'
            : 'Page evidence is unavailable. Run a new check before relying on this result.',
      }
    }
    return {
      limited,
      completed,
      total,
      extensionHelps,
      eyebrow: 'Limited check',
      headline: 'We could only check part of this website',
      sub: coverage.textOnly
        ? 'We checked the words on this page, but no screenshot was captured, so layout and visual tricks were not reviewed. The grade is not conclusive.'
        : steps.some((step) => step.captureTruncated)
          ? 'Only part of the loaded page fit in this capture. Review the findings below, but the overall grade is not conclusive.'
          : completed === 0
            ? 'The website stopped us before we could complete any journey steps. The findings below are useful, but they do not describe the whole website.'
            : completed < total
              ? `We completed ${completed} of ${total} journey steps before the website stopped us. The findings below are real, but the overall grade is not conclusive.${coverage.missingVisual ? ' The screenshot check also did not run on every page.' : ''}`
              : 'We reached every planned step, but the screenshot check did not run on every page, so layout tricks may be missed. The grade is not conclusive.',
    }
  }
  if (coverage.scope === 'page') {
    return {
      limited,
      completed,
      total,
      extensionHelps,
      eyebrow: 'Page check only',
      headline:
        findingCount === 0
          ? 'No concerns found on the checked page'
          : `${findingCount} ${findingCount === 1 ? 'concern' : 'concerns'} found on the checked page`,
      sub: 'This result covers the captured page. Checkout, cancellation, and other website journeys were not assessed.',
    }
  }
  const heading = gradeHeadline(grade, findingCount)
  return {
    limited,
    completed,
    total,
    extensionHelps,
    eyebrow: 'Trusten verdict',
    ...heading,
  }
}
