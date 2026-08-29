import { z } from 'zod'

export const DomainSummarySchema = z.object({
  domain: z.string(),
  scanCount: z.number(),
  latestGrade: z.string(),
  latestScore: z.number(),
  latestScanAt: z.string(),
  avgScore: z.number(),
  totalPatterns: z.number(),
  criticalCount: z.number(),
  highCount: z.number(),
})
export type DomainSummary = z.infer<typeof DomainSummarySchema>

export const GlobalStatsSchema = z.object({
  totalScans: z.number(),
  totalDomains: z.number(),
  totalPatterns: z.number(),
  avgScore: z.number(),
  cleanSites: z.number(),
  dirtySites: z.number(),
})
export type GlobalStats = z.infer<typeof GlobalStatsSchema>
