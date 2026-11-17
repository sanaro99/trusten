/**
 * Trusten API — scan endpoints.
 *
 * One definition, validated by the server and used for types by the web
 * client, so the two cannot drift.
 */
import { z } from 'zod'
import { DetectedPatternSchema, GradeSchema } from '../domain'

const trimmedUrl = z.string().trim().min(1, 'url is required')

/** The extension sends at most 500k of HTML and 50k of text; allow headroom. */
export const ANALYZE_PAGE_LIMITS = {
  url: 2_048,
  html: 600_000,
  text: 60_000,
  pageTitle: 1_000,
  screenshotBase64: 8_000_000,
} as const

export const AnalyzePageRequestSchema = z.object({
  url: trimmedUrl.max(ANALYZE_PAGE_LIMITS.url, 'url is too long'),
  html: z
    .string()
    .min(1, 'html is required')
    .max(ANALYZE_PAGE_LIMITS.html, 'html is too large'),
  text: z
    .string()
    .max(ANALYZE_PAGE_LIMITS.text, 'text is too large')
    .default(''),
  pageTitle: z
    .string()
    .max(ANALYZE_PAGE_LIMITS.pageTitle, 'pageTitle is too long')
    .default(''),
  screenshotBase64: z
    .string()
    .max(ANALYZE_PAGE_LIMITS.screenshotBase64, 'screenshot is too large')
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
  pageTextCaptured: z.boolean().optional(),
})
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>

export const ScanDetailSchema = z.object({
  id: z.string(),
  url: z.string(),
  domain: z.string(),
  scanType: z.string(),
  /**
   * `extension`: analyzed from page content a browser extension submitted.
   * Trusten did not load the page itself, so the result is unverified and is
   * kept out of public history. Older rows and server scans omit it.
   */
  source: z.enum(['server', 'extension']).optional(),
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
