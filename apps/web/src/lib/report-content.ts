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
  if (limited) {
    if (coverage.status === 'missing' || coverage.status === 'blocked') {
      return {
        limited,
        completed,
        total,
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
      eyebrow: 'Limited check',
      headline: 'We could only check part of this website',
      sub: coverage.missingVisual
        ? `We captured the available pages, but visual analysis did not complete. The grade is not conclusive.${completed < total ? ` We completed ${completed} of ${total} journey steps.` : ''}`
        : completed === 0
          ? 'The website stopped us before we could complete any journey steps. The findings below are useful, but they do not describe the whole website.'
          : `We completed ${completed} of ${total} journey steps. The findings below are useful, but the overall grade is not conclusive.`,
    }
  }
  if (coverage.scope === 'page') {
    return {
      limited,
      completed,
      total,
      eyebrow: 'Page check only',
      headline:
        findingCount === 0
          ? 'No concerns found on the checked page'
          : `${findingCount} ${findingCount === 1 ? 'concern' : 'concerns'} found on the checked page`,
      sub: 'This result covers the captured page. Checkout, cancellation, and other website journeys were not assessed.',
    }
  }
  const heading = gradeHeadline(grade, findingCount)
  return { limited, completed, total, eyebrow: 'Trusten verdict', ...heading }
}
