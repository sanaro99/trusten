/**
 * Trusten — Scan history persistence (Bun SQLite)
 */
import { getDb } from '../lib/db'
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
  cleanSites: number // grade A
  dirtySites: number // grade D or F
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

// ─── Schema init ───

export function ensureTrustenSchema(): void {
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS trusten_scans (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      domain TEXT NOT NULL,
      scan_type TEXT NOT NULL,
      workflow_id TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      score_numeric REAL NOT NULL,
      score_grade TEXT NOT NULL,
      pattern_count INTEGER NOT NULL DEFAULT 0,
      critical_count INTEGER NOT NULL DEFAULT 0,
      high_count INTEGER NOT NULL DEFAULT 0,
      patterns_json TEXT NOT NULL DEFAULT '[]',
      workflow_steps_json TEXT,
      pdf_path TEXT,
      html_path TEXT,
      video_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_trusten_scans_domain ON trusten_scans(domain);
    CREATE INDEX IF NOT EXISTS idx_trusten_scans_created ON trusten_scans(created_at DESC);

    CREATE TABLE IF NOT EXISTS trusten_audit_jobs (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      domain TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      workflows_json TEXT NOT NULL DEFAULT '[]',
      scan_ids_json TEXT NOT NULL DEFAULT '[]',
      plan_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    -- Per-page findings captured during deep scans, consulted by quick scans
    -- of pages the user is actively browsing.
    CREATE TABLE IF NOT EXISTS trusten_page_cache (
      url_key TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      patterns_json TEXT NOT NULL DEFAULT '[]',
      scan_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Backfill columns added after the initial schema shipped.
  const cols = db.prepare(`PRAGMA table_info(trusten_scans)`).all() as Array<{
    name: string
  }>
  if (!cols.some((c) => c.name === 'video_path')) {
    db.exec(`ALTER TABLE trusten_scans ADD COLUMN video_path TEXT`)
  }

  const jobCols = db
    .prepare(`PRAGMA table_info(trusten_audit_jobs)`)
    .all() as Array<{ name: string }>
  if (!jobCols.some((c) => c.name === 'plan_json')) {
    db.exec(`ALTER TABLE trusten_audit_jobs ADD COLUMN plan_json TEXT`)
  }
}

// ─── Scan persistence ───

export function saveTrustenScan(
  result: ScanResult,
  opts: {
    workflowId?: string
    pdfPath?: string
    htmlPath?: string
    videoPath?: string
  } = {},
): void {
  ensureTrustenSchema()
  const db = getDb()

  const criticalCount = result.patterns.filter(
    (p: DetectedPattern) => p.severity === 'critical',
  ).length
  const highCount = result.patterns.filter(
    (p: DetectedPattern) => p.severity === 'high',
  ).length

  db.prepare(
    `INSERT OR REPLACE INTO trusten_scans
     (id, url, domain, scan_type, workflow_id, started_at, completed_at,
      score_numeric, score_grade, pattern_count, critical_count, high_count,
      patterns_json, workflow_steps_json, pdf_path, html_path, video_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    result.id,
    result.url,
    result.domain,
    result.scanType,
    opts.workflowId ?? null,
    result.startedAt,
    result.completedAt,
    result.score.numeric,
    result.score.grade,
    result.patterns.length,
    criticalCount,
    highCount,
    JSON.stringify(result.patterns),
    result.workflowSteps
      ? JSON.stringify(
          (result.workflowSteps as WorkflowStep[]).map((s) => ({
            ...s,
            screenshot: s.screenshotPath
              ? '[saved]'
              : s.screenshot
                ? '[captured]'
                : '',
          })),
        )
      : null,
    opts.pdfPath ?? null,
    opts.htmlPath ?? null,
    opts.videoPath ?? null,
  )
}

// ─── Queries ───

export function getTrustenScanHistory(limit = 20): ScanHistoryRow[] {
  ensureTrustenSchema()
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, url, domain, scan_type, workflow_id, started_at, completed_at,
              score_numeric, score_grade, pattern_count, critical_count, high_count,
              pdf_path, html_path, created_at
       FROM trusten_scans
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as Array<Record<string, unknown>>

  return rows.map(rowToHistory)
}

export function getTrustenScansByDomain(
  domain: string,
  limit = 50,
): ScanHistoryRow[] {
  ensureTrustenSchema()
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, url, domain, scan_type, workflow_id, started_at, completed_at,
              score_numeric, score_grade, pattern_count, critical_count, high_count,
              pdf_path, html_path, created_at
       FROM trusten_scans
       WHERE domain = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(domain, limit) as Array<Record<string, unknown>>

  return rows.map(rowToHistory)
}

export function getTrustenScanById(id: string): ScanResult | null {
  ensureTrustenSchema()
  const db = getDb()
  const row = db.prepare(`SELECT * FROM trusten_scans WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined

  if (!row) return null

  return {
    id: row.id as string,
    url: row.url as string,
    domain: row.domain as string,
    scanType: row.scan_type as 'quick' | 'deep',
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string,
    patterns: JSON.parse(row.patterns_json as string) as DetectedPattern[],
    score: {
      numeric: row.score_numeric as number,
      grade: row.score_grade as 'A' | 'B' | 'C' | 'D' | 'F',
      categoryBreakdown: {},
      summary: '',
    },
    workflowSteps: row.workflow_steps_json
      ? (JSON.parse(row.workflow_steps_json as string) as WorkflowStep[])
      : undefined,
    pdfPath: row.pdf_path as string | undefined,
    htmlPath: row.html_path as string | undefined,
    videoPath: row.video_path as string | undefined,
  }
}

export function getGlobalStats(): GlobalStats {
  ensureTrustenSchema()
  const db = getDb()

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) as total_scans,
         COUNT(DISTINCT domain) as total_domains,
         SUM(pattern_count) as total_patterns,
         AVG(score_numeric) as avg_score,
         SUM(CASE WHEN score_grade = 'A' THEN 1 ELSE 0 END) as clean_sites,
         SUM(CASE WHEN score_grade IN ('D','F') THEN 1 ELSE 0 END) as dirty_sites
       FROM trusten_scans`,
    )
    .get() as Record<string, unknown>

  return {
    totalScans: (totals.total_scans as number) ?? 0,
    totalDomains: (totals.total_domains as number) ?? 0,
    totalPatterns: (totals.total_patterns as number) ?? 0,
    avgScore: Math.round(((totals.avg_score as number) ?? 0) * 10) / 10,
    cleanSites: (totals.clean_sites as number) ?? 0,
    dirtySites: (totals.dirty_sites as number) ?? 0,
  }
}

export function getDomainSummaries(limit = 50): DomainSummary[] {
  ensureTrustenSchema()
  const db = getDb()

  const rows = db
    .prepare(
      `SELECT
         domain,
         COUNT(*) as scan_count,
         MAX(created_at) as latest_scan_at,
         AVG(score_numeric) as avg_score,
         SUM(pattern_count) as total_patterns,
         SUM(critical_count) as critical_count,
         SUM(high_count) as high_count
       FROM trusten_scans
       GROUP BY domain
       ORDER BY latest_scan_at DESC
       LIMIT ?`,
    )
    .all(limit) as Array<Record<string, unknown>>

  return rows.map((r) => {
    // Get the most recent scan's grade/score
    const latest = db
      .prepare(
        `SELECT score_grade, score_numeric FROM trusten_scans
         WHERE domain = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(r.domain as string) as Record<string, unknown> | undefined

    return {
      domain: r.domain as string,
      scanCount: r.scan_count as number,
      latestGrade: (latest?.score_grade as string) ?? 'F',
      latestScore: Math.round((latest?.score_numeric as number) ?? 0),
      latestScanAt: r.latest_scan_at as string,
      avgScore: Math.round(((r.avg_score as number) ?? 0) * 10) / 10,
      totalPatterns: (r.total_patterns as number) ?? 0,
      criticalCount: (r.critical_count as number) ?? 0,
      highCount: (r.high_count as number) ?? 0,
    }
  })
}

export function getDomainSummary(domain: string): DomainSummary | null {
  ensureTrustenSchema()
  const db = getDb()

  const row = db
    .prepare(
      `SELECT
         domain,
         COUNT(*) as scan_count,
         MAX(created_at) as latest_scan_at,
         AVG(score_numeric) as avg_score,
         SUM(pattern_count) as total_patterns,
         SUM(critical_count) as critical_count,
         SUM(high_count) as high_count
       FROM trusten_scans
       WHERE domain = ?
       GROUP BY domain`,
    )
    .get(domain) as Record<string, unknown> | undefined

  if (!row) return null

  const latest = db
    .prepare(
      `SELECT score_grade, score_numeric FROM trusten_scans
       WHERE domain = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(domain) as Record<string, unknown> | undefined

  return {
    domain: row.domain as string,
    scanCount: row.scan_count as number,
    latestGrade: (latest?.score_grade as string) ?? 'F',
    latestScore: Math.round((latest?.score_numeric as number) ?? 0),
    latestScanAt: row.latest_scan_at as string,
    avgScore: Math.round(((row.avg_score as number) ?? 0) * 10) / 10,
    totalPatterns: (row.total_patterns as number) ?? 0,
    criticalCount: (row.critical_count as number) ?? 0,
    highCount: (row.high_count as number) ?? 0,
  }
}

// ─── Audit jobs ───

export function createAuditJob(
  url: string,
  domain: string,
  workflows: string[],
): string {
  ensureTrustenSchema()
  const db = getDb()
  const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  db.prepare(
    `INSERT INTO trusten_audit_jobs (id, url, domain, workflows_json)
     VALUES (?, ?, ?, ?)`,
  ).run(id, url, domain, JSON.stringify(workflows))

  return id
}

export function updateAuditJob(
  id: string,
  update: {
    status?: AuditJob['status']
    scanIds?: string[]
    error?: string
    completedAt?: string
    plan?: AuditPlanItem[]
  },
): void {
  ensureTrustenSchema()
  const db = getDb()

  const fields: string[] = []
  const values: string[] = []

  if (update.status !== undefined) {
    fields.push('status = ?')
    values.push(update.status)
  }
  if (update.scanIds !== undefined) {
    fields.push('scan_ids_json = ?')
    values.push(JSON.stringify(update.scanIds))
  }
  if (update.error !== undefined) {
    fields.push('error = ?')
    values.push(update.error ?? '')
  }
  if (update.completedAt !== undefined) {
    fields.push('completed_at = ?')
    values.push(update.completedAt)
  }
  if (update.plan !== undefined) {
    fields.push('plan_json = ?')
    values.push(JSON.stringify(update.plan))
  }

  if (fields.length === 0) return
  values.push(id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.prepare(
    `UPDATE trusten_audit_jobs SET ${fields.join(', ')} WHERE id = ?`,
  ).run(...(values as any[]))
}

export function getAuditJob(id: string): AuditJob | null {
  ensureTrustenSchema()
  const db = getDb()
  const row = db
    .prepare(`SELECT * FROM trusten_audit_jobs WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined

  if (!row) return null
  return rowToJob(row)
}

export function getRecentAuditJobs(limit = 20): AuditJob[] {
  ensureTrustenSchema()
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM trusten_audit_jobs ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Array<Record<string, unknown>>

  return rows.map(rowToJob)
}

// ─── Page-finding cache (deep scan → quick scan) ───

export function cachePageFindings(
  urlKey: string,
  url: string,
  patterns: DetectedPattern[],
  scanId: string,
): void {
  if (patterns.length === 0) return
  ensureTrustenSchema()
  const db = getDb()
  db.prepare(
    `INSERT OR REPLACE INTO trusten_page_cache (url_key, url, patterns_json, scan_id, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  ).run(urlKey, url, JSON.stringify(patterns), scanId)
}

/** Returns cached deep-scan findings for a page if fresh within `ttlDays`. */
export function getCachedPageFindings(
  urlKey: string,
  ttlDays = 7,
): { patterns: DetectedPattern[]; cachedAt: string; scanId: string } | null {
  ensureTrustenSchema()
  const db = getDb()
  const row = db
    .prepare(
      `SELECT patterns_json, scan_id, created_at FROM trusten_page_cache
       WHERE url_key = ? AND created_at >= datetime('now', ?)`,
    )
    .get(urlKey, `-${ttlDays} days`) as Record<string, unknown> | undefined

  if (!row) return null
  return {
    patterns: JSON.parse(row.patterns_json as string) as DetectedPattern[],
    cachedAt: row.created_at as string,
    scanId: (row.scan_id as string) ?? '',
  }
}

// ─── Private helpers ───

function rowToHistory(r: Record<string, unknown>): ScanHistoryRow {
  return {
    id: r.id as string,
    url: r.url as string,
    domain: r.domain as string,
    scanType: r.scan_type as string,
    workflowId: r.workflow_id as string | null,
    startedAt: r.started_at as string,
    completedAt: r.completed_at as string,
    scoreNumeric: r.score_numeric as number,
    scoreGrade: r.score_grade as string,
    patternCount: r.pattern_count as number,
    criticalCount: r.critical_count as number,
    highCount: r.high_count as number,
    pdfPath: r.pdf_path as string | null,
    htmlPath: r.html_path as string | null,
    createdAt: r.created_at as string,
  }
}

function rowToJob(r: Record<string, unknown>): AuditJob {
  return {
    id: r.id as string,
    url: r.url as string,
    domain: r.domain as string,
    status: r.status as AuditJob['status'],
    workflows: JSON.parse(r.workflows_json as string) as string[],
    createdAt: r.created_at as string,
    completedAt: r.completed_at as string | null,
    scanIds: JSON.parse(r.scan_ids_json as string) as string[],
    error: r.error as string | null,
    plan: r.plan_json
      ? (JSON.parse(r.plan_json as string) as AuditPlanItem[])
      : [],
  }
}
