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
  screenshotBase64: z
    .string()
    .max(8_000_000)
    .regex(/^\/9j\/[A-Za-z0-9+/]*={0,2}$/, 'Expected a base64 JPEG screenshot')
    .optional(),
  captureTruncated: z.boolean().optional(),
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
  /** Public URL of the step screenshot, not a server file path. */
  screenshotPath: z.string().optional(),
  patternsFound: z.array(DetectedPatternSchema),
  timestamp: z.string(),
  status: WorkflowStepStatusSchema.optional(),
  navAdvanced: z.boolean().optional(),
  navReason: z.string().optional(),
  visualCheckAvailable: z.boolean().optional(),
  captureTruncated: z.boolean().optional(),
})
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>

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
  // Public URLs of the saved report files (e.g. `/trusten/report/<id>/pdf`),
  // never server file paths. A missing file comes back as `null`.
  pdfPath: z.string().nullable().optional(),
  htmlPath: z.string().nullable().optional(),
  videoPath: z.string().nullable().optional(),
})
export type ScanDetail = z.infer<typeof ScanDetailSchema>
