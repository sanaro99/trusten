/** Trusten — Workflow definitions and per-step execution records. */

import type { DetectedPattern } from './patterns'

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
  /**
   * Deterministic: click the first prominent content link/result on the page
   * (excludes header/nav/footer). Used for "open the first product/result"
   * steps that have no fixed clickText.
   */
  clickFirst?: boolean
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
