import { randomUUID } from 'node:crypto'
import { getDb, migrateDb } from '../lib/db'
import { mapAuditJobRow, mapScanHistoryRow, mapScanRow } from './db-mappers'
import type { DetectedPattern, ScanResult, WorkflowStep } from './types'

export interface ScanHistoryRow {
  id: string
  url: string
  domain: string
  scanType: string
  workflowId: string | null
  startedAt: string
  completedAt: string
  scoreNumeric: number
  scoreGrade: string
  patternCount: number
  criticalCount: number
  highCount: number
  pdfPath: string | null
  htmlPath: string | null
  createdAt: string
}
export interface DomainSummary {
  domain: string
  scanCount: number
  latestGrade: string
  latestScore: number
  latestScanAt: string
  avgScore: number
  totalPatterns: number
  criticalCount: number
  highCount: number
}
export interface GlobalStats {
  totalScans: number
  totalDomains: number
  totalPatterns: number
  avgScore: number
  cleanSites: number
  dirtySites: number
}
export interface AuditPlanItem {
  id: string
  name: string
  description: string
  steps: number
}
export interface AuditJob {
  id: string
  url: string
  domain: string
  status: 'pending' | 'running' | 'done' | 'failed'
  workflows: string[]
  createdAt: string
  completedAt: string | null
  scanIds: string[]
  error: string | null
  plan: AuditPlanItem[]
}
export interface AuditJobUpdate {
  status?: AuditJob['status']
  scanIds?: string[]
  error?: string
  completedAt?: string
  plan?: AuditPlanItem[]
}

export async function ensureTrustenSchema(): Promise<void> {
  await migrateDb()
}

export async function saveTrustenScan(
  result: ScanResult,
  opts: {
    workflowId?: string
    pdfPath?: string
    htmlPath?: string
    videoPath?: string
  } = {},
): Promise<void> {
  const critical = result.patterns.filter(
    (p) => p.severity === 'critical',
  ).length
  const high = result.patterns.filter((p) => p.severity === 'high').length
  const steps = result.workflowSteps
    ? (result.workflowSteps as WorkflowStep[]).map((s) => ({
        ...s,
        screenshot: s.screenshotPath
          ? '[saved]'
          : s.screenshot
            ? '[captured]'
            : '',
      }))
    : null
  await getDb()`INSERT INTO trusten_scans
    (id,url,domain,scan_type,workflow_id,started_at,completed_at,score_numeric,score_grade,pattern_count,critical_count,high_count,patterns,workflow_steps,pdf_path,html_path,video_path)
    VALUES (${result.id},${result.url},${result.domain},${result.scanType},${opts.workflowId ?? null},${result.startedAt},${result.completedAt},${result.score.numeric},${result.score.grade},${result.patterns.length},${critical},${high},${JSON.stringify(result.patterns)}::jsonb,${steps ? JSON.stringify(steps) : null}::jsonb,${opts.pdfPath ?? null},${opts.htmlPath ?? null},${opts.videoPath ?? null})
    ON CONFLICT (id) DO UPDATE SET url=EXCLUDED.url,domain=EXCLUDED.domain,scan_type=EXCLUDED.scan_type,workflow_id=EXCLUDED.workflow_id,started_at=EXCLUDED.started_at,completed_at=EXCLUDED.completed_at,score_numeric=EXCLUDED.score_numeric,score_grade=EXCLUDED.score_grade,pattern_count=EXCLUDED.pattern_count,critical_count=EXCLUDED.critical_count,high_count=EXCLUDED.high_count,patterns=EXCLUDED.patterns,workflow_steps=EXCLUDED.workflow_steps,pdf_path=EXCLUDED.pdf_path,html_path=EXCLUDED.html_path,video_path=EXCLUDED.video_path`
}

export async function getTrustenScanHistory(
  limit = 20,
): Promise<ScanHistoryRow[]> {
  const rows =
    await getDb()`SELECT id,url,domain,scan_type,workflow_id,started_at,completed_at,score_numeric,score_grade,pattern_count,critical_count,high_count,pdf_path,html_path,created_at FROM trusten_scans ORDER BY created_at DESC LIMIT ${limit}`
  return rows.map(mapScanHistoryRow)
}
export async function getTrustenScansByDomain(
  domain: string,
  limit = 50,
): Promise<ScanHistoryRow[]> {
  const rows =
    await getDb()`SELECT id,url,domain,scan_type,workflow_id,started_at,completed_at,score_numeric,score_grade,pattern_count,critical_count,high_count,pdf_path,html_path,created_at FROM trusten_scans WHERE domain=${domain} ORDER BY created_at DESC LIMIT ${limit}`
  return rows.map(mapScanHistoryRow)
}
export async function getTrustenScanById(
  id: string,
): Promise<ScanResult | null> {
  const rows = await getDb()`SELECT * FROM trusten_scans WHERE id=${id} LIMIT 1`
  return rows[0] ? mapScanRow(rows[0]) : null
}
export async function getGlobalStats(): Promise<GlobalStats> {
  const [r] =
    await getDb()`SELECT COUNT(*)::int total_scans,COUNT(DISTINCT domain)::int total_domains,COALESCE(SUM(pattern_count),0)::int total_patterns,COALESCE(AVG(score_numeric),0)::float8 avg_score,COUNT(*) FILTER(WHERE score_grade='A')::int clean_sites,COUNT(*) FILTER(WHERE score_grade IN('D','F'))::int dirty_sites FROM trusten_scans`
  return {
    totalScans: Number(r.total_scans),
    totalDomains: Number(r.total_domains),
    totalPatterns: Number(r.total_patterns),
    avgScore: Math.round(Number(r.avg_score) * 10) / 10,
    cleanSites: Number(r.clean_sites),
    dirtySites: Number(r.dirty_sites),
  }
}

const DOMAIN_SQL = `SELECT domain,COUNT(*)::int scan_count,MAX(created_at) latest_scan_at,AVG(score_numeric)::float8 avg_score,SUM(pattern_count)::int total_patterns,SUM(critical_count)::int critical_count,SUM(high_count)::int high_count,(array_agg(score_grade ORDER BY created_at DESC))[1] latest_grade,(array_agg(score_numeric ORDER BY created_at DESC))[1]::float8 latest_score FROM trusten_scans`
function mapDomain(r: Record<string, unknown>): DomainSummary {
  return {
    domain: r.domain as string,
    scanCount: Number(r.scan_count),
    latestGrade: r.latest_grade as string,
    latestScore: Math.round(Number(r.latest_score)),
    latestScanAt:
      r.latest_scan_at instanceof Date
        ? r.latest_scan_at.toISOString()
        : String(r.latest_scan_at),
    avgScore: Math.round(Number(r.avg_score) * 10) / 10,
    totalPatterns: Number(r.total_patterns),
    criticalCount: Number(r.critical_count),
    highCount: Number(r.high_count),
  }
}
export async function getDomainSummaries(limit = 50): Promise<DomainSummary[]> {
  return (
    await getDb().unsafe(
      `${DOMAIN_SQL} GROUP BY domain ORDER BY latest_scan_at DESC LIMIT $1`,
      [limit],
    )
  ).map(mapDomain)
}
export async function getDomainSummary(
  domain: string,
): Promise<DomainSummary | null> {
  const rows = await getDb().unsafe(
    `${DOMAIN_SQL} WHERE domain=$1 GROUP BY domain`,
    [domain],
  )
  return rows[0] ? mapDomain(rows[0]) : null
}

export async function createAuditJob(
  url: string,
  domain: string,
  workflows: string[],
): Promise<string> {
  const id = `audit-${randomUUID()}`
  await getDb()`INSERT INTO trusten_audit_jobs(id,url,domain,workflows) VALUES(${id},${url},${domain},${JSON.stringify(workflows)}::jsonb)`
  return id
}
export async function updateAuditJob(
  id: string,
  u: AuditJobUpdate,
): Promise<void> {
  if (Object.values(u).every((v) => v === undefined)) return
  await getDb()`UPDATE trusten_audit_jobs SET
    status=CASE WHEN ${u.status !== undefined} THEN ${u.status ?? null} ELSE status END,
    scan_ids=CASE WHEN ${u.scanIds !== undefined} THEN ${u.scanIds ? JSON.stringify(u.scanIds) : null}::jsonb ELSE scan_ids END,
    error=CASE WHEN ${u.error !== undefined} THEN ${u.error ?? null} ELSE error END,
    completed_at=CASE WHEN ${u.completedAt !== undefined} THEN ${u.completedAt ?? null}::timestamptz ELSE completed_at END,
    plan=CASE WHEN ${u.plan !== undefined} THEN ${u.plan ? JSON.stringify(u.plan) : null}::jsonb ELSE plan END WHERE id=${id}`
}
export async function getAuditJob(id: string): Promise<AuditJob | null> {
  const rows =
    await getDb()`SELECT * FROM trusten_audit_jobs WHERE id=${id} LIMIT 1`
  return rows[0] ? mapAuditJobRow(rows[0]) : null
}
export async function getRecentAuditJobs(limit = 20): Promise<AuditJob[]> {
  return (
    await getDb()`SELECT * FROM trusten_audit_jobs ORDER BY created_at DESC LIMIT ${limit}`
  ).map(mapAuditJobRow)
}

/** Mark jobs orphaned by a prior process exit as terminal before serving. */
export async function failIncompleteAuditJobs(): Promise<number> {
  const result = await getDb()`UPDATE trusten_audit_jobs
    SET status = 'failed',
        error = 'The scanner restarted before this audit finished',
        completed_at = now()
    WHERE status IN ('pending', 'running')`
  return result.count
}

export async function cachePageFindings(
  urlKey: string,
  url: string,
  patterns: DetectedPattern[],
  scanId: string,
): Promise<void> {
  if (!patterns.length) return
  await getDb()`INSERT INTO trusten_page_cache(url_key,url,patterns,scan_id,created_at) VALUES(${urlKey},${url},${JSON.stringify(patterns)}::jsonb,${scanId},now()) ON CONFLICT(url_key) DO UPDATE SET url=EXCLUDED.url,patterns=EXCLUDED.patterns,scan_id=EXCLUDED.scan_id,created_at=now()`
}
export async function getCachedPageFindings(
  urlKey: string,
  ttlDays = 7,
): Promise<{
  patterns: DetectedPattern[]
  cachedAt: string
  scanId: string
} | null> {
  const rows =
    await getDb()`SELECT patterns,scan_id,created_at FROM trusten_page_cache WHERE url_key=${urlKey} AND created_at>=now()-(${ttlDays}*interval '1 day') LIMIT 1`
  const r = rows[0]
  if (!r) return null
  return {
    patterns: (typeof r.patterns === 'string'
      ? JSON.parse(r.patterns)
      : r.patterns) as DetectedPattern[],
    cachedAt:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
    scanId: (r.scan_id as string | null) ?? '',
  }
}
