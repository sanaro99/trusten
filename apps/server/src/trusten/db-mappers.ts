import { assessScanCoverage } from '@trusten/shared/domain'
import type { AuditJob, AuditPlanItem, ScanHistoryRow } from './db'
import type { DetectedPattern, ScanResult, WorkflowStep } from './types'

type Row = Record<string, unknown>
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : String(value)
const json = <T>(value: unknown, fallback: T): T =>
  value == null
    ? fallback
    : typeof value === 'string'
      ? (JSON.parse(value) as T)
      : (value as T)

export function mapScanHistoryRow(r: Row): ScanHistoryRow {
  const steps = json<WorkflowStep[]>(r.workflow_steps, [])
  // Retain compatibility with older query projections during rolling upgrades.
  if (steps.length === 0 && r.scan_type === 'quick' && r.evidence_url) {
    steps.push({
      url: String(r.evidence_url),
      screenshotPath: r.evidence_screenshot_path
        ? String(r.evidence_screenshot_path)
        : undefined,
      visualCheckAvailable:
        r.visual_check_available === 'true' ||
        r.visual_check_available === true,
    } as WorkflowStep)
  }
  const coverage = assessScanCoverage(String(r.scan_type), steps)
  const quickCoverage = r.scan_type === 'quick' ? coverage.status : null
  return {
    id: r.id as string,
    url: r.url as string,
    domain: r.domain as string,
    scanType: r.scan_type as string,
    workflowId: (r.workflow_id as string | null) ?? null,
    startedAt: iso(r.started_at),
    completedAt: iso(r.completed_at),
    scoreNumeric: Number(r.score_numeric),
    scoreGrade: r.score_grade as string,
    quickCoverage,
    coverage: coverage.status,
    coverageScope: coverage.scope,
    patternCount: Number(r.pattern_count),
    criticalCount: Number(r.critical_count),
    highCount: Number(r.high_count),
    pdfPath: (r.pdf_path as string | null) ?? null,
    htmlPath: (r.html_path as string | null) ?? null,
    createdAt: iso(r.created_at),
  }
}

export function mapScanRow(r: Row): ScanResult {
  return {
    id: r.id as string,
    url: r.url as string,
    domain: r.domain as string,
    scanType: r.scan_type as 'quick' | 'deep',
    parentAuditId: (r.parent_audit_id as string | null) ?? null,
    startedAt: iso(r.started_at),
    completedAt: iso(r.completed_at),
    patterns: json<DetectedPattern[]>(r.patterns, []),
    score: {
      numeric: Number(r.score_numeric),
      grade: r.score_grade as 'A' | 'B' | 'C' | 'D' | 'F',
      categoryBreakdown: {},
      summary: '',
    },
    workflowSteps:
      r.workflow_steps == null
        ? undefined
        : json<WorkflowStep[]>(r.workflow_steps, []),
    pdfPath: (r.pdf_path as string | null) ?? null,
    htmlPath: (r.html_path as string | null) ?? null,
    videoPath: (r.video_path as string | null) ?? null,
  }
}

export function mapAuditJobRow(r: Row): AuditJob {
  return {
    id: r.id as string,
    url: r.url as string,
    domain: r.domain as string,
    status: r.status as AuditJob['status'],
    workflows: json<string[]>(r.workflows, []),
    createdAt: iso(r.created_at),
    completedAt: r.completed_at ? iso(r.completed_at) : null,
    scanIds: json<string[]>(r.scan_ids, []),
    error: (r.error as string | null) ?? null,
    plan: json<AuditPlanItem[]>(r.plan, []),
  }
}
