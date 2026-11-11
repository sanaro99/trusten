/**
 * Trusten — Scoring Engine
 *
 * Calculates a 0-100 numeric score and A-F letter grade from detected patterns.
 *
 * - Start at 100. Each finding weighs by severity (critical 25, high 15,
 *   medium 8, low 3); findings below 0.7 confidence count half.
 * - Within one category, repeats have diminishing returns (each counts half
 *   the previous) and the category cannot take more than 1.5x its strongest
 *   finding, so a banner repeated on every page cannot sink a site on its own.
 *   Distinct kinds of trick add up fully.
 * - Serious concerns cap the score at 59; important concerns cap it at 79.
 *
 * Grade mapping:
 *   A: 80-100  (minor issues at most)
 *   B: 60-79   (some concerning patterns)
 *   C: 40-59   (significant dark pattern usage)
 *   D: 20-39   (heavy dark pattern usage)
 *   F: 0-19    (pervasive manipulation)
 */

import type {
  CategoryScore,
  DarkPatternCategory,
  DarkPatternScore,
  DetectedPattern,
  Grade,
  Severity,
} from '../types'

// ─── Constants ───

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
}

/** Matches the confidence below which findings are shown as "less sure". */
const CONFIDENT = 0.7
const CATEGORY_CAP_MULTIPLIER = 1.5

const GRADE_BOUNDARIES: Array<{ min: number; grade: Grade }> = [
  { min: 80, grade: 'A' },
  { min: 60, grade: 'B' },
  { min: 40, grade: 'C' },
  { min: 20, grade: 'D' },
  { min: 0, grade: 'F' },
]

// ─── Score Calculation ───

export function calculateScore(patterns: DetectedPattern[]): DarkPatternScore {
  const categoryBreakdown = buildCategoryBreakdown(patterns)
  const totalDeductions = Object.values(categoryBreakdown).reduce(
    (sum, entry) => sum + (entry?.score ?? 0),
    0,
  )

  const ceiling = patterns.some((p) => p.severity === 'critical')
    ? 59
    : patterns.some((p) => p.severity === 'high')
      ? 79
      : 100
  const numeric = Math.min(
    ceiling,
    Math.max(0, Math.round(100 - totalDeductions)),
  )
  const grade = numericToGrade(numeric)
  const summary = generateSummary(numeric, grade, patterns, categoryBreakdown)

  return { numeric, grade, categoryBreakdown, summary }
}

function findingWeight(pattern: DetectedPattern): number {
  const weight = SEVERITY_WEIGHT[pattern.severity]
  return pattern.confidence >= CONFIDENT ? weight : weight / 2
}

/** How much one category takes off the score. */
function categoryDeduction(patterns: DetectedPattern[]): number {
  const weights = patterns.map(findingWeight).sort((a, b) => b - a)
  if (weights.length === 0) return 0
  const raw = weights.reduce((sum, weight, i) => sum + weight / 2 ** i, 0)
  return (
    Math.round(Math.min(raw, weights[0] * CATEGORY_CAP_MULTIPLIER) * 10) / 10
  )
}

// ─── Helpers ───

function numericToGrade(score: number): Grade {
  for (const { min, grade } of GRADE_BOUNDARIES) {
    if (score >= min) return grade
  }
  return 'F'
}

function buildCategoryBreakdown(
  patterns: DetectedPattern[],
): Partial<Record<DarkPatternCategory, CategoryScore>> {
  const breakdown: Partial<Record<DarkPatternCategory, CategoryScore>> = {}

  for (const p of patterns) {
    const existing = breakdown[p.category]
    if (existing) {
      existing.count += 1
      // Keep the highest severity
      if (severityRank(p.severity) > severityRank(existing.severity)) {
        existing.severity = p.severity
      }
    } else {
      breakdown[p.category] = {
        count: 1,
        severity: p.severity,
        score: 0,
      }
    }
  }

  for (const [category, entry] of Object.entries(breakdown)) {
    if (entry)
      entry.score = categoryDeduction(
        patterns.filter((pattern) => pattern.category === category),
      )
  }

  return breakdown
}

function severityRank(s: Severity): number {
  const ranks: Record<Severity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }
  return ranks[s]
}

function generateSummary(
  _numeric: number,
  grade: Grade,
  patterns: DetectedPattern[],
  breakdown: Partial<Record<DarkPatternCategory, CategoryScore>>,
): string {
  if (patterns.length === 0) {
    return 'No concerns were detected in the available checks. Review the coverage and evidence before relying on this result.'
  }

  const criticalCount = patterns.filter((p) => p.severity === 'critical').length
  const highCount = patterns.filter((p) => p.severity === 'high').length
  const categories = Object.keys(breakdown).length

  const parts: string[] = []

  parts.push(
    `Detected ${patterns.length} dark pattern${patterns.length > 1 ? 's' : ''} across ${categories} categor${categories > 1 ? 'ies' : 'y'}.`,
  )

  if (criticalCount > 0) {
    parts.push(
      `${criticalCount} serious concern${criticalCount > 1 ? 's' : ''} require${criticalCount === 1 ? 's' : ''} attention before proceeding.`,
    )
  }

  if (highCount > 0) {
    parts.push(
      `${highCount} high-severity pattern${highCount > 1 ? 's' : ''} detected.`,
    )
  }

  const gradeDescriptions: Record<Grade, string> = {
    A: 'Overall trust score is good with only minor issues.',
    B: 'Some concerning patterns were found that could undermine user trust.',
    C: 'Significant dark pattern usage detected that actively misleads users.',
    D: 'Heavy dark pattern usage — this site employs numerous manipulative techniques.',
    F: 'Pervasive manipulation detected — this site extensively uses dark patterns across multiple categories.',
  }

  parts.push(gradeDescriptions[grade])

  return parts.join(' ')
}

// ─── Exports for testing ───

export {
  buildCategoryBreakdown,
  categoryDeduction,
  numericToGrade,
  severityRank,
}
