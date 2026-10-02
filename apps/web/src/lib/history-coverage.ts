import type { ScanHistoryRow } from '@trusten/shared/api'

export function historyCoverageLabel(scan: ScanHistoryRow): string | null {
  const coverage = scan.coverage ?? scan.quickCoverage
  if (coverage === 'blocked') return 'Check blocked'
  if (coverage === 'missing' || coverage === null) return 'Evidence unavailable'
  if (coverage === 'partial') return 'Partial check'
  if (scan.coverageScope === 'page' || scan.scanType === 'quick')
    return 'Page check only'
  return null
}

export function hasConclusiveGrade(scan: ScanHistoryRow): boolean {
  return (scan.coverage ?? scan.quickCoverage) === 'complete'
}
