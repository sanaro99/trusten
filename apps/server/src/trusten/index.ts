/**
 * Trusten — Main Orchestrator
 *
 * TrustenEngine ties together all 10 analyzers, the scoring engine,
 * and the workflow runner into the two primary scan modes:
 *
 *   quickScan(url)       — Single-page, all-10-analyzers pass
 *   deepScan(url, wf)    — Multi-step workflow with annotated screenshots + PDF
 *   analyzeCurrentPage() — Scan whatever page is currently open
 */

import { isAccessChallengeUrl } from '@trusten/shared/domain'
import { logger } from '../lib/logger'
import { navigateWithAI } from './agent/navigator'
import type { BaseAnalyzer } from './analyzers/base-analyzer'
import { ALL_ANALYZERS, getAnalyzers } from './analyzers/registry'
import type { BrowserDriver } from './browser/driver'
import { capturePageState } from './browser/page-state'
import { publish } from './live/hub'
import { getTrustenLLM } from './llm/client'
import { ScanIncompleteError } from './scan-incomplete-error'
import { calculateScore } from './scoring/engine'
import { postgresScanStore, type ScanStore } from './store'
import type {
  AnalyzerContext,
  AnalyzerResult,
  DetectedPattern,
  ScanResult,
  ScanWorkflow,
  WorkflowStep,
  WorkflowStepStatus,
} from './types'
import { sleep } from './utils/delay'
import { normalizeUrlKey } from './utils/url'

/**
 * Collapse patterns that are effectively the same finding seen on the same page
 * across multiple steps (keyed by category + severity + normalized URL +
 * description prefix). Keeps the first occurrence. This prevents a page that was
 * analyzed more than once — e.g. when a step did not advance — from inflating
 * the score or the report.
 */
function dedupePatterns(patterns: DetectedPattern[]): DetectedPattern[] {
  const seen = new Set<string>()
  const out: DetectedPattern[] = []
  for (const p of patterns) {
    const key = `${p.category}|${p.severity}|${normalizeUrlKey(p.url ?? '')}|${(p.description ?? '').trim().slice(0, 120)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

// ─── Orchestrator ───

export class TrustenEngine {
  private browser: BrowserDriver
  private reportsDir: string
  private store: ScanStore

  constructor(
    browser: BrowserDriver,
    executionDir?: string,
    store: ScanStore = postgresScanStore,
    reportsDir?: string,
  ) {
    this.browser = browser
    this.store = store
    // Save reports to Desktop so they're always easily findable,
    // regardless of which directory the binary happens to be running from.
    const home =
      process.env.USERPROFILE ??
      process.env.HOME ??
      executionDir ??
      process.cwd()
    this.reportsDir =
      reportsDir ??
      process.env.TRUSTEN_REPORTS_DIR ??
      `${home}/Desktop/trusten-reports`
  }

  /**
   * Quick scan: navigate to URL, capture context, run all 10 analyzers in parallel.
   */
  async quickScan(url: string): Promise<ScanResult> {
    const startedAt = new Date().toISOString()
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    logger.info('Trusten quick scan starting', { url, scanId })

    let pageId: number | null = null
    try {
      // Open a new page for the scan
      pageId = await this.browser.newPage(url, { background: true })
      await this.waitForPageLoad(pageId)

      const context = await this.captureUsableContext(pageId)

      const [fs, path] = await Promise.all([
        import('node:fs'),
        import('node:path'),
      ])
      const screenshotDir = path.join(this.reportsDir, 'screenshots', scanId)
      fs.mkdirSync(screenshotDir, { recursive: true })
      const screenshotPath = path.join(screenshotDir, 'step-1.jpg')
      fs.writeFileSync(
        screenshotPath,
        Buffer.from(context.screenshotBase64, 'base64'),
      )

      let visualCheckAvailable = false
      const livePatterns = await this.runAnalyzers(
        ALL_ANALYZERS,
        context,
        (analyzer, analyzerResult) => {
          if (analyzer.name === 'VisualAnalyzer') {
            visualCheckAvailable =
              analyzerResult.metadata?.visualCheckAvailable === true
          }
        },
      )
      const patterns = await this.mergeCachedFindings(url, livePatterns)
      const score = calculateScore(patterns)

      const result: ScanResult = {
        id: scanId,
        url,
        domain: new URL(url).hostname,
        scanType: 'quick',
        startedAt,
        completedAt: new Date().toISOString(),
        patterns,
        score,
        workflowSteps: [
          {
            stepNumber: 1,
            action: 'Inspect the initial page',
            url: context.url,
            screenshot: '',
            screenshotPath,
            patternsFound: patterns,
            timestamp: new Date().toISOString(),
            status: 'observed',
            navAdvanced: false,
            visualCheckAvailable,
          },
        ],
      }

      const report = await this.generateReport(
        result,
        'Quick website check',
        pageId,
      )
      result.pdfPath = report.pdfPath
      result.htmlPath = report.htmlPath

      // A quick result is only complete when the result page can load it.
      await this.persistScan(result)

      logger.info('Trusten quick scan complete', {
        url,
        patternCount: patterns.length,
        grade: score.grade,
        numeric: score.numeric,
      })

      return result
    } finally {
      if (pageId !== null) {
        await this.browser.closePage(pageId).catch(() => undefined)
      }
    }
  }

  /**
   * Deep scan: execute a multi-step workflow with annotated screenshots, PDF report, and DB persistence.
   */
  async deepScan(
    url: string,
    workflow: ScanWorkflow,
    opts: { jobKey?: string; watch?: boolean } = {},
  ): Promise<ScanResult> {
    const startedAt = new Date().toISOString()
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    logger.info('Trusten deep scan starting', {
      url,
      workflow: workflow.id,
      steps: workflow.steps.length,
      scanId,
    })

    let pageId: number | null = null
    const allPatterns: DetectedPattern[] = []
    const workflowSteps: WorkflowStep[] = []

    try {
      const {
        dismissCookieBanners,
        dismissInterferingModals,
        generateFakeProfile,
        resolveGoalTemplate,
      } = await import('./utils/pre-scan')

      // Create the per-scan directory up front so it can also hold the session
      // video that Playwright records for the lifetime of the page/context.
      const screenshotDir = `${this.reportsDir}/screenshots/${scanId}`
      const fs = await import('node:fs')
      fs.mkdirSync(screenshotDir, { recursive: true })

      pageId = await this.browser.newPage(url, {
        background: true,
        videoDir: screenshotDir,
        liveKey: opts.watch ? opts.jobKey : undefined,
      })
      const pid = pageId
      await this.waitForPageLoad(pid)
      await this.captureUsableContext(pid)

      const fakeProfile = generateFakeProfile()
      // Consent workflows must inspect the original banner and preference path.
      // Other journeys clear obstructions only when navigation begins.
      const preserveConsent = workflow.id === 'cookie_consent'
      let obstructionsCleared = false

      // Navigation strategy: deterministic Puppeteer actions first (fast); the
      // LLM navigator is only a fallback when a step does not advance. Where
      // neither can act we report honestly rather than re-analyzing the homepage.
      const llmReady = getTrustenLLM().isConfigured()
      const journeyLog: string[] = []
      // URLs already analyzed this scan — the LLM-backed visual pass runs at most
      // once per distinct page (deterministic analyzers still run on repeats).
      const analyzedUrls = new Set<string>()
      let funnelBroken = false
      logger.info('Trusten deep scan navigation mode', {
        llmReady,
        mode: 'deterministic-first',
      })

      for (let i = 0; i < workflow.steps.length; i++) {
        const stepDef = workflow.steps[i]
        const stepNumber = i + 1
        const expectsNav = stepDef.expectsNavigation === true
        const hasDeterministic = !!(
          stepDef.clickText?.length ||
          stepDef.fillSearch ||
          stepDef.navigate ||
          stepDef.clickFirst
        )

        logger.info(
          `Trusten step ${stepNumber}/${workflow.steps.length}: ${stepDef.instruction.slice(0, 80)}`,
        )

        if (opts.jobKey) {
          publish(opts.jobKey, {
            type: 'progress',
            step: stepNumber,
            total: workflow.steps.length,
            action: `${workflow.name}: ${stepDef.instruction.slice(0, 80)}`,
          })
        }

        if (
          expectsNav &&
          !funnelBroken &&
          !preserveConsent &&
          !obstructionsCleared
        ) {
          const context = await this.captureContext(pid)
          this.assertUsableContext(context)
          const preflightPatterns = await this.runAllAnalyzers(context)
          allPatterns.push(...preflightPatterns)
          if (preflightPatterns.length > 0) {
            const evidence = await this.captureStepScreenshot(
              pid,
              screenshotDir,
              0,
              workflow.steps.length,
              'Inspect the initial page before clearing overlays',
              preflightPatterns,
            )
            workflowSteps.push({
              stepNumber: 0,
              action: 'Inspect the initial page before clearing overlays',
              url: context.url,
              screenshot: '',
              screenshotPath: evidence.screenshotPath,
              patternsFound: preflightPatterns,
              timestamp: new Date().toISOString(),
              status: 'observed',
              navAdvanced: false,
            })
          }
          await dismissCookieBanners(this.browser, pid)
          await dismissInterferingModals(this.browser, pid)
          obstructionsCleared = true
        }
        const before = await capturePageState(this.browser, pid)
        const beforeUrl = before.url || url

        let status: WorkflowStepStatus | undefined
        let navAdvanced = false
        let deterministicActionPerformed = false
        let navReason = ''

        if (funnelBroken && !stepDef.navigate) {
          // A prior funnel step never advanced — running this dependent step
          // would just re-analyze the same (earlier) page. Skip it honestly.
          status = 'skipped'
          navReason =
            'Skipped: an earlier funnel step did not advance, so this page was never reached'
          logger.info(`Trusten step ${stepNumber} skipped`, {
            reason: navReason,
          })
        } else if (!expectsNav) {
          // Observation step (e.g. inspect a cookie banner or a form) — analyze
          // the current page in place; no navigation needed (and no LLM spent).
          status = 'observed'
          navReason = 'Observed the current page (no navigation expected)'
        } else {
          // Funnel step: try the FAST deterministic path first; only fall back
          // to the LLM navigator if the deterministic action did not advance.
          let advancedNow = false
          if (stepDef.navigate) funnelBroken = false
          if (hasDeterministic) {
            deterministicActionPerformed = await this.executeStepNavigation(
              pid,
              stepDef,
              url,
            )
            if (this.browser.waitForIdle) {
              await this.browser
                .waitForIdle(pid, { timeout: 5000 })
                .catch(() => undefined)
            }
            await sleep(400)
            const midState = await capturePageState(this.browser, pid)
            advancedNow =
              deterministicActionPerformed &&
              midState.signature !== before.signature
            navReason = advancedNow
              ? 'Deterministic navigation'
              : 'Deterministic action did not advance'
          }

          if (!advancedNow && llmReady && stepDef.aiGoal) {
            // Deterministic path stalled — let the LLM navigator take over.
            const resolvedGoal = resolveGoalTemplate(
              stepDef.aiGoal,
              fakeProfile,
            )
            const navResult = await navigateWithAI(
              this.browser,
              pid,
              resolvedGoal,
              Math.min(Math.floor(stepDef.timeout / 6), 6),
              journeyLog,
            )
            navAdvanced = navResult.success && navResult.advanced
            if (!navResult.success) {
              status = 'not-reached'
              funnelBroken = true
            }
            navReason = `LLM fallback: ${navResult.reason}`
            journeyLog.push(
              `Step ${stepNumber} (${stepDef.id}): ${navResult.reason.slice(0, 100)}`,
            )
            logger.info(`Trusten step ${stepNumber} LLM fallback result`, {
              success: navResult.success,
              advanced: navResult.advanced,
              steps: navResult.stepsExecuted,
              url: navResult.finalUrl,
            })
          } else if (advancedNow) {
            navAdvanced = true
            journeyLog.push(
              `Step ${stepNumber} (${stepDef.id}): deterministic navigation`,
            )
          } else if (!hasDeterministic && !(llmReady && stepDef.aiGoal)) {
            // Nothing available to navigate with.
            status = 'no-navigation'
            navReason =
              'No LLM configured and no deterministic fallback for this step'
            funnelBroken = true
            logger.warn(`Trusten step ${stepNumber} has no way to navigate`, {
              llmReady,
            })
          }
        }

        // Allow SPA route changes / XHR to settle after navigation.
        if (this.browser.waitForIdle) {
          await this.browser
            .waitForIdle(pid, { timeout: 6000 })
            .catch(() => undefined)
        }
        await sleep(800)

        const currentState = await capturePageState(this.browser, pid)
        const currentUrl = currentState.url || beforeUrl
        const advanced =
          expectsNav &&
          status === undefined &&
          (navAdvanced ||
            (deterministicActionPerformed &&
              currentState.signature !== before.signature))

        // Resolve the step's outcome status if not already decided.
        if (status === undefined) {
          if (!expectsNav) {
            status = 'observed'
          } else if (advanced) {
            status = 'reached'
          } else {
            status = 'not-reached'
            funnelBroken = true
          }
        }

        // Only analyze when we actually navigated (or legitimately observed the
        // current page). Skipped / no-navigation steps would just re-analyze an
        // already-covered page and inflate duplicate findings.
        let stepPatterns: DetectedPattern[] = []
        let visualCheckAvailable = false
        if (status === 'reached' || status === 'observed') {
          const urlKey = currentState.signature
          const isNewPage = !analyzedUrls.has(urlKey)
          analyzedUrls.add(urlKey)

          const context = await this.captureContext(pid)
          this.assertUsableContext(context)
          // Run the costly LLM-backed visual pass only the first time we see a
          // page; on repeats, deterministic analyzers only.
          const names = isNewPage
            ? stepDef.analyzersToRun
            : stepDef.analyzersToRun.filter((n) => n !== 'VisualAnalyzer')
          const targetAnalyzers = getAnalyzers(names)
          stepPatterns = await this.runAnalyzers(
            targetAnalyzers,
            context,
            (analyzer, result) => {
              if (analyzer.name === 'VisualAnalyzer')
                visualCheckAvailable =
                  result.metadata?.visualCheckAvailable === true
            },
          )
          allPatterns.push(...stepPatterns)
        }

        // Cache this page's findings so a later Quick Scan of the same page can
        // surface them instantly.
        if (stepPatterns.length > 0) {
          try {
            await this.store.cachePageFindings(
              normalizeUrlKey(currentUrl),
              currentUrl,
              stepPatterns,
              scanId,
            )
          } catch {
            /* non-fatal */
          }
        }

        if (opts.jobKey) {
          publish(opts.jobKey, {
            type: 'progress',
            step: stepNumber,
            total: workflow.steps.length,
            url: currentUrl,
            patternCount: stepPatterns.length,
          })
        }

        // ── Screenshot: annotate, capture, save ──────────────────────────
        const { screenshotB64, screenshotPath } =
          status === 'skipped' || status === 'no-navigation'
            ? { screenshotB64: '', screenshotPath: '' }
            : await this.captureStepScreenshot(
                pid,
                screenshotDir,
                stepNumber,
                workflow.steps.length,
                stepDef.instruction,
                stepPatterns,
              )

        workflowSteps.push({
          stepNumber,
          action: stepDef.instruction,
          url: currentUrl,
          screenshot: screenshotB64,
          screenshotPath,
          patternsFound: stepPatterns,
          timestamp: new Date().toISOString(),
          status,
          navAdvanced: advanced,
          navReason,
          visualCheckAvailable,
        } as WorkflowStep & { screenshotPath: string })

        logger.info(`Trusten step ${stepNumber} done`, {
          status,
          patternsFound: stepPatterns.length,
          url: currentUrl,
          advanced,
        })
      }

      // Collapse duplicate findings that the same page produced across steps
      // (e.g. when a step did not advance) so a re-analyzed page can't inflate
      // the score or clutter the report.
      const dedupedPatterns = dedupePatterns(allPatterns)
      const score = calculateScore(dedupedPatterns)
      const completedAt = new Date().toISOString()

      const result: ScanResult = {
        id: scanId,
        url,
        domain: new URL(url).hostname,
        scanType: 'deep',
        startedAt,
        completedAt,
        patterns: dedupedPatterns,
        score,
        workflowSteps,
      }

      // Resolve the recorded session video path (file is flushed on page close,
      // which happens in the finally block below; the path is known now).
      try {
        const vp = await this.browser.videoPath?.(pid)
        if (vp) result.videoPath = vp
      } catch {
        /* video recording is best-effort */
      }

      // Flush recorded evidence before making the result available to readers.
      await this.browser.closePage(pid)
      pageId = null

      // Generate HTML + PDF report, persist to DB
      const { pdfPath, htmlPath } = await this.generateReport(
        result,
        workflow.name,
        pid,
      )
      result.pdfPath = pdfPath
      result.htmlPath = htmlPath

      await this.persistScan(result, workflow.id)

      logger.info('Trusten deep scan complete', {
        url,
        workflow: workflow.id,
        totalPatterns: allPatterns.length,
        grade: score.grade,
        pdfPath,
      })

      return result
    } finally {
      if (pageId !== null) {
        await this.browser.closePage(pageId).catch(() => undefined)
      }
    }
  }

  /**
   * Publish one result covering all audited journeys, with their original proof.
   */
  async summarizeAudit(
    url: string,
    scans: ScanResult[],
    failedSteps: WorkflowStep[] = [],
  ): Promise<ScanResult> {
    if (scans.length === 0)
      throw new ScanIncompleteError('No pages could be checked.')
    const patterns = dedupePatterns(scans.flatMap((scan) => scan.patterns))
    const workflowSteps = [
      ...scans.flatMap((scan) => scan.workflowSteps ?? []),
      ...failedSteps,
    ].map((step, index) => ({
      ...step,
      stepNumber: index + 1,
    }))
    const result: ScanResult = {
      id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url,
      domain: new URL(url).hostname,
      scanType: 'deep',
      startedAt: scans[0].startedAt,
      completedAt: new Date().toISOString(),
      patterns,
      score: calculateScore(patterns),
      workflowSteps,
      videoPath: scans.find((scan) => scan.videoPath)?.videoPath,
    }
    const report = await this.generateReport(result, 'Full website check', 0)
    result.pdfPath = report.pdfPath
    result.htmlPath = report.htmlPath
    await this.persistScan(result, 'full-audit')
    return result
  }

  /**
   * Analyze pre-captured page content supplied by an external client (e.g. a browser
   * extension). Runs all 10 analyzers on the provided HTML/text without opening any
   * browser tab. Useful when the caller already has the live DOM (including auth state,
   * dynamic content, etc.) and just needs the dark-pattern analysis.
   */
  async analyzeProvidedContent(
    url: string,
    html: string,
    text = '',
    pageTitle = '',
  ): Promise<ScanResult> {
    const startedAt = new Date().toISOString()
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    let domain: string
    try {
      domain = new URL(url).hostname
    } catch {
      throw new Error(`Invalid URL: ${url}`)
    }

    const context: AnalyzerContext = {
      url,
      pageTitle,
      domSnapshot: html,
      visibleText: text,
      screenshotBase64: '',
      networkRequests: [],
      cookies: [],
    }

    this.assertPageNotBlocked(context)

    logger.info('Trusten analyzing provided content', { domain, scanId })

    const patterns = await this.mergeCachedFindings(
      url,
      await this.runAllAnalyzers(context),
    )
    const score = calculateScore(patterns)

    const result: ScanResult = {
      id: scanId,
      url,
      domain,
      scanType: 'quick',
      startedAt,
      completedAt: new Date().toISOString(),
      patterns,
      score,
    }

    await this.persistScan(result)
    return result
  }

  /**
   * Analyze the currently active page without navigation.
   * Injects a live annotation overlay onto the page showing all detected patterns.
   */
  async analyzeCurrentPage(): Promise<ScanResult & { overlayStatus: string }> {
    const startedAt = new Date().toISOString()
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    const activePage = await this.browser.getActivePage()
    if (!activePage) throw new Error('No active page found')

    const pageId = activePage.pageId
    const url = activePage.url

    logger.info('Trusten analyzing current page', { url, scanId })

    const context = await this.captureContext(pageId)
    const patterns = await this.mergeCachedFindings(
      url,
      await this.runAllAnalyzers(context),
    )
    const score = calculateScore(patterns)

    const result: ScanResult = {
      id: scanId,
      url,
      domain: new URL(url).hostname,
      scanType: 'quick',
      startedAt,
      completedAt: new Date().toISOString(),
      patterns,
      score,
    }

    // Persist so it shows up in the dashboard
    await this.persistScan(result)

    // Inject live annotation overlay onto the active page
    let overlayStatus = 'failed'
    try {
      overlayStatus = await this.injectPageAnnotations(pageId, result)
    } catch (err) {
      logger.warn('Trusten: failed to inject page annotations', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    return { ...result, overlayStatus }
  }

  /**
   * Inject a live annotation overlay onto the page, highlighting dark pattern locations.
   * Calling with an already-annotated page toggles the overlay off.
   * Returns the script's return value ('shown:N', 'hidden', or 'error:...').
   */
  async injectPageAnnotations(
    pageId: number,
    result: ScanResult,
  ): Promise<string> {
    const { buildLiveAnnotationScript } = await import('./report')
    const script = buildLiveAnnotationScript(
      result.patterns,
      result.score.grade,
      result.score.numeric,
      result.id,
    )
    const evalResult = await this.browser.evaluate(pageId, script)

    if (evalResult.error) {
      throw new Error(evalResult.error)
    }

    const status = String(evalResult.value ?? 'unknown')
    logger.info('Trusten: page annotations injected', {
      scanId: result.id,
      patterns: result.patterns.length,
      status,
    })
    return status
  }

  // ─── Internal helpers ───

  private async captureContext(pageId: number): Promise<AnalyzerContext> {
    const pages = await this.browser.listPages()
    const pageInfo = pages.find((p) => p.pageId === pageId)
    if (pageInfo?.httpStatus && pageInfo.httpStatus >= 400)
      throw new ScanIncompleteError(
        `Target page returned HTTP ${pageInfo.httpStatus}`,
        [401, 403, 429].includes(pageInfo.httpStatus)
          ? 'SITE_BLOCKED'
          : 'PAGE_LOAD_FAILED',
      )
    const url = pageInfo?.url ?? ''
    const pageTitle = pageInfo?.title ?? ''

    // Capture DOM snapshot
    let domSnapshot = ''
    try {
      const evalResult = await this.browser.evaluate(
        pageId,
        'document.documentElement.outerHTML',
      )
      domSnapshot = typeof evalResult.value === 'string' ? evalResult.value : ''
    } catch {
      logger.warn('Trusten: failed to capture DOM snapshot')
    }

    // Capture visible text via markdown conversion (more reliable than raw HTML)
    let visibleText = ''
    try {
      visibleText = await this.browser.contentAsMarkdown(pageId, {
        viewportOnly: false,
        includeLinks: false,
        includeImages: false,
      })
    } catch {
      // Fall back to extracting from DOM
      try {
        const text = await this.browser.evaluate(
          pageId,
          "document.body?.innerText || ''",
        )
        visibleText = typeof text.value === 'string' ? text.value : ''
      } catch {
        /* An unavailable DOM is not page evidence. */
      }
    }

    // Capture screenshot (data is already base64-encoded)
    let screenshotBase64 = ''
    try {
      const { data } = await this.browser.screenshot(pageId, {
        format: 'jpeg',
        quality: 70,
        fullPage: false,
      })
      screenshotBase64 = data
    } catch {
      logger.warn('Trusten: failed to capture screenshot')
    }

    // Capture cookies — prefer the driver (real httpOnly + third-party cookies),
    // fall back to document.cookie for drivers that don't expose them.
    let cookies: AnalyzerContext['cookies'] = []
    try {
      cookies = (await this.browser.getCookies?.(pageId)) ?? []
    } catch {
      /* fall through to JS */
    }
    if (cookies.length === 0) {
      try {
        const cookieEval = await this.browser.evaluate(
          pageId,
          `JSON.stringify(document.cookie.split(';').filter(Boolean).map(c => {
            const [name, ...rest] = c.trim().split('=')
            return { name: name.trim(), value: rest.join('='), domain: location.hostname, path: '/', secure: location.protocol === 'https:', httpOnly: false }
          }))`,
        )
        if (typeof cookieEval.value === 'string') {
          cookies = JSON.parse(cookieEval.value) as typeof cookies
        }
      } catch {
        // Non-fatal
      }
    }

    // Capture network requests observed during the page's lifetime.
    let networkRequests: AnalyzerContext['networkRequests'] = []
    try {
      networkRequests = (await this.browser.getNetworkRequests?.(pageId)) ?? []
    } catch {
      // Non-fatal
    }

    return {
      url,
      pageTitle,
      domSnapshot,
      visibleText,
      screenshotBase64,
      networkRequests,
      cookies,
    }
  }

  private assertUsableContext(context: AnalyzerContext): void {
    this.assertPageNotBlocked(context)
    if (!/^https?:\/\//i.test(context.url) || !context.screenshotBase64)
      throw new ScanIncompleteError(
        'Could not capture a usable page for this check. Please try again or check a different URL.',
      )
    if (
      !/<body[\s>]/i.test(context.domSnapshot) ||
      !context.visibleText
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
        .trim()
    )
      throw new ScanIncompleteError(
        'This page did not render readable content in time. Try again or check the loaded page with the Trusten Chrome extension.',
        'PAGE_NOT_READY',
      )
  }

  private assertPageNotBlocked(context: AnalyzerContext): void {
    if (
      isAccessChallengeUrl(context.url) ||
      (context.visibleText.length < 2500 &&
        /^(just a moment|access denied|security (check|verification)|verify (you are|you're) human|captcha|robot check)/i.test(
          context.pageTitle.trim(),
        ))
    )
      throw new ScanIncompleteError(
        'This website requires security verification and blocked the automated check. Finish the website verification in Chrome, then check the loaded page with the Trusten Chrome extension.',
        'SITE_BLOCKED',
      )
  }

  private async captureUsableContext(pageId: number): Promise<AnalyzerContext> {
    const deadline = Date.now() + 10000
    while (true) {
      const context = await this.captureContext(pageId)
      try {
        this.assertUsableContext(context)
        return context
      } catch (error) {
        if (
          !(error instanceof ScanIncompleteError) ||
          error.code !== 'PAGE_NOT_READY' ||
          Date.now() >= deadline
        )
          throw error
        await sleep(500)
      }
    }
  }

  private async runAllAnalyzers(
    context: AnalyzerContext,
  ): Promise<DetectedPattern[]> {
    return this.runAnalyzers(ALL_ANALYZERS, context)
  }

  /**
   * Merge in cached deep-scan findings for this page (if a recent audit covered
   * it), deduped against the live findings. Lets a Quick Scan on a page the user
   * is actively browsing surface the richer patterns a full audit already found.
   */
  private async mergeCachedFindings(
    url: string,
    live: DetectedPattern[],
  ): Promise<DetectedPattern[]> {
    try {
      const cached = await this.store.getCachedPageFindings(
        normalizeUrlKey(url),
      )
      if (!cached || cached.patterns.length === 0) return live
      const key = (p: DetectedPattern) =>
        `${p.category}|${p.element?.selector ?? ''}|${p.description}`
      const seen = new Set(live.map(key))
      // Older advertising detectors matched ordinary classes such as
      // "page-header". Require the current detector to support each cached
      // ad's saved evidence, rather than undoing a clean live scan with an
      // obsolete claim. Other deep-journey findings keep their usual cache path.
      const adAnalyzer = getAnalyzers(['NaggingAnalyzer'])[0]
      const validated = await Promise.all(
        cached.patterns.map(async (pattern) => {
          if (pattern.category !== 'disguised_ads') return pattern
          const elementHtml = pattern.element?.html?.trim() || ''
          const html = [pattern.evidence?.domSnapshot, elementHtml].find(
            (source) =>
              typeof source === 'string' && /<[a-z][^>]*>/i.test(source),
          )
          if (!html || !adAnalyzer) return null
          const result = await adAnalyzer.analyze({
            url: pattern.url || url,
            pageTitle: pattern.pageTitle || '',
            domSnapshot: html,
            visibleText: '',
            screenshotBase64: '',
            networkRequests: [],
            cookies: [],
          })
          return result.patterns.some(
            (candidate) =>
              candidate.category === 'disguised_ads' &&
              (!elementHtml ||
                (
                  candidate.evidence?.domSnapshot ||
                  candidate.element?.html ||
                  ''
                ).includes(elementHtml)),
          )
            ? pattern
            : null
        }),
      )
      const extra = validated
        .filter((p): p is DetectedPattern => p !== null)
        .filter((p) => !seen.has(key(p)))
        .map((p) => ({
          ...p,
          source: 'deep-cache' as const,
          cachedAt: cached.cachedAt,
        }))
      if (extra.length > 0) {
        logger.info('Trusten merged cached deep-scan findings', {
          url,
          added: extra.length,
        })
      }
      return [...live, ...extra]
    } catch (err) {
      logger.warn('Trusten: cache merge failed', { error: String(err) })
      return live
    }
  }

  private async runAnalyzers(
    analyzers: BaseAnalyzer[],
    context: AnalyzerContext,
    onResult?: (analyzer: BaseAnalyzer, result: AnalyzerResult) => void,
  ): Promise<DetectedPattern[]> {
    const results = await Promise.allSettled(
      analyzers.map((analyzer) =>
        analyzer.analyze(context).catch((err) => {
          logger.warn(`Trusten analyzer ${analyzer.name} failed`, {
            error: err instanceof Error ? err.message : String(err),
          })
          return {
            patterns: [],
            metadata: { visualCheckAvailable: false },
          } satisfies AnalyzerResult
        }),
      ),
    )

    const patterns: DetectedPattern[] = []
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        onResult?.(analyzers[index], result.value)
        patterns.push(...result.value.patterns)
      }
    }

    return patterns
  }

  private async generateReport(
    result: ScanResult,
    workflowName: string,
    _pageId: number,
  ): Promise<{ pdfPath: string; htmlPath: string }> {
    const [fs, path, { generateReportHtml }] = await Promise.all([
      import('node:fs'),
      import('node:path'),
      import('./report'),
    ])

    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true })
    }

    const slug = result.id.replace(/[^a-z0-9-]/gi, '-')
    const htmlPath = path.join(this.reportsDir, `${slug}.html`)
    const pdfPath = path.join(this.reportsDir, `${slug}.pdf`)

    // Write the HTML report
    const reportSteps = result.workflowSteps?.map((step) => {
      if (!step.screenshotPath) return step
      try {
        return {
          ...step,
          screenshot: fs.readFileSync(step.screenshotPath).toString('base64'),
        }
      } catch (err) {
        logger.warn('Trusten: report screenshot unavailable', {
          path: step.screenshotPath,
          error: String(err),
        })
        return { ...step, screenshot: '' }
      }
    })
    const html = generateReportHtml(
      { ...result, workflowSteps: reportSteps },
      workflowName,
    )
    fs.writeFileSync(htmlPath, html, 'utf8')

    // Generate PDF by opening the HTML file in a hidden page and printing
    let pdfPageId: number | null = null
    try {
      const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`
      pdfPageId = await this.browser.newPage(fileUrl, { background: true })
      await sleep(1500) // Let the page render

      const pdfResult = await this.browser.printToPDF(pdfPageId, {
        landscape: false,
        printBackground: true,
      })

      fs.writeFileSync(pdfPath, Buffer.from(pdfResult.data, 'base64'))
      logger.info('Trusten report saved', { htmlPath, pdfPath })
    } catch (err) {
      logger.warn('Trusten: PDF generation failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return { pdfPath: '', htmlPath }
    } finally {
      if (pdfPageId !== null) {
        await this.browser.closePage(pdfPageId).catch(() => undefined)
      }
    }

    return { pdfPath, htmlPath }
  }

  private async persistScan(
    result: ScanResult,
    workflowId?: string,
  ): Promise<void> {
    await this.store.saveScan(result, {
      workflowId,
      pdfPath: result.pdfPath ?? undefined,
      htmlPath: result.htmlPath ?? undefined,
      videoPath: result.videoPath ?? undefined,
    })
  }

  /**
   * Annotate the page with bounding boxes, screenshot it, and save the JPEG.
   * Annotation and the capture itself are both best-effort: a failure yields an
   * empty screenshot rather than aborting the scan. The overlay is always
   * cleaned up afterwards.
   */
  private async captureStepScreenshot(
    pageId: number,
    screenshotDir: string,
    stepNumber: number,
    totalSteps: number,
    instruction: string,
    patterns: DetectedPattern[],
  ): Promise<{ screenshotB64: string; screenshotPath: string }> {
    const { buildAnnotationScript, buildCleanupScript } = await import(
      './report'
    )
    const [fs, path] = await Promise.all([
      import('node:fs'),
      import('node:path'),
    ])

    try {
      await this.browser.evaluate(
        pageId,
        buildAnnotationScript(stepNumber, totalSteps, instruction, patterns),
      )
      await sleep(300)
    } catch {
      /* annotation is best-effort — still capture the raw page */
    }

    try {
      const { data } = await this.browser.screenshot(pageId, {
        format: 'jpeg',
        quality: 82,
        fullPage: false,
      })
      const screenshotFile = path.join(screenshotDir, `step-${stepNumber}.jpg`)
      fs.writeFileSync(screenshotFile, Buffer.from(data, 'base64'))
      return { screenshotB64: data, screenshotPath: screenshotFile }
    } catch {
      return { screenshotB64: '', screenshotPath: '' }
    } finally {
      await this.browser
        .evaluate(pageId, buildCleanupScript())
        .catch(() => undefined)
    }
  }

  /**
   * Execute the navigation actions for a workflow step:
   * 1. Navigate to a URL if specified
   * 2. Fill the search box if specified
   * 3. Click the first matching link/button text
   */
  private async executeStepNavigation(
    pageId: number,
    stepDef: import('./types').WorkflowStepDefinition,
    baseUrl: string,
  ): Promise<boolean> {
    let actionPerformed = false
    // 1. Navigate to explicit URL
    if (stepDef.navigate) {
      const target = new URL(
        stepDef.navigate.replace('{baseUrl}', baseUrl),
        baseUrl,
      ).href
      try {
        await this.browser.goto(pageId, target)
        actionPerformed = true
        await this.waitForPageLoad(pageId)
      } catch (err) {
        logger.warn('Trusten: navigate failed', { target, error: String(err) })
      }
    }

    // 2. Fill the main search box
    if (stepDef.fillSearch) {
      const query = JSON.stringify(stepDef.fillSearch)
      // Step 1: try to reveal a hidden search input by clicking search icons/buttons
      const revealScript = `(function() {
        const triggers = [...document.querySelectorAll(
          '[class*="search-icon"], [class*="search-btn"], [class*="searchbtn"], [aria-label*="search" i][role="button"], button[class*="search"], [class*="search-trigger"]'
        )].filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        if (triggers.length > 0) { triggers[0].click(); return true; }
        return false;
      })()`
      try {
        await this.browser.evaluate(pageId, revealScript)
      } catch {
        /* ignore */
      }
      await sleep(400)

      // Step 2: fill the input
      const fillScript = `(function() {
        const selectors = [
          'input[type="search"]',
          'input[name="search"]',
          'input[name="q"]',
          'input[name="keyword"]',
          'input[placeholder*="search" i]',
          'input[aria-label*="search" i]',
          'input[id*="search" i]',
          'input[class*="search" i]',
          '[role="searchbox"] input',
          '[role="searchbox"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            el.focus();
            try {
              const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
              if (nativeSet && nativeSet.set) nativeSet.set.call(el, ${query});
              else el.value = ${query};
            } catch(_) { el.value = ${query}; }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
            const form = el.closest('form');
            if (form) { try { form.requestSubmit(); } catch(_) {} }
            return true;
          }
        }
        return false;
      })()`
      try {
        const fillResult = await this.browser.evaluate(pageId, fillScript)
        if (fillResult.value === true) {
          actionPerformed = true
          logger.info('Trusten: filled search', { query: stepDef.fillSearch })
        } else {
          logger.warn('Trusten: no search input found', {
            query: stepDef.fillSearch,
          })
        }
        await this.waitForPageLoad(pageId)
      } catch (err) {
        logger.warn('Trusten: fillSearch failed', {
          query: stepDef.fillSearch,
          error: String(err),
        })
      }
    }

    // 2b. Click the first prominent content result/product link (no fixed text).
    if (stepDef.clickFirst) {
      const clickFirstScript = `(function(){
        function inChrome(el){ return !!el.closest('header,nav,footer,[role="navigation"],[role="banner"],[role="contentinfo"]'); }
        var root = document.querySelector('main,[role="main"],#content,.content,.products,.product_pod') || document.body;
        var links = Array.prototype.slice.call(root.querySelectorAll('a[href]')).filter(function(a){
          var r=a.getBoundingClientRect();
          if(r.width<8||r.height<8) return false;
          var href=a.getAttribute('href')||'';
          if(!href||href.charAt(0)==='#'||href.indexOf('javascript')===0||href.indexOf('mailto')===0) return false;
          try { var target = new URL(href, location.href); if(target.origin !== location.origin) return false; } catch(_) { return false; }
          return !inChrome(a);
        });
        var scored = links.map(function(a){
          var s=0;
          if(a.querySelector('img')) s+=2;
          if(a.querySelector('h1,h2,h3,h4')) s+=2;
          if(a.closest('[class*="product"],[class*="result"],[class*="item"],[class*="card"],li')) s+=1;
          if((a.textContent||'').trim().length>3) s+=1;
          return {a:a,s:s,top:a.getBoundingClientRect().top};
        });
        scored.sort(function(x,y){ return (y.s-x.s)||(x.top-y.top); });
        var pick = scored[0];
        if(pick && pick.a){ pick.a.removeAttribute('target'); pick.a.click(); return (pick.a.textContent||'').trim().slice(0,60) || (pick.a.getAttribute('href')||true); }
        return false;
      })()`
      try {
        const result = await this.browser.evaluate(pageId, clickFirstScript)
        if (result.value === true || typeof result.value === 'string') {
          actionPerformed = true
          logger.info('Trusten: clicked first result', {
            matched: result.value,
          })
          await this.waitForPageLoad(pageId)
        } else {
          logger.warn('Trusten: clickFirst found no content link')
        }
      } catch (err) {
        logger.warn('Trusten: clickFirst failed', { error: String(err) })
      }
    }

    // 3. Click by text — try each candidate in order, stop on first hit
    const candidates = stepDef.clickText ?? []
    if (
      candidates.length === 0 &&
      !stepDef.fillSearch &&
      !stepDef.navigate &&
      !stepDef.clickFirst
    )
      return actionPerformed
    if (candidates.length === 0) return actionPerformed

    for (const text of candidates) {
      const escaped = JSON.stringify(text.toLowerCase())
      const script = `(function() {
        const lc = ${escaped};
        const all = [...document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"], label')];
        // Prefer visible, clickable elements
        const visible = all.filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const label = el => (el.getAttribute('aria-label') || el.textContent || el.value || '').toLowerCase().trim();
        const matches = visible.filter(el => !el.disabled && label(el).includes(lc));
        matches.sort((a, b) => Number(label(b) === lc) - Number(label(a) === lc) || label(a).length - label(b).length);
        const match = matches[0];
        if (match && /place order|pay now|confirm (purchase|payment|cancellation|deletion)|complete purchase|delete account|cancel subscription|cancel membership/i.test(label(match))) return false;
        if (match && match.closest('form') && match.closest('form').querySelector('input[autocomplete^="cc-"],input[name*="card" i],input[type="password"]')) return false;
        if (match) { match.removeAttribute('target'); match.click(); return match.textContent?.trim().slice(0, 60) || true; }
        return false;
      })()`
      try {
        const result = await this.browser.evaluate(pageId, script)
        if (result.value === true || typeof result.value === 'string') {
          actionPerformed = true
          logger.info('Trusten: clicked element', {
            text,
            matched: result.value,
          })
          await this.waitForPageLoad(pageId)
          break
        }
      } catch (err) {
        logger.warn('Trusten: click failed', { text, error: String(err) })
      }
    }
    return actionPerformed
  }

  private async waitForPageLoad(pageId: number): Promise<void> {
    // Poll readyState via evaluate; browser.goto already handles this for navigation
    // but newPage may arrive before the page fully loads
    await sleep(1500)

    try {
      await this.browser.waitFor(pageId, {
        selector: 'body',
        timeout: 10_000,
      })
    } catch {
      // Non-fatal — proceed with whatever content is available
    }
  }
}
