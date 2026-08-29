/**
 * Trusten API — scan endpoints.
 *
 * One definition, validated by the server and used for types by the web
 * client, so the two cannot drift.
 */
import { z } from 'zod'
import { DetectedPatternSchema, GradeSchema } from '../domain'

const trimmedUrl = z.string().trim().min(1, 'url is required')

export const AnalyzePageRequestSchema = z.object({
  url: trimmedUrl,
  html: z.string().min(1, 'html is required'),
  text: z.string().default(''),
  pageTitle: z.string().default(''),
})
export type AnalyzePageRequest = z.infer<typeof AnalyzePageRequestSchema>

export const CategoryScoreSchema = z.object({
  count: z.number(),
  severity: z.string(),
  score: z.number(),
})

export const ScanScoreSchema = z.object({
  numeric: z.number(),
  grade: GradeSchema,
  summary: z.string(),
  categoryBreakdown: z.record(z.string(), CategoryScoreSchema),
})

/** Mirrors WorkflowStepStatus in apps/server/src/trusten/types/workflow.ts. */
export const WorkflowStepStatusSchema = z.enum([
  'reached',
  'observed',
  'not-reached',
  'skipped',
  'no-navigation',
])

/** Mirrors WorkflowStep in apps/server/src/trusten/types/workflow.ts. */
export const WorkflowStepSchema = z.object({
  stepNumber: z.number(),
  action: z.string(),
  url: z.string(),
  screenshot: z.string(),
  screenshotPath: z.string().optional(),
  patternsFound: z.array(DetectedPatternSchema),
  timestamp: z.string(),
  status: WorkflowStepStatusSchema.optional(),
  navAdvanced: z.boolean().optional(),
  navReason: z.string().optional(),
})

export const ScanDetailSchema = z.object({
  id: z.string(),
  url: z.string(),
  domain: z.string(),
  scanType: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  patterns: z.array(DetectedPatternSchema),
  score: ScanScoreSchema,
  workflowSteps: z.array(WorkflowStepSchema).optional(),
  // getTrustenScanById reads these straight off the SQLite row: a NULL
  // column comes back as `null`, not `undefined`, whatever the server's own
  // (unchecked) type cast claims.
  pdfPath: z.string().nullable().optional(),
  htmlPath: z.string().nullable().optional(),
  videoPath: z.string().nullable().optional(),
})
export type ScanDetail = z.infer<typeof ScanDetailSchema>
