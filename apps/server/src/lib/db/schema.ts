/**
 * Trusten — base SQLite schema.
 *
 * Only the scan store lives here; the full Trusten schema (audit jobs, column
 * migrations) is created idempotently by `ensureTrustenSchema()` in
 * `src/trusten/db.ts`.
 */
import type { Database } from 'bun:sqlite'

const TRUSTEN_SCANS_TABLE = `
CREATE TABLE IF NOT EXISTS trusten_scans (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  scan_type TEXT NOT NULL,
  workflow_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  score_numeric INTEGER NOT NULL,
  score_grade TEXT NOT NULL,
  pattern_count INTEGER NOT NULL,
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  patterns_json TEXT NOT NULL,
  workflow_steps_json TEXT,
  pdf_path TEXT,
  html_path TEXT,
  video_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`

export function initSchema(db: Database): void {
  db.exec(TRUSTEN_SCANS_TABLE)
}
