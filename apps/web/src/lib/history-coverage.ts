import type { ScanHistoryRow } from '@trusten/shared/api'

export function historyCoverageLabel(scan: ScanHistoryRow): string | null {
  if (scan.quickCoverage === 'blocked') return 'Check blocked'
  if (scan.quickCoverage === 'missing') return 'Evidence unavailable'
  if (scan.quickCoverage === 'partial') return 'Partial check'
  return null
}

export function hasConclusiveGrade(scan: ScanHistoryRow): boolean {
  return scan.quickCoverage === null || scan.quickCoverage === 'complete'
}
