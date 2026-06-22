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
  /** Absolute path to the saved PDF report (deep scans only) */
  pdfPath?: string
  /** Absolute path to the saved HTML report (deep scans only) */
  htmlPath?: string
  /** Absolute path to the recorded session video (.webm, deep scans only) */
  videoPath?: string
}
