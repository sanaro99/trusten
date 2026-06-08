/**
 * Trusten — Scoring Engine
 *
 * Calculates a 0-100 numeric score and A-F letter grade from detected patterns.
 *
 * Scoring logic:
 * - Start at 100 (perfect score)
 * - Deduct points based on severity and count:
 *     critical: -15 per instance (capped at -45)
 *     high:     -8  per instance (capped at -32)
 *     medium:   -4  per instance (capped at -20)
 *     low:      -2  per instance (capped at -10)
 * - Minimum score: 0
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

const SEVERITY_DEDUCTIONS: Record<
  Severity,
  { perInstance: number; cap: number }
> = {
  critical: { perInstance: 15, cap: 45 },
  high: { perInstance: 8, cap: 32 },
  medium: { perInstance: 4, cap: 20 },
  low: { perInstance: 2, cap: 10 },
}

const GRADE_BOUNDARIES: Array<{ min: number; grade: Grade }> = [
  { min: 80, grade: 'A' },
  { min: 60, grade: 'B' },
  { min: 40, grade: 'C' },
  { min: 20, grade: 'D' },
  { min: 0, grade: 'F' },
]

// ─── Score Calculation ───

export function calculateScore(patterns: DetectedPattern[]): DarkPatternScore {
  // Group patterns by severity for deduction calculation
  const bySeverity: Record<Severity, DetectedPattern[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  }

  for (const p of patterns) {
    bySeverity[p.severity].push(p)
  }

  // Calculate total deductions
  let totalDeductions = 0
  for (const severity of Object.keys(bySeverity) as Severity[]) {
    const count = bySeverity[severity].length
    const { perInstance, cap } = SEVERITY_DEDUCTIONS[severity]
    const deduction = Math.min(count * perInstance, cap)
    totalDeductions += deduction
  }

  // Compute numeric score
  const numeric = Math.max(0, 100 - totalDeductions)

  // Determine grade
  const grade = numericToGrade(numeric)

  // Build category breakdown
  const categoryBreakdown = buildCategoryBreakdown(patterns)

  // Generate summary
  const summary = generateSummary(numeric, grade, patterns, categoryBreakdown)

  return { numeric, grade, categoryBreakdown, summary }
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

  // Calculate per-category score (how much each category deducts)
  for (const entry of Object.values(breakdown)) {
    if (entry) {
      const { perInstance, cap } = SEVERITY_DEDUCTIONS[entry.severity]
      entry.score = Math.min(entry.count * perInstance, cap)
    }
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
    return 'No dark patterns detected. This page appears to use transparent, user-friendly design practices.'
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
      `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} found that likely violate consumer protection regulations.`,
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

export { buildCategoryBreakdown, numericToGrade, severityRank }
