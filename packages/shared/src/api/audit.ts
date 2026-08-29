import { z } from 'zod'

const trimmedUrl = z.string().trim().min(1, 'url is required')

export const QuickScanRequestSchema = z.object({ url: trimmedUrl })
export type QuickScanRequest = z.infer<typeof QuickScanRequestSchema>

export const AuditRequestSchema = z.object({
  url: trimmedUrl,
  workflows: z.array(z.string()).optional(),
  watch: z.boolean().default(false),
  mode: z.enum(['fixed', 'discover']).default('fixed'),
})
export type AuditRequest = z.infer<typeof AuditRequestSchema>

export const AuditStartResponseSchema = z.object({
  jobId: z.string(),
  domain: z.string(),
})
export type AuditStartResponse = z.infer<typeof AuditStartResponseSchema>

export const AuditPlanItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  steps: z.number(),
})

export const AuditStatusSchema = z.object({
  jobId: z.string(),
  status: z.enum(['pending', 'running', 'done', 'failed']),
  domain: z.string(),
  workflows: z.array(z.string()),
  completedWorkflows: z.array(z.string()),
  currentStep: z.string(),
  scanIds: z.array(z.string()),
  error: z.string().nullable(),
  plan: z.array(AuditPlanItemSchema),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})
export type AuditStatus = z.infer<typeof AuditStatusSchema>

/** Events pushed over the live WebSocket — mirrors live/hub.ts LiveEvent. */
export const LiveEventSchema = z.object({
  type: z.enum(['frame', 'progress', 'done', 'error']),
  data: z.string().optional(),
  step: z.number().optional(),
  total: z.number().optional(),
  url: z.string().optional(),
  action: z.string().optional(),
  patternCount: z.number().optional(),
  grade: z.string().optional(),
  message: z.string().optional(),
})
export type LiveEvent = z.infer<typeof LiveEventSchema>
