/**
 * Trusten — Scan persistence boundary
 *
 * The engine talks to storage only through ScanStore, so the SQLite layer
 * (db.ts) can be swapped or stubbed (e.g. in tests) without touching scan
 * orchestration. The default implementation delegates straight to db.ts.
 */

import { cachePageFindings, getCachedPageFindings, saveTrustenScan } from './db'
import type { DetectedPattern, ScanResult } from './types'

export interface CachedPageFindings {
  patterns: DetectedPattern[]
  cachedAt: string
  scanId: string
}

export interface SaveScanOptions {
  workflowId?: string
  pdfPath?: string
  htmlPath?: string
  videoPath?: string
}

export interface ScanStore {
  cachePageFindings(
    urlKey: string,
    url: string,
    patterns: DetectedPattern[],
    scanId: string,
  ): void
  getCachedPageFindings(urlKey: string): CachedPageFindings | null
  saveScan(result: ScanResult, opts?: SaveScanOptions): void
}

/** Default store backed by the bundled SQLite database (db.ts). */
export const sqliteScanStore: ScanStore = {
  cachePageFindings,
  getCachedPageFindings: (urlKey) => getCachedPageFindings(urlKey),
  saveScan: saveTrustenScan,
}
