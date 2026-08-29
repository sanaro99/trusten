import { z } from 'zod'

export const ScanHistoryRowSchema = z.object({
  id: z.string(),
  url: z.string(),
  domain: z.string(),
  scanType: z.string(),
  workflowId: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string(),
  scoreNumeric: z.number(),
  scoreGrade: z.string(),
  patternCount: z.number(),
  criticalCount: z.number(),
  highCount: z.number(),
  pdfPath: z.string().nullable(),
  htmlPath: z.string().nullable(),
  createdAt: z.string(),
})
export type ScanHistoryRow = z.infer<typeof ScanHistoryRowSchema>

export const HistoryResponseSchema = z.object({
  scans: z.array(ScanHistoryRowSchema),
  total: z.number(),
})
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>
