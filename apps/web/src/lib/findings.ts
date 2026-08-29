/**
 * Ordering and grouping for the result page.
 *
 * The most serious, most certain finding is read first. Findings we are not
 * sure enough about move to a collected group the reader can open, so our own
 * uncertainty never dilutes the main read.
 */
import type { DetectedPattern } from '@trusten/shared/domain'
import { compareSeverity, toConfidenceBand } from '@trusten/ui/content'

export function splitFindings(patterns: DetectedPattern[]): {
  main: DetectedPattern[]
  aside: DetectedPattern[]
} {
  const main: DetectedPattern[] = []
  const aside: DetectedPattern[] = []

  for (const p of patterns) {
    if (toConfidenceBand(p.confidence) === 'aside') aside.push(p)
    else main.push(p)
  }

  const order = (a: DetectedPattern, b: DetectedPattern) =>
    compareSeverity(a.severity, b.severity) || b.confidence - a.confidence

  return { main: main.sort(order), aside: aside.sort(order) }
}
