/**
 * Trusten — severity, as the reader sees it.
 *
 * The scanner works in four levels (critical/high/medium/low). Readers get
 * three, framed by what it means for them rather than by an abstract scale:
 * a four-point abstract scale is one distinction more than this audience
 * needs. Colour is never the only carrier — every level has a word and an
 * icon too.
 */
import type { Severity } from '@trusten/shared/domain'

export type ShownLevel = 'serious' | 'worth-knowing' | 'minor'

export interface ShownLevelContent {
  label: string
  meaning: string
  icon: string
  /** CSS custom property name from tokens.css — never a literal colour. */
  colorVar: string
}

export const SHOWN_LEVELS: Record<ShownLevel, ShownLevelContent> = {
  serious: {
    label: 'Serious',
    meaning: 'This could cost you money or give away your personal details.',
    icon: 'alert-triangle',
    colorVar: '--trusten-level-serious',
  },
  'worth-knowing': {
    label: 'Worth knowing',
    meaning: 'This is unfair, but it is unlikely to cost you directly.',
    icon: 'info',
    colorVar: '--trusten-level-worth-knowing',
  },
  minor: {
    label: 'Minor',
    meaning: 'More annoying than harmful.',
    icon: 'dot',
    colorVar: '--trusten-level-minor',
  },
}

const TO_SHOWN: Record<Severity, ShownLevel> = {
  critical: 'serious',
  high: 'serious',
  medium: 'worth-knowing',
  low: 'minor',
}

export function toShownLevel(severity: Severity): ShownLevel {
  return TO_SHOWN[severity]
}

const RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/** Sort comparator putting the most serious finding first. */
export function compareSeverity(a: Severity, b: Severity): number {
  return RANK[a] - RANK[b]
}
