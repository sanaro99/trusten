/**
 * Trusten — the grade, as a sentence.
 *
 * The A-F letter stays (school grades are one scale this audience reads
 * fluently) but it is not the headline. The headline is a plain sentence,
 * and the 0-100 score never appears on a reader-facing surface.
 */
import type { Grade } from '@trusten/shared/domain'

const HEADLINES: Record<Grade, string> = {
  A: 'This shop looks fair',
  B: 'This shop is mostly fair',
  C: 'This shop uses some unfair tricks',
  D: 'This shop uses several unfair tricks',
  F: 'Be careful with this shop',
}

export function gradeHeadline(
  grade: Grade,
  findingCount: number,
): { headline: string; sub: string } {
  const headline = HEADLINES[grade]

  if (findingCount === 0) {
    return {
      headline,
      sub: 'We did not find anything to worry about.',
    }
  }

  const noun = findingCount === 1 ? 'thing' : 'things'
  return {
    headline,
    sub: `We found ${findingCount} ${noun} you should know about.`,
  }
}
