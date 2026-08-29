/**
 * Trusten — how sure we are, without saying a number.
 *
 * The scanner produces a 0-1 confidence. Showing "0.55" to someone who came
 * here to find out whether a shop is honest tells them nothing and costs them
 * trust. Confidence becomes wording and placement instead.
 *
 * Nothing is hidden: weak findings still appear, collected under a heading
 * the reader can open.
 */
export type ConfidenceBand = 'stated' | 'hedged' | 'aside'

export const CONFIDENCE_PREFIX: Record<ConfidenceBand, string> = {
  stated: 'We found',
  hedged: 'This looks like',
  aside: 'This might be',
}

export function toConfidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return 'stated'
  if (confidence >= 0.7) return 'hedged'
  return 'aside'
}
