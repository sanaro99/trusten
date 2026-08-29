/**
 * Trusten — dark-pattern domain types.
 *
 * Source of truth for both the server and the web client. The enum string
 * values are persisted in SQLite (`patterns_json`) — do not change them.
 */
import { z } from 'zod'

// ─── Dark Pattern Categories (25 total, grouped into 10 analyzer modules) ───

export enum DarkPatternCategory {
  // Urgency & Scarcity (Analyzer 1)
  FAKE_URGENCY = 'fake_urgency',
  FAKE_SCARCITY = 'fake_scarcity',
  FAKE_SOCIAL_PROOF = 'fake_social_proof',

  // Misdirection (Analyzer 2)
  CONFIRMSHAMING = 'confirmshaming',
  TRICK_WORDING = 'trick_wording',
  VISUAL_INTERFERENCE = 'visual_interference',

  // Sneaking (Analyzer 3)
  BASKET_SNEAKING = 'basket_sneaking',
  DRIP_PRICING = 'drip_pricing',
  BAIT_AND_SWITCH = 'bait_and_switch',

  // Obstruction (Analyzer 4)
  ROACH_MOTEL = 'roach_motel',
  FORCED_CONTINUITY = 'forced_continuity',
  HARD_TO_CANCEL = 'hard_to_cancel',

  // Forced Action (Analyzer 5)
  FORCED_REGISTRATION = 'forced_registration',
  FORCED_SHARING = 'forced_sharing',
  GAMIFICATION_PRESSURE = 'gamification_pressure',

  // Preselection (Analyzer 6)
  PRESELECTED_OPTIONS = 'preselected_options',
  HIDDEN_DEFAULTS = 'hidden_defaults',

  // Nagging (Analyzer 7)
  REPEATED_PROMPTS = 'repeated_prompts',
  DISGUISED_ADS = 'disguised_ads',

  // Comparison Prevention (Analyzer 8)
  COMPARISON_PREVENTION = 'comparison_prevention',
  INFORMATION_HIDING = 'information_hiding',

  // Privacy (Analyzer 9)
  PRIVACY_ZUCKERING = 'privacy_zuckering',
  COOKIE_WALL = 'cookie_wall',
  DARK_CONSENT = 'dark_consent',

  // Interface Manipulation (Analyzer 10)
  FAKE_HIERARCHY = 'fake_hierarchy',
}

// ─── Regulatory Framework ───

export enum Regulation {
  FTC_ACT = 'FTC Act §5',
  GDPR = 'GDPR',
  EU_DSA = 'EU Digital Services Act',
  CCPA_CPRA = 'CCPA/CPRA',
  INDIA_DPDP = 'India DPDP Act',
  UK_ONLINE_SAFETY = 'UK Online Safety Act',
  EU_CRD = 'EU Consumer Rights Directive',
  AUSTRALIA_ACL = 'Australian Consumer Law',
  CANADA_PIPEDA = 'Canada PIPEDA',
  JAPAN_APPI = 'Japan APPI',
  BRAZIL_LGPD = 'Brazil LGPD',
  KOREA_PIPA = 'Korea PIPA',
  SINGAPORE_PDPA = 'Singapore PDPA',
  EU_UCPD = 'EU Unfair Commercial Practices Directive',
}

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low'])
export type Severity = z.infer<typeof SeveritySchema>

export const GradeSchema = z.enum(['A', 'B', 'C', 'D', 'F'])
export type Grade = z.infer<typeof GradeSchema>

export const RegulatoryViolationSchema = z.object({
  regulation: z.nativeEnum(Regulation),
  article: z.string(),
  description: z.string(),
})
export type RegulatoryViolation = z.infer<typeof RegulatoryViolationSchema>

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})
export type BoundingBox = z.infer<typeof BoundingBoxSchema>

export const ElementEvidenceSchema = z.object({
  selector: z.string(),
  text: z.string(),
  html: z.string(),
  boundingBox: BoundingBoxSchema.optional(),
})
export type ElementEvidence = z.infer<typeof ElementEvidenceSchema>

export const PatternEvidenceSchema = z.object({
  screenshot: z.string().optional(),
  screenshotUrl: z.string().optional(),
  domSnapshot: z.string().optional(),
  networkEvidence: z.array(z.string()).optional(),
})
export type PatternEvidence = z.infer<typeof PatternEvidenceSchema>

export const DetectedPatternSchema = z.object({
  id: z.string(),
  category: z.nativeEnum(DarkPatternCategory),
  severity: SeveritySchema,
  confidence: z.number().min(0).max(1),
  description: z.string(),
  element: ElementEvidenceSchema.optional(),
  evidence: PatternEvidenceSchema,
  regulatoryViolations: z.array(RegulatoryViolationSchema),
  detectedAt: z.string(),
  url: z.string(),
  pageTitle: z.string(),
  source: z.enum(['live', 'deep-cache']).optional(),
  cachedAt: z.string().optional(),
})
export type DetectedPattern = z.infer<typeof DetectedPatternSchema>
