import { describe, expect, test } from 'bun:test'
import { mapAuditJobRow, mapScanHistoryRow, mapScanRow } from './db-mappers'

describe('PostgreSQL row mapping', () => {
  test('maps dates and numeric history fields', () => {
    const row = mapScanHistoryRow({
      id: 's',
      url: 'https://e.test',
      domain: 'e.test',
      scan_type: 'quick',
      workflow_id: null,
      started_at: new Date('2026-01-01T00:00:00Z'),
      completed_at: '2026-01-01T00:01:00Z',
      score_numeric: '82.5',
      score_grade: 'B',
      pattern_count: '2',
      critical_count: 0,
      high_count: 1,
      pdf_path: null,
      html_path: null,
      created_at: new Date('2026-01-01T00:01:00Z'),
    })
    expect(row.scoreNumeric).toBe(82.5)
    expect(row.patternCount).toBe(2)
    expect(row.startedAt).toBe('2026-01-01T00:00:00.000Z')
  })
  test('maps native jsonb scan fields', () => {
    const row = mapScanRow({
      id: 's',
      url: 'https://e.test',
      domain: 'e.test',
      scan_type: 'deep',
      started_at: '2026-01-01T00:00:00Z',
      completed_at: '2026-01-01T00:01:00Z',
      patterns: [{ type: 'nagging', severity: 'high' }],
      score_numeric: 25,
      score_grade: 'D',
      workflow_steps: [],
      pdf_path: null,
      html_path: null,
      video_path: null,
    })
    expect(row.patterns).toHaveLength(1)
    expect(row.workflowSteps).toEqual([])
  })
  test('maps parsed or textual jsonb job fields', () => {
    const job = mapAuditJobRow({
      id: 'a',
      url: 'https://e.test',
      domain: 'e.test',
      status: 'pending',
      workflows: '["checkout"]',
      scan_ids: ['s'],
      plan: null,
      error: null,
      created_at: new Date('2026-01-01T00:00:00Z'),
      completed_at: null,
    })
    expect(job.workflows).toEqual(['checkout'])
    expect(job.scanIds).toEqual(['s'])
    expect(job.plan).toEqual([])
  })
})
