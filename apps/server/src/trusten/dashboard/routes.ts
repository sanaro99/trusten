/**
 * Trusten Dashboard — Hono Route Handlers
 *
 * Serves the Trusten web dashboard at /trusten/*
 * Provides JSON APIs for scan submission and status polling.
 */

import { Hono } from 'hono'
import { logger } from '../../lib/logger'
import { discoverWorkflows } from '../agent/discovery'
import type { BrowserDriver } from '../browser/driver'
import {
  createAuditJob,
  getAuditJob,
  getDomainSummaries,
  getDomainSummary,
  getGlobalStats,
  getTrustenScanById,
  getTrustenScanHistory,
  getTrustenScansByDomain,
  updateAuditJob,
} from '../db'
import { TrustenEngine } from '../index'
import { closeChannel, publish } from '../live/hub'
import type { ScanWorkflow } from '../types'
import { checkRateLimit, isAllowedByRobots } from '../utils/guardrails'
import { WORKFLOW_REGISTRY } from '../workflows/definitions'
import {
  auditPage,
  domainPage,
  historyPage,
  homePage,
  leaderboardPage,
  scanPage,
} from './ui'

interface Config {
  browser: BrowserDriver
  executionDir: string
}

// In-memory tracking of running audit jobs (job progress)
const runningJobs = new Map<
  string,
  { currentStep: string; completedWorkflows: string[] }
>()

/** robots.txt + per-domain rate-limit gate. Returns an error to send, or null. */
async function preScanGuard(
  url: string,
  domain: string,
): Promise<{ error: string; status: 403 | 429 } | null> {
  if (process.env.TRUSTEN_IGNORE_ROBOTS !== '1') {
    const allowed = await isAllowedByRobots(url).catch(() => true)
    if (!allowed) {
      return {
        error: "Scanning this URL is disallowed by the site's robots.txt",
        status: 403,
      }
    }
  }
  if (!checkRateLimit(domain)) {
    return {
      error: 'Rate limit: max 1 scan per domain per minute — try again shortly',
      status: 429,
    }
  }
  return null
}

export function createTrustenDashboardRoutes(config: Config) {
  const app = new Hono()

  // ─── HTML Pages ───

  app.get('/', (c) => {
    const stats = getGlobalStats()
    const recent = getTrustenScanHistory(20)
    const domains = getDomainSummaries(20)
    return c.html(homePage(stats, recent, domains))
  })

  app.get('/audit', (c) => {
    const prefill = c.req.query('url') ?? ''
    return c.html(auditPage(prefill))
  })

  app.get('/history', (c) => {
    const scans = getTrustenScanHistory(100)
    return c.html(historyPage(scans))
  })

  app.get('/leaderboard', (c) => {
    const domains = getDomainSummaries(100)
    return c.html(leaderboardPage(domains))
  })

  app.get('/site/:domain', (c) => {
    const domain = c.req.param('domain')
    const summary = getDomainSummary(domain)
    const scans = getTrustenScansByDomain(domain, 50)
    return c.html(domainPage(domain, summary, scans))
  })

  app.get('/scan/:id', (c) => {
    const id = c.req.param('id')
    const scan = getTrustenScanById(id)
    return c.html(scanPage(scan, id))
  })

  // Step screenshot — served directly from the saved file
  app.get('/report/:id/screenshot/:step', async (c) => {
    const id = c.req.param('id')
    const step = Number(c.req.param('step'))
    const scan = getTrustenScanById(id)

    const wfStep = scan?.workflowSteps?.find((s) => s.stepNumber === step) as
      | { screenshotPath?: string; stepNumber: number }
      | undefined

    const filePath = wfStep?.screenshotPath

    if (!filePath) {
      // Try standard path pattern as fallback
      const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
      const guessPath = `${home}/Desktop/trusten-reports/screenshots/${id}/step-${step}.jpg`
      try {
        const fs = await import('node:fs')
        const data = fs.readFileSync(guessPath)
        return new Response(data, {
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
          },
        })
      } catch {
        return c.text('Screenshot not found', 404)
      }
    }

    try {
      const fs = await import('node:fs')
      const data = fs.readFileSync(filePath)
      return new Response(data, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
        },
      })
    } catch {
      return c.text('Screenshot file not accessible', 404)
    }
  })

  // Session video — stream the recorded .webm from filesystem
  app.get('/report/:id/video', async (c) => {
    const id = c.req.param('id')
    const scan = getTrustenScanById(id)
    if (!scan?.videoPath) {
      return c.text('Video not found', 404)
    }
    try {
      const fs = await import('node:fs')
      const data = fs.readFileSync(scan.videoPath)
      return new Response(data, {
        headers: {
          'Content-Type': 'video/mp4',
          'Cache-Control': 'public, max-age=86400',
        },
      })
    } catch {
      return c.text('Video file not accessible', 404)
    }
  })

  // PDF download — serve from filesystem
  app.get('/report/:id/pdf', async (c) => {
    const id = c.req.param('id')
    const scan = getTrustenScanById(id)
    if (!scan?.pdfPath) {
      return c.text('PDF not found', 404)
    }
    try {
      const fs = await import('node:fs')
      const data = fs.readFileSync(scan.pdfPath)
      return new Response(data, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="trusten-${id}.pdf"`,
        },
      })
    } catch {
      return c.text('PDF file not accessible', 404)
    }
  })

  // ─── JSON APIs ───

  // Analyze pre-captured content — accepts HTML/text from a browser extension or any client.
  // Does not navigate to the URL; runs analyzers on the supplied content directly.
  app.post('/api/analyze-page', async (c) => {
    let url: string, html: string, text: string, pageTitle: string
    try {
      const body = await c.req.json<{
        url: string
        html: string
        text?: string
        pageTitle?: string
      }>()
      url = body.url?.trim()
      html = body.html ?? ''
      text = body.text ?? ''
      pageTitle = body.pageTitle ?? ''
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    if (!url) return c.json({ error: 'url is required' }, 400)
    if (!html) return c.json({ error: 'html is required' }, 400)

    try {
      new URL(url)
    } catch {
      return c.json({ error: 'Invalid URL' }, 400)
    }

    try {
      const engine = new TrustenEngine(config.browser, config.executionDir)
      const result = await engine.analyzeProvidedContent(
        url,
        html,
        text,
        pageTitle,
      )
      return c.json({
        scanId: result.id,
        domain: result.domain,
        grade: result.score.grade,
        score: result.score.numeric,
        patternCount: result.patterns.length,
        summary: result.score.summary,
        categoryBreakdown: result.score.categoryBreakdown,
        patterns: result.patterns,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('Trusten analyze-page failed', { url, error: msg })
      return c.json({ error: msg }, 500)
    }
  })

  // Quick scan — runs immediately, returns scan ID
  app.post('/api/quick-scan', async (c) => {
    let url: string
    try {
      const body = await c.req.json<{ url: string }>()
      url = body.url?.trim()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    if (!url) return c.json({ error: 'url is required' }, 400)

    let qsDomain: string
    try {
      qsDomain = new URL(url).hostname
    } catch {
      return c.json({ error: 'Invalid URL' }, 400)
    }

    const qsGuard = await preScanGuard(url, qsDomain)
    if (qsGuard) return c.json({ error: qsGuard.error }, qsGuard.status)

    try {
      const engine = new TrustenEngine(config.browser, config.executionDir)
      const result = await engine.quickScan(url)
      return c.json({
        scanId: result.id,
        domain: result.domain,
        grade: result.score.grade,
        score: result.score.numeric,
        patterns: result.patterns.length,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('Trusten dashboard quick-scan failed', { url, error: msg })
      return c.json({ error: msg }, 500)
    }
  })

  // Start a full multi-workflow audit (async)
  app.post('/api/audit', async (c) => {
    let url: string
    let workflows: string[]
    let watch = false
    let mode: 'fixed' | 'discover' = 'fixed'
    try {
      const body = await c.req.json<{
        url: string
        workflows?: string[]
        watch?: boolean
        mode?: 'fixed' | 'discover'
      }>()
      url = body.url?.trim()
      workflows = body.workflows ?? Object.keys(WORKFLOW_REGISTRY)
      watch = body.watch === true
      mode = body.mode === 'discover' ? 'discover' : 'fixed'
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    if (!url) return c.json({ error: 'url is required' }, 400)

    let domain: string
    try {
      domain = new URL(url).hostname
    } catch {
      return c.json({ error: 'Invalid URL' }, 400)
    }

    // In discover mode the workflows are generated at run time, so skip the
    // fixed-workflow validation.
    const validWorkflows =
      mode === 'discover' ? [] : workflows.filter((w) => WORKFLOW_REGISTRY[w])
    if (mode === 'fixed' && validWorkflows.length === 0) {
      return c.json({ error: 'No valid workflows selected' }, 400)
    }

    const guard = await preScanGuard(url, domain)
    if (guard) return c.json({ error: guard.error }, guard.status)

    const jobId = createAuditJob(url, domain, validWorkflows)
    runningJobs.set(jobId, { currentStep: 'queued', completedWorkflows: [] })

    // Run async in the background — do not await
    runAuditJob(jobId, url, domain, validWorkflows, config, {
      watch,
      mode,
    }).catch((err) => {
      logger.error('Trusten audit job crashed', { jobId, error: String(err) })
    })

    return c.json({ jobId, domain })
  })

  // Poll audit job status
  app.get('/api/audit/:jobId', (c) => {
    const jobId = c.req.param('jobId')
    const progress = runningJobs.get(jobId)
    const job = getAuditJob(jobId)

    if (!job) return c.json({ error: 'Job not found' }, 404)

    return c.json({
      jobId: job.id,
      status: job.status,
      domain: job.domain,
      workflows: job.workflows,
      completedWorkflows: progress?.completedWorkflows ?? [],
      currentStep: progress?.currentStep ?? job.status,
      scanIds: job.scanIds,
      error: job.error,
      plan: job.plan,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    })
  })

  // JSON stats
  app.get('/api/stats', (c) => {
    return c.json(getGlobalStats())
  })

  // JSON domain summary
  app.get('/api/domain/:domain', (c) => {
    const domain = c.req.param('domain')
    const summary = getDomainSummary(domain)
    const scans = getTrustenScansByDomain(domain, 20)
    return c.json({ domain, summary, scans })
  })

  // JSON scan detail
  app.get('/api/scan/:id', (c) => {
    const id = c.req.param('id')
    const scan = getTrustenScanById(id)
    if (!scan) return c.json({ error: 'Not found' }, 404)
    return c.json(scan)
  })

  // JSON scan history
  app.get('/api/history', (c) => {
    const limit = Number(c.req.query('limit') ?? '50')
    const scans = getTrustenScanHistory(Math.min(limit, 200))
    return c.json({ scans, total: scans.length })
  })

  return app
}

// ─── Background audit runner ───

async function runAuditJob(
  jobId: string,
  url: string,
  domain: string,
  workflows: string[],
  config: Config,
  opts: { watch: boolean; mode: 'fixed' | 'discover' },
): Promise<void> {
  const scanIds: string[] = []
  const progress = runningJobs.get(jobId)!

  updateAuditJob(jobId, { status: 'running' })

  try {
    const engine = new TrustenEngine(config.browser, config.executionDir)

    // Resolve the workflows to run: either the fixed selection, or an
    // agentically-discovered plan tailored to this site.
    let wfList: ScanWorkflow[]
    if (opts.mode === 'discover') {
      progress.currentStep = 'discovering workflows'
      publish(jobId, {
        type: 'progress',
        action: 'Exploring the site and planning workflows…',
      })
      wfList = await discoverWorkflows(config.browser, url)
      updateAuditJob(jobId, {
        plan: wfList.map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          steps: w.steps.length,
        })),
      })
      publish(jobId, {
        type: 'progress',
        action: `Discovered ${wfList.length} workflow(s): ${wfList.map((w) => w.name).join(', ')}`,
      })
    } else {
      wfList = workflows
        .map((id) => WORKFLOW_REGISTRY[id])
        .filter((w): w is ScanWorkflow => !!w)
    }

    // First run a quick scan on the homepage
    progress.currentStep = 'quick scan'
    publish(jobId, { type: 'progress', action: 'Quick scan of homepage…' })
    const quickResult = await engine.quickScan(url)
    scanIds.push(quickResult.id)

    for (const workflow of wfList) {
      progress.currentStep = `${workflow.name} workflow`
      logger.info('Trusten audit job: starting workflow', {
        jobId,
        workflowId: workflow.id,
      })

      try {
        const result = await engine.deepScan(url, workflow, {
          jobKey: jobId,
          watch: opts.watch,
        })
        scanIds.push(result.id)
        progress.completedWorkflows.push(workflow.id)
        updateAuditJob(jobId, { scanIds })
        publish(jobId, {
          type: 'progress',
          action: `Completed: ${workflow.name} (${result.patterns.length} patterns, grade ${result.score.grade})`,
          grade: result.score.grade,
        })
        logger.info('Trusten audit job: workflow complete', {
          jobId,
          workflowId: workflow.id,
          patterns: result.patterns.length,
        })
      } catch (err) {
        logger.warn('Trusten audit job: workflow failed', {
          jobId,
          workflowId: workflow.id,
          error: String(err),
        })
        // Continue with remaining workflows
      }
    }

    updateAuditJob(jobId, {
      status: 'done',
      scanIds,
      completedAt: new Date().toISOString(),
    })
    publish(jobId, { type: 'done', message: 'Audit complete' })
    closeChannel(jobId)

    logger.info('Trusten audit job complete', {
      jobId,
      domain,
      workflows: progress.completedWorkflows.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    updateAuditJob(jobId, {
      status: 'failed',
      error: msg,
      completedAt: new Date().toISOString(),
    })
    publish(jobId, { type: 'error', message: msg })
    closeChannel(jobId)
    logger.error('Trusten audit job failed', { jobId, error: msg })
  }
}
