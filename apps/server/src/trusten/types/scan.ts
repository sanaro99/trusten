/** Trusten — Top-level scan result returned by the engine. */

import type { DetectedPattern } from './patterns'
import type { DarkPatternScore } from './scoring'
import type { WorkflowStep } from './workflow'

export type ScanType = 'quick' | 'deep'

export interface ScanResult {
  id: string
  url: string
  domain: string
  scanType: ScanType
  startedAt: string
  completedAt: string
  patterns: DetectedPattern[]
  score: DarkPatternScore
  workflowSteps?: WorkflowStep[]
  /**
   * Absolute path to the saved PDF report (deep scans only). Absent
   * (undefined) on a freshly built result that never set it; `null` when
   * read back from a DB row whose column was never populated.
   */
  pdfPath?: string | null
  /** Absolute path to the saved HTML report (deep scans only). See pdfPath. */
  htmlPath?: string | null
  /**
   * Absolute path to the recorded session video (.webm, deep scans only).
   * See pdfPath.
   */
  videoPath?: string | null
}
