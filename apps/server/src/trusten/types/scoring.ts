/** Trusten — Score model (A–F grade + per-category breakdown). */

import type { DarkPatternCategory, Severity } from './patterns'

export interface CategoryScore {
  count: number
  severity: Severity
  score: number
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface DarkPatternScore {
  numeric: number // 0-100 (100 = cleanest)
  grade: Grade
  categoryBreakdown: Partial<Record<DarkPatternCategory, CategoryScore>>
  summary: string
}
