/**
 * Trusten — Dark Pattern Detection Engine
 * Core type definitions
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

// ─── Scoring ───

export interface CategoryScore {
  count: number
  severity: Severity
  score: number
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface DarkPatternScore {
  numeric: number // 0-100 (100 = cleanest)
  grade: Grade
  categoryBreakdown: Partial<Record<DarkPatternCategory, CategoryScore>>
  summary: string
}

// ─── Workflow ───

/**
 * Outcome of a workflow step's navigation, so the report never presents a
 * non-journey as a journey:
 *  - reached       expected to advance and did (URL/DOM changed)
 *  - observed      did not need to advance (e.g. inspect the current page)
 *  - not-reached   expected to advance but the page did not change
 *  - skipped       an earlier funnel step failed, so this dependent step was skipped
 *  - no-navigation no LLM configured and no deterministic fallback to attempt
 */
export type WorkflowStepStatus =
  | 'reached'
  | 'observed'
  | 'not-reached'
  | 'skipped'
  | 'no-navigation'

export interface WorkflowStep {
  stepNumber: number
  action: string
  url: string
  screenshot: string // Base64 (omitted in DB, use screenshotPath instead)
  screenshotPath?: string // Absolute path to saved JPEG file
  patternsFound: DetectedPattern[]
  timestamp: string
  /** Whether the step reached its target / advanced the journey. */
  status?: WorkflowStepStatus
  /** The page URL or DOM materially changed during this step. */
  navAdvanced?: boolean
  /** Human-readable explanation of the navigation outcome. */
  navReason?: string
}

export interface WorkflowStepDefinition {
  id: string
  instruction: string
  analyzersToRun: string[]
  /**
   * Natural language goal for the AI navigator (preferred over clickText/fillSearch).
   * The AI reads the accessibility tree and figures out how to accomplish this goal
   * on any site — no hardcoded selectors needed.
   */
  aiGoal?: string
  /**
   * Navigate to this URL before analysis. Can be absolute or relative to the
   * scan's base URL. Use `{baseUrl}` as a placeholder for the starting URL.
   */
  navigate?: string
  /**
   * Fallback: click the first visible element whose text contains this string.
   * Used when aiGoal is not set or when AI navigator is unavailable.
   */
  clickText?: string[]
  /**
   * Fallback: type this text into the site's main search box.
   */
  fillSearch?: string
  successCriteria?: string
  /**
   * Whether this step is expected to advance the journey (move to a new
   * page/state). When true, a step that does not change the page is reported as
   * `not-reached` and breaks the funnel for dependent steps. When false/omitted
   * the step is treated as an in-place observation (e.g. inspect a cookie
   * banner or a form on the current page).
   */
  expectsNavigation?: boolean
  timeout: number
  screenshotBefore: boolean
  screenshotAfter: boolean
}

export interface ScanWorkflow {
  id: string
  name: string
  description: string
  steps: WorkflowStepDefinition[]
}

// ─── Scan Result ───

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

// ─── Analyzer Context ───

export interface NetworkRequest {
  url: string
  method: string
  status?: number
  responseBody?: string
  headers?: Record<string, string>
}

export interface CookieInfo {
  name: string
  value: string
  domain: string
  path: string
  expires?: string
  secure: boolean
  httpOnly: boolean
  sameSite?: string
}

export interface AnalyzerContext {
  url: string
  pageTitle: string
  domSnapshot: string
  visibleText: string
  screenshotBase64: string
  networkRequests: NetworkRequest[]
  cookies: CookieInfo[]
  previousStepContext?: AnalyzerContext
}

export interface AnalyzerResult {
  patterns: DetectedPattern[]
  metadata?: Record<string, unknown>
}

// ─── LLM Provider Config ───

export type TrustenLLMProvider =
  | 'nvidia-nim'
  | 'gemini'
  | 'deepseek'
  | 'openrouter'
  | 'ollama'

export interface TrustenLLMConfig {
  provider: TrustenLLMProvider
  apiKey?: string
  baseUrl?: string
  model?: string
}
