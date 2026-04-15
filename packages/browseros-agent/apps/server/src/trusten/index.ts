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

import type { Browser } from '../browser/browser'
import { logger } from '../lib/logger'
import { navigateWithAI } from './agent/navigator'
import type { BaseAnalyzer } from './analyzers/base-analyzer'
import { ComparisonPreventionAnalyzer } from './analyzers/comparison-prevention'
import { ForcedActionAnalyzer } from './analyzers/forced-action'
import { InterfaceManipulationAnalyzer } from './analyzers/interface-manipulation'
import { MisdirectionAnalyzer } from './analyzers/misdirection'
import { NaggingAnalyzer } from './analyzers/nagging'
import { ObstructionAnalyzer } from './analyzers/obstruction'
import { PreselectionAnalyzer } from './analyzers/preselection'
import { PrivacyAnalyzer } from './analyzers/privacy'
import { SneakingAnalyzer } from './analyzers/sneaking'
import { UrgencyScarcityAnalyzer } from './analyzers/urgency-scarcity'
import { VisualAnalyzer } from './analyzers/visual'
import { calculateScore } from './scoring/engine'
import type {
  AnalyzerContext,
  AnalyzerResult,
  DetectedPattern,
  ScanResult,
  ScanWorkflow,
  WorkflowStep,
} from './types'

// ─── All analyzers ───

const ALL_ANALYZERS: BaseAnalyzer[] = [
  new UrgencyScarcityAnalyzer(),
  new MisdirectionAnalyzer(),
  new SneakingAnalyzer(),
  new ObstructionAnalyzer(),
  new ForcedActionAnalyzer(),
  new PreselectionAnalyzer(),
  new NaggingAnalyzer(),
  new ComparisonPreventionAnalyzer(),
  new PrivacyAnalyzer(),
  new InterfaceManipulationAnalyzer(),
  new VisualAnalyzer(),
]

// Map of analyzer name → instance, for workflow-targeted execution
const ANALYZER_BY_NAME = new Map<string, BaseAnalyzer>(
  ALL_ANALYZERS.map((a) => [a.name, a]),
)

// ─── Orchestrator ───

export class TrustenEngine {
  private browser: Browser
  private reportsDir: string

  constructor(browser: Browser, executionDir?: string) {
    this.browser = browser
    // Save reports to Desktop so they're always easily findable,
    // regardless of which directory the binary happens to be running from.
    const home =
      process.env.USERPROFILE ??
      process.env.HOME ??
      executionDir ??
      process.cwd()
    this.reportsDir = `${home}/Desktop/trusten-reports`
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

      const context = await this.captureContext(pageId)
      const patterns = await this.runAllAnalyzers(context)
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

      // Persist quick scans too so the dashboard can show them
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
  async deepScan(url: string, workflow: ScanWorkflow): Promise<ScanResult> {
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
      const [
        { buildAnnotationScript, buildCleanupScript },
        {
          dismissCookieBanners,
          dismissInterferingModals,
          generateFakeProfile,
          resolveGoalTemplate,
        },
      ] = await Promise.all([import('./report'), import('./utils/pre-scan')])

      pageId = await this.browser.newPage(url, { background: true })
      const pid = pageId
      await this.waitForPageLoad(pid)

      // ── Pre-flight: dismiss cookie banners and interfering modals ──────
      const fakeProfile = generateFakeProfile()
      const cookieStatus = await dismissCookieBanners(this.browser, pid)
      if (cookieStatus !== 'no-banner')
        await new Promise((r) => setTimeout(r, 600))
      const modalsDismissed = await dismissInterferingModals(this.browser, pid)
      if (modalsDismissed > 0) await new Promise((r) => setTimeout(r, 600))
      logger.info('Trusten pre-flight complete', {
        cookieStatus,
        modalsDismissed,
      })

      // Create screenshot directory for this scan
      const screenshotDir = `${this.reportsDir}/screenshots/${scanId}`
      const [fs, path] = await Promise.all([
        import('node:fs'),
        import('node:path'),
      ])
      fs.mkdirSync(screenshotDir, { recursive: true })

      for (let i = 0; i < workflow.steps.length; i++) {
        const stepDef = workflow.steps[i]
        const stepNumber = i + 1

        logger.info(
          `Trusten step ${stepNumber}/${workflow.steps.length}: ${stepDef.instruction.slice(0, 80)}`,
        )

        // ── AI-driven navigation (primary) ──────────────────────────────
        if (stepDef.aiGoal) {
          // Resolve {{template}} variables (e.g. {{email}}, {{password}}) so
          // signup steps receive real fake credentials at runtime.
          const resolvedGoal = resolveGoalTemplate(stepDef.aiGoal, fakeProfile)
          const navResult = await navigateWithAI(
            this.browser,
            pid,
            resolvedGoal,
            Math.min(Math.floor(stepDef.timeout / 4), 10),
          )
          logger.info(`Trusten step ${stepNumber} navigation result`, {
            success: navResult.success,
            steps: navResult.stepsExecuted,
            url: navResult.finalUrl,
            reason: navResult.reason.slice(0, 80),
          })
        } else {
          // ── Fallback: deterministic navigation ───────────────────────
          await this.executeStepNavigation(pid, stepDef, url)
        }

        // Allow page to settle after navigation
        await new Promise((r) => setTimeout(r, 800))

        const context = await this.captureContext(pid)

        const targetAnalyzers = stepDef.analyzersToRun
          .map((name) => ANALYZER_BY_NAME.get(name))
          .filter((a): a is BaseAnalyzer => a !== undefined)

        const stepPatterns = await this.runAnalyzers(targetAnalyzers, context)
        allPatterns.push(...stepPatterns)

        const pages = await this.browser.listPages()
        const currentUrl = pages.find((p) => p.pageId === pid)?.url ?? url

        // ── Screenshot: annotate then save to file ───────────────────────
        let screenshotB64 = ''
        let screenshotPath = ''
        try {
          await this.browser.evaluate(
            pid,
            buildAnnotationScript(
              stepNumber,
              workflow.steps.length,
              stepDef.instruction,
              stepPatterns,
            ),
          )
          await new Promise((r) => setTimeout(r, 300))
          const { data } = await this.browser.screenshot(pid, {
            format: 'jpeg',
            quality: 82,
            fullPage: false,
          })
          screenshotB64 = data
          // Save screenshot to file so the dashboard can serve it
          const screenshotFile = path.join(
            screenshotDir,
            `step-${stepNumber}.jpg`,
          )
          fs.writeFileSync(screenshotFile, Buffer.from(screenshotB64, 'base64'))
          screenshotPath = screenshotFile
        } catch {
          try {
            const { data } = await this.browser.screenshot(pid, {
              format: 'jpeg',
              quality: 82,
              fullPage: false,
            })
            screenshotB64 = data
            const screenshotFile = path.join(
              screenshotDir,
              `step-${stepNumber}.jpg`,
            )
            fs.writeFileSync(
              screenshotFile,
              Buffer.from(screenshotB64, 'base64'),
            )
            screenshotPath = screenshotFile
          } catch {
            /* non-fatal */
          }
        } finally {
          await this.browser
            .evaluate(pid, buildCleanupScript())
            .catch(() => undefined)
        }

        workflowSteps.push({
          stepNumber,
          action: stepDef.instruction,
          url: currentUrl,
          screenshot: screenshotB64,
          screenshotPath,
          patternsFound: stepPatterns,
          timestamp: new Date().toISOString(),
        } as WorkflowStep & { screenshotPath: string })

        logger.info(`Trusten step ${stepNumber} done`, {
          patternsFound: stepPatterns.length,
          url: currentUrl,
          navigated: currentUrl !== url,
        })
      }

      const score = calculateScore(allPatterns)
      const completedAt = new Date().toISOString()

      const result: ScanResult = {
        id: scanId,
        url,
        domain: new URL(url).hostname,
        scanType: 'deep',
        startedAt,
        completedAt,
        patterns: allPatterns,
        score,
        workflowSteps,
      }

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

    logger.info('Trusten analyzing provided content', { domain, scanId })

    const patterns = await this.runAllAnalyzers(context)
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
    const patterns = await this.runAllAnalyzers(context)
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
      visibleText = domSnapshot
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
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

    // Capture cookies via JS (CDP Network.getAllCookies requires extra setup)
    const cookies: AnalyzerContext['cookies'] = []
    try {
      const cookieEval = await this.browser.evaluate(
        pageId,
        `JSON.stringify(document.cookie.split(';').filter(Boolean).map(c => {
          const [name, ...rest] = c.trim().split('=')
          return { name: name.trim(), value: rest.join('='), domain: location.hostname, path: '/', secure: location.protocol === 'https:', httpOnly: false }
        }))`,
      )
      if (typeof cookieEval.value === 'string') {
        const parsed = JSON.parse(cookieEval.value) as typeof cookies
        cookies.push(...parsed)
      }
    } catch {
      // Non-fatal
    }

    return {
      url,
      pageTitle,
      domSnapshot,
      visibleText,
      screenshotBase64,
      networkRequests: [], // Network capturing requires CDP Network enable — future enhancement
      cookies,
    }
  }

  private async runAllAnalyzers(
    context: AnalyzerContext,
  ): Promise<DetectedPattern[]> {
    return this.runAnalyzers(ALL_ANALYZERS, context)
  }

  private async runAnalyzers(
    analyzers: BaseAnalyzer[],
    context: AnalyzerContext,
  ): Promise<DetectedPattern[]> {
    const results = await Promise.allSettled(
      analyzers.map((analyzer) =>
        analyzer.analyze(context).catch((err) => {
          logger.warn(`Trusten analyzer ${analyzer.name} failed`, {
            error: err instanceof Error ? err.message : String(err),
          })
          return { patterns: [] } satisfies AnalyzerResult
        }),
      ),
    )

    const patterns: DetectedPattern[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        patterns.push(...result.value.patterns)
      }
    }

    return patterns
  }

  private async generateReport(
    result: ScanResult,
    workflowName: string,
    pageId: number,
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
    const html = generateReportHtml(result, workflowName)
    fs.writeFileSync(htmlPath, html, 'utf8')

    // Generate PDF by opening the HTML file in a hidden page and printing
    let pdfPageId: number | null = null
    try {
      const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`
      pdfPageId = await this.browser.newPage(fileUrl, { background: true })
      await new Promise((r) => setTimeout(r, 1500)) // Let the page render

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
    try {
      const { saveTrustenScan } = await import('./db')
      saveTrustenScan(result, {
        workflowId,
        pdfPath: result.pdfPath,
        htmlPath: result.htmlPath,
      })
    } catch (err) {
      logger.warn('Trusten: failed to persist scan', {
        error: err instanceof Error ? err.message : String(err),
      })
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
  ): Promise<void> {
    // 1. Navigate to explicit URL
    if (stepDef.navigate) {
      const target = stepDef.navigate.startsWith('http')
        ? stepDef.navigate
        : stepDef.navigate.replace('{baseUrl}', baseUrl)
      try {
        await this.browser.goto(pageId, target)
        await this.waitForPageLoad(pageId)
      } catch (err) {
        logger.warn('Trusten: navigate failed', { target, error: String(err) })
      }
    }

    // 2. Fill the main search box
    if (stepDef.fillSearch) {
      const query = stepDef.fillSearch
        .replace(/'/g, "\\'")
        .replace(/\\/g, '\\\\')
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
      await new Promise((r) => setTimeout(r, 400))

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
              if (nativeSet && nativeSet.set) nativeSet.set.call(el, '${query}');
              else el.value = '${query}';
            } catch(_) { el.value = '${query}'; }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
            const form = el.closest('form');
            if (form) { try { form.submit(); } catch(_) {} }
            return true;
          }
        }
        return false;
      })()`
      try {
        const fillResult = await this.browser.evaluate(pageId, fillScript)
        if (fillResult.value === true) {
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

    // 3. Click by text — try each candidate in order, stop on first hit
    const candidates = stepDef.clickText ?? []
    if (candidates.length === 0 && !stepDef.fillSearch && !stepDef.navigate)
      return
    if (candidates.length === 0) return

    for (const text of candidates) {
      const escaped = text.replace(/'/g, "\\'").replace(/\\/g, '\\\\')
      const script = `(function() {
        const lc = '${escaped}'.toLowerCase();
        const all = [...document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"], label')];
        // Prefer visible, clickable elements
        const visible = all.filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const match = visible.find(el => (el.textContent?.toLowerCase().trim().includes(lc)) || (el.value?.toLowerCase().includes(lc)));
        if (match) { match.click(); return match.textContent?.trim().slice(0, 60) || true; }
        return false;
      })()`
      try {
        const result = await this.browser.evaluate(pageId, script)
        if (result.value !== false && result.value !== null) {
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
  }

  private async waitForPageLoad(pageId: number): Promise<void> {
    // Poll readyState via evaluate; browser.goto already handles this for navigation
    // but newPage may arrive before the page fully loads
    await new Promise((r) => setTimeout(r, 1500))

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
