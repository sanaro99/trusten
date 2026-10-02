import type { ScanHistoryRow } from '@trusten/shared/api'
import { hasConclusiveGrade } from './history-coverage'

export interface DomainGroup {
  domain: string
  scans: ScanHistoryRow[]
  latest: ScanHistoryRow
  previous?: ScanHistoryRow
}
export function canonicalDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, '')
}
export function historyTime(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}
export function groupHistory(scans: ScanHistoryRow[]): DomainGroup[] {
  const grouped = new Map<string, ScanHistoryRow[]>()
  for (const scan of scans) {
    const key = canonicalDomain(scan.domain)
    const group = grouped.get(key) ?? []
    group.push(scan)
    grouped.set(key, group)
  }
  return Array.from(grouped, ([domain, entries]) => {
    const ordered = entries.toSorted(
      (a, b) => historyTime(b.createdAt) - historyTime(a.createdAt),
    )
    return { domain, scans: ordered, latest: ordered[0], previous: ordered[1] }
  })
}
export function matchesWebsite(domain: string, query: string): boolean {
  const search = query.trim().toLowerCase()
  if (!search) return true
  try {
    if (search.includes('://') || search.includes('/')) {
      return (
        canonicalDomain(domain) ===
        canonicalDomain(
          new URL(search.includes('://') ? search : `https://${search}`)
            .hostname,
        )
      )
    }
  } catch {
    return false
  }
  return canonicalDomain(domain).includes(canonicalDomain(search))
}
export function canCompareChecks(
  current: ScanHistoryRow,
  older: ScanHistoryRow,
): boolean {
  if (!hasConclusiveGrade(current) || !hasConclusiveGrade(older)) return false
  if (
    current.scanType !== older.scanType ||
    current.coverageScope !== older.coverageScope
  )
    return false
  if (canonicalDomain(current.domain) !== canonicalDomain(older.domain))
    return false
  if (current.scanType === 'quick' || current.coverageScope === 'page') {
    try {
      const a = new URL(current.url)
      const b = new URL(older.url)
      return (
        canonicalDomain(a.hostname) === canonicalDomain(b.hostname) &&
        a.pathname === b.pathname &&
        a.search === b.search
      )
    } catch {
      return false
    }
  }
  // A discovered audit may choose different journeys on every run. Its public
  // history does not yet carry the plan, so a shared aggregate ID is insufficient.
  if (!current.workflowId || current.workflowId === 'full-audit') return false
  try {
    const a = new URL(current.url)
    const b = new URL(older.url)
    if (a.pathname !== b.pathname || a.search !== b.search) return false
  } catch {
    return false
  }
  return current.workflowId === older.workflowId
}
