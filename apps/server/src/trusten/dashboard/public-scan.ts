/**
 * Shape saved scans for public API responses.
 *
 * Saved scans keep server file paths for screenshots, reports and recordings so
 * the server can stream them. Those paths reveal the server's folder layout, so
 * responses replace each one with the public URL that serves the same file.
 * Clients only check whether a field is set, so the field names stay the same.
 */

import type { ScanHistoryRow } from '../db'
import { ScanIncompleteError } from '../scan-incomplete-error'
import type { ScanResult, WorkflowStep } from '../types'

const GENERIC_ERROR =
  'Something went wrong while checking this website. Please try again.'

function reportUrl(scanId: string, asset: string): string {
  return `/trusten/report/${encodeURIComponent(scanId)}/${asset}`
}

export function publicScan(scan: ScanResult): ScanResult {
  return {
    ...scan,
    pdfPath: scan.pdfPath ? reportUrl(scan.id, 'pdf') : null,
    htmlPath: scan.htmlPath ? reportUrl(scan.id, 'html') : null,
    videoPath: scan.videoPath ? reportUrl(scan.id, 'video') : null,
    workflowSteps: scan.workflowSteps?.map(
      ({ screenshotPath, ...step }): WorkflowStep =>
        screenshotPath
          ? {
              ...step,
              screenshotPath: reportUrl(
                scan.id,
                `screenshot/${step.stepNumber}`,
              ),
            }
          : step,
    ),
  }
}

export function publicHistoryRow(row: ScanHistoryRow): ScanHistoryRow {
  return {
    ...row,
    pdfPath: row.pdfPath ? reportUrl(row.id, 'pdf') : null,
    htmlPath: row.htmlPath ? reportUrl(row.id, 'html') : null,
  }
}

/**
 * Message safe to show visitors. Scan problems already use plain wording;
 * anything else (file, database or browser errors) can include server paths.
 */
export function publicErrorMessage(err: unknown): string {
  return err instanceof ScanIncompleteError ? err.message : GENERIC_ERROR
}
