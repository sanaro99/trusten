import type { WorkflowStep } from '@trusten/shared/api'
import type { Grade } from '@trusten/shared/domain'
import { gradeHeadline } from '@trusten/ui/content'
import { completedJourneySteps } from './journey-content'

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
): ReportSummary {
  const completed = completedJourneySteps(steps)
  const total = steps.length
  const limited = total > 0 && completed / total < 0.5
  if (limited) {
    return {
      limited,
      completed,
      total,
      eyebrow: 'Limited check',
      headline: 'We could only check part of this website',
      sub:
        completed === 0
          ? 'The website stopped us before we could complete any journey steps. The findings below are useful, but they do not describe the whole website.'
          : `We completed ${completed} of ${total} journey steps. The findings below are useful, but the overall grade is not conclusive.`,
    }
  }
  const heading = gradeHeadline(grade, findingCount)
  return { limited, completed, total, eyebrow: 'Trusten verdict', ...heading }
}
