/**
 * Trusten — BrowserDriver interface
 *
 * The single seam between Trusten's scan engine and the underlying browser.
 * Trusten originally ran against BrowserOS's CDP-backed `Browser` class; this
 * interface captures exactly the method surface the engine, the AI navigator,
 * and the pre-scan utilities depend on, so a plain headless browser
 * (`PlaywrightDriver`) can be dropped in without touching detection logic.
 *
 * Method names and shapes intentionally mirror the original BrowserOS `Browser`
 * so the consumers only swap a type import.
 */

import type { CookieInfo, NetworkRequest } from '../types'

export interface DriverPageInfo {
  pageId: number
  url: string
  title: string
  isActive?: boolean
}

export interface ScreenshotResult {
  data: string // base64-encoded image bytes
  mimeType?: string
}

export interface EvaluateResult {
  value?: unknown
  error?: string
  description?: string
}

export interface NewPageOptions {
  /** Open in the background (ignored by headless drivers). */
  background?: boolean
  /** Open hidden (ignored by headless drivers). */
  hidden?: boolean
  /**
   * Directory to record a session video into. When set, the driver records the
   * page's whole session and exposes the resulting file via `videoPath()`.
   */
  videoDir?: string
  /**
   * When set, the driver live-streams CDP screencast frames to the live hub
   * under this key (used to watch a Deep Scan in the dashboard). When combined
   * with `videoDir`, the mp4 is assembled from the streamed frames.
   */
  liveKey?: string
}

export interface BrowserDriver {
  newPage(url: string, opts?: NewPageOptions): Promise<number>
  closePage(pageId: number): Promise<void>
  goto(pageId: number, url: string): Promise<void>

  listPages(): Promise<DriverPageInfo[]>
  getActivePage(): Promise<DriverPageInfo | null>

  evaluate(pageId: number, expression: string): Promise<EvaluateResult>
  screenshot(
    pageId: number,
    opts: { format: string; quality?: number; fullPage: boolean },
  ): Promise<ScreenshotResult>
  printToPDF(
    pageId: number,
    opts?: { landscape?: boolean; printBackground?: boolean },
  ): Promise<{ data: string }>

  /** Numbered interactive-element tree: `[id] role "name"` lines. */
  snapshot(pageId: number): Promise<string>
  click(pageId: number, elementId: number): Promise<unknown>
  fill(
    pageId: number,
    elementId: number,
    value: string,
    clear?: boolean,
  ): Promise<unknown>
  pressKey(pageId: number, key: string): Promise<void>

  contentAsMarkdown(
    pageId: number,
    opts?: {
      viewportOnly?: boolean
      includeLinks?: boolean
      includeImages?: boolean
    },
  ): Promise<string>

  waitFor(
    pageId: number,
    opts: { text?: string; selector?: string; timeout: number },
  ): Promise<boolean>

  /**
   * Best-effort wait until the page is network-idle. Used after a navigation
   * action so SPA route changes settle before the next snapshot/screenshot.
   * Optional — callers skip it when the driver does not implement it.
   */
  waitForIdle?(pageId: number, opts?: { timeout?: number }): Promise<void>

  /**
   * Resolve the recorded session video path for a page (if `videoDir` was set
   * on `newPage`). Optional — drivers without recording return null/omit it.
   */
  videoPath?(pageId: number): Promise<string | null>

  /** Network requests observed on the page so far (optional). */
  getNetworkRequests?(pageId: number): Promise<NetworkRequest[]>
  /** Cookies set in the page's context (incl. httpOnly) (optional). */
  getCookies?(pageId: number): Promise<CookieInfo[]>
}
