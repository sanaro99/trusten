/**
 * Trusten — Dark pattern categories, severity, regulatory mapping, and the
 * DetectedPattern shape produced by every analyzer.
 */

// ─── Dark Pattern Categories (24 total, grouped into 10 analyzer modules) ───

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

// ─── Severity ───

export type Severity = 'critical' | 'high' | 'medium' | 'low'

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

export interface RegulatoryViolation {
  regulation: Regulation
  article: string
  description: string
}

// ─── Detected Pattern ───

export interface ElementEvidence {
  selector: string
  text: string
  html: string
  boundingBox?: { x: number; y: number; width: number; height: number }
}

export interface PatternEvidence {
  screenshot?: string
  screenshotUrl?: string
  domSnapshot?: string
  networkEvidence?: string[]
}

export interface DetectedPattern {
  id: string
  category: DarkPatternCategory
  severity: Severity
  confidence: number // 0-1
  description: string
  element?: ElementEvidence
  evidence: PatternEvidence
  regulatoryViolations: RegulatoryViolation[]
  detectedAt: string // ISO timestamp
  url: string
  pageTitle: string
  /** Where this finding came from: a live scan, or merged from a cached deep scan. */
  source?: 'live' | 'deep-cache'
  /** When the cached deep scan that produced this finding ran (deep-cache only). */
  cachedAt?: string
}
