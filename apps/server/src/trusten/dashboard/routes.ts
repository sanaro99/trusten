/**
 * Trusten Dashboard — Hono Route Handlers
 *
 * Serves the Trusten web dashboard at /trusten/*
 * Provides JSON APIs for scan submission and status polling.
 */

import {
  AnalyzePageRequestSchema,
  AuditRequestSchema,
  QuickScanRequestSchema,
} from '@trusten/shared/api'
import { type Context, Hono } from 'hono'
import { logger } from '../../lib/logger'
import { discoverWorkflows } from '../agent/discovery'
import type { BrowserDriver } from '../browser/driver'
import {
  createAuditJob,
  getAuditJob,
  getDomainSummary,
  getGlobalStats,
  getRecentCompletedAuditJob,
  getRecentPublicQuickScan,
  getTrustenScanById,
  getTrustenScanHistory,
  getTrustenScansByDomain,
  updateAuditJob,
} from '../db'
import { TrustenEngine } from '../index'
import { closeChannel, publish } from '../live/hub'
import { ScanIncompleteError } from '../scan-incomplete-error'
import type {
  JobCapabilityAccess,
  JobCapabilityScope,
} from '../security/job-capability'
import {
  type PublicScanAdmission,
  PublicScanAdmissionError,
  type PublicScanAdmissionGrant,
} from '../security/public-scan-admission'
import type { ScanResult, ScanWorkflow, WorkflowStep } from '../types'
import { isAllowedByRobots, reserveRateLimit } from '../utils/guardrails'
import { WORKFLOW_REGISTRY } from '../workflows/definitions'
import { parseBody } from './validate'

interface Config {
  browser: BrowserDriver
  executionDir: string
  admission: PublicScanAdmission
  capabilities: JobCapabilityAccess
  secureCookies?: boolean
  recentQuickScan?: typeof getRecentPublicQuickScan
  recentAuditJob?: typeof getRecentCompletedAuditJob
}

const DEMO_SESSION_COOKIE = 'trusten_demo'
const RECENT_RESULT_MS = 10 * 60_000

function canReuseAfterAdmissionError(error: PublicScanAdmissionError): boolean {
  return (
    error.code.endsWith('QUOTA_EXCEEDED') ||
    error.code === 'SCAN_RETRY_LIMITED' ||
    error.code === 'DEMO_BUSY'
  )
}

function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer\s+([^\s]+)$/i.exec(header ?? '')
  return match?.[1]
}

async function authorizeJob(
  c: Context,
  capabilities: JobCapabilityAccess,
  jobId: string,
  scope: JobCapabilityScope,
): Promise<boolean> {
  const token = bearerToken(c.req.header('authorization'))
  if (!token) return false
  return (await capabilities.authorize(jobId, token, scope)).authorized
}

function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) {
      try {
        return decodeURIComponent(value.join('='))
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

function clientIp(headers: Headers): string {
  return headers.get('x-trusten-client-ip')?.trim() || 'unknown'
}

function setDemoSession(c: Context, sessionId: string, secure: boolean): void {
  c.header(
    'Set-Cookie',
    `${DEMO_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=2592000; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax`,
  )
}

function admissionResponse(c: Context, error: PublicScanAdmissionError) {
  const quota = error.code.endsWith('QUOTA_EXCEEDED')
  if (error.retryAfterSeconds)
    c.header('Retry-After', String(error.retryAfterSeconds))
  if (quota || error.code === 'SCAN_RETRY_LIMITED')
    return c.json({ error: error.message, code: error.code }, 429)
  if (error.code === 'DEMO_BUSY' || error.code === 'BOT_UNAVAILABLE')
    return c.json({ error: error.message, code: error.code }, 503)
  return c.json({ error: error.message, code: error.code }, 403)
}

// In-memory tracking of running audit jobs (job progress)
const runningJobs = new Map<
  string,
  { currentStep: string; completedWorkflows: string[] }
>()

/** robots.txt + per-domain rate-limit gate. Returns an error to send, or null. */
/** Parse a URL's hostname, or null if the URL is invalid. */
function parseHostname(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

async function preScanGuard(
  url: string,
  domain: string,
  kind: 'quick' | 'audit',
): Promise<
  | {
      allowed: false
      error: string
      status: 403 | 429
      code: string
      retryAfterSeconds?: number
    }
  | { allowed: true; cancel: () => void }
> {
  if (process.env.TRUSTEN_IGNORE_ROBOTS !== '1') {
    const allowed = await isAllowedByRobots(url).catch(() => true)
    if (!allowed) {
      return {
        allowed: false,
        error: "Scanning this URL is disallowed by the site's robots.txt",
        status: 403,
        code: 'SITE_DISALLOWED',
      }
    }
  }
  const reservation = reserveRateLimit(domain, kind)
  if (!reservation.allowed) {
    return {
      allowed: false,
      error: 'Rate limit: max 1 scan per domain per minute — try again shortly',
      status: 429,
      code: 'RATE_LIMITED',
      retryAfterSeconds: reservation.retryAfterSeconds,
    }
  }
  return reservation
}

export function createTrustenDashboardRoutes(config: Config) {
  const app = new Hono()
  const findQuickScan = config.recentQuickScan ?? getRecentPublicQuickScan
  const findAuditJob = config.recentAuditJob ?? getRecentCompletedAuditJob

  // Step screenshot — served directly from the saved file
  app.get('/report/:id/screenshot/:step', async (c) => {
    const id = c.req.param('id')
    const step = Number(c.req.param('step'))
    const scan = await getTrustenScanById(id)

    const wfStep = scan?.workflowSteps?.find((s) => s.stepNumber === step) as
      | { screenshotPath?: string; stepNumber: number }
      | undefined

    const filePath = wfStep?.screenshotPath

    if (!filePath) {
      // Try standard path pattern as fallback
      const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
      const reportsDir =
        process.env.TRUSTEN_REPORTS_DIR ?? `${home}/Desktop/trusten-reports`
      const guessPath = `${reportsDir}/screenshots/${id}/step-${step}.jpg`
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
    const scan = await getTrustenScanById(id)
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
    const scan = await getTrustenScanById(id)
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

  // Always preserve a downloadable report when Chromium cannot print a PDF.
  app.get('/report/:id/html', async (c) => {
    const id = c.req.param('id')
    const scan = await getTrustenScanById(id)
    if (!scan?.htmlPath) return c.text('HTML report not found', 404)
    try {
      const fs = await import('node:fs')
      return new Response(fs.readFileSync(scan.htmlPath), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="trusten-${id}.html"`,
          'Content-Security-Policy':
            "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return c.text('HTML report file not accessible', 404)
    }
  })

  // ─── JSON APIs ───

  // Analyze pre-captured content — accepts HTML/text from a browser extension or any client.
  // Does not navigate to the URL; runs analyzers on the supplied content directly.
  app.post('/api/analyze-page', async (c) => {
    const parsed = await parseBody(c, AnalyzePageRequestSchema)
    if (!parsed.ok) return c.json(parsed.body, 400)
    const { url, html, text, pageTitle } = parsed.data

    if (!parseHostname(url)) return c.json({ error: 'Invalid URL' }, 400)

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
      if (err instanceof ScanIncompleteError)
        return c.json({ code: err.code, error: msg }, 422)
      return c.json({ error: msg }, 500)
    }
  })

  // Quick scan — runs immediately, returns scan ID
  app.post('/api/quick-scan', async (c) => {
    const parsed = await parseBody(c, QuickScanRequestSchema)
    if (!parsed.ok) return c.json(parsed.body, 400)
    const { url } = parsed.data

    const qsDomain = parseHostname(url)
    if (!qsDomain) return c.json({ error: 'Invalid URL' }, 400)

    let admitted: PublicScanAdmissionGrant
    try {
      admitted = await config.admission.admit({
        kind: 'quick',
        target: url,
        domain: qsDomain,
        turnstileToken: parsed.data.turnstileToken,
        anonymousSession: readCookie(
          c.req.header('cookie'),
          DEMO_SESSION_COOKIE,
        ),
        clientIp: clientIp(c.req.raw.headers),
      })
    } catch (error) {
      if (error instanceof PublicScanAdmissionError) {
        if (canReuseAfterAdmissionError(error)) {
          const cached = await findQuickScan(url)
          if (cached)
            return c.json({
              scanId: cached.id,
              domain: cached.domain,
              grade: cached.score.grade,
              score: cached.score.numeric,
              patterns: cached.patterns.length,
              cached: true,
              checkedAt: cached.completedAt,
            })
        }
        return admissionResponse(c, error)
      }
      throw error
    }

    let guard: Awaited<ReturnType<typeof preScanGuard>> | undefined
    let completed = false
    setDemoSession(c, admitted.sessionId, config.secureCookies ?? true)
    try {
      const cached = await findQuickScan(admitted.target.url, RECENT_RESULT_MS)
      if (cached)
        return c.json({
          scanId: cached.id,
          domain: cached.domain,
          grade: cached.score.grade,
          score: cached.score.numeric,
          patterns: cached.patterns.length,
          cached: true,
          checkedAt: cached.completedAt,
        })
      guard = await preScanGuard(
        admitted.target.url,
        admitted.target.hostname,
        'quick',
      )
      if (!guard.allowed) {
        if (guard.retryAfterSeconds)
          c.header('Retry-After', String(guard.retryAfterSeconds))
        return c.json({ error: guard.error, code: guard.code }, guard.status)
      }
      const engine = new TrustenEngine(config.browser, config.executionDir)
      const result = await engine.quickScan(admitted.target.url)
      completed = true
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
      if (err instanceof ScanIncompleteError) {
        return c.json({ code: err.code, error: msg }, 422)
      }
      return c.json({ error: msg }, 500)
    } finally {
      if (completed) await config.admission.release(admitted.id)
      else {
        if (guard?.allowed) guard.cancel()
        await config.admission.cancel(admitted.id)
      }
    }
  })

  // Start a full multi-workflow audit (async)
  app.post('/api/audit', async (c) => {
    const parsed = await parseBody(c, AuditRequestSchema)
    if (!parsed.ok) return c.json(parsed.body, 400)
    const { url, watch, mode } = parsed.data
    const workflows = parsed.data.workflows ?? Object.keys(WORKFLOW_REGISTRY)

    const domain = parseHostname(url)
    if (!domain) return c.json({ error: 'Invalid URL' }, 400)

    // In discover mode the workflows are generated at run time, so skip the
    // fixed-workflow validation.
    const validWorkflows =
      mode === 'discover' ? [] : workflows.filter((w) => WORKFLOW_REGISTRY[w])
    if (mode === 'fixed' && validWorkflows.length === 0) {
      return c.json({ error: 'No valid workflows selected' }, 400)
    }

    let admitted: PublicScanAdmissionGrant
    try {
      admitted = await config.admission.admit({
        kind: 'audit',
        target: url,
        domain,
        turnstileToken: parsed.data.turnstileToken,
        anonymousSession: readCookie(
          c.req.header('cookie'),
          DEMO_SESSION_COOKIE,
        ),
        clientIp: clientIp(c.req.raw.headers),
      })
    } catch (error) {
      if (error instanceof PublicScanAdmissionError) {
        if (canReuseAfterAdmissionError(error)) {
          const cached = await findAuditJob(url, validWorkflows)
          if (cached) {
            const capability = await config.capabilities.issue(cached.id)
            return c.json({
              jobId: cached.id,
              domain: cached.domain,
              capabilityToken: capability.token,
              capabilityExpiresAt: capability.expiresAt,
              cached: true,
              checkedAt: cached.completedAt ?? cached.createdAt,
            })
          }
        }
        return admissionResponse(c, error)
      }
      throw error
    }

    let cached: Awaited<ReturnType<typeof getRecentCompletedAuditJob>>
    try {
      cached = await findAuditJob(
        admitted.target.url,
        validWorkflows,
        RECENT_RESULT_MS,
      )
    } catch (error) {
      await config.admission.cancel(admitted.id)
      throw error
    }
    if (cached) {
      await config.admission.cancel(admitted.id)
      const capability = await config.capabilities.issue(cached.id)
      setDemoSession(c, admitted.sessionId, config.secureCookies ?? true)
      return c.json({
        jobId: cached.id,
        domain: cached.domain,
        capabilityToken: capability.token,
        capabilityExpiresAt: capability.expiresAt,
        cached: true,
        checkedAt: cached.completedAt ?? cached.createdAt,
      })
    }

    let guard: Awaited<ReturnType<typeof preScanGuard>>
    try {
      guard = await preScanGuard(
        admitted.target.url,
        admitted.target.hostname,
        'audit',
      )
    } catch (error) {
      await config.admission.cancel(admitted.id)
      throw error
    }
    if (!guard.allowed) {
      await config.admission.cancel(admitted.id)
      if (guard.retryAfterSeconds)
        c.header('Retry-After', String(guard.retryAfterSeconds))
      return c.json({ error: guard.error, code: guard.code }, guard.status)
    }

    let jobId: string
    let capability: Awaited<ReturnType<JobCapabilityAccess['issue']>>
    try {
      jobId = await createAuditJob(
        admitted.target.url,
        admitted.target.hostname,
        validWorkflows,
      )
      capability = await config.capabilities.issue(jobId)
    } catch (error) {
      guard.cancel()
      await config.admission.cancel(admitted.id)
      throw error
    }
    runningJobs.set(jobId, { currentStep: 'queued', completedWorkflows: [] })

    // Run async in the background — do not await
    runAuditJob(
      jobId,
      admitted.target.url,
      admitted.target.hostname,
      validWorkflows,
      config,
      {
        watch,
        mode,
        onFailure: async () => {
          guard.cancel()
          await config.admission.cancel(admitted.id)
        },
      },
    )
      .then(async (completed) => {
        if (completed) await config.admission.release(admitted.id)
      })
      .catch(async (err) => {
        logger.error('Trusten audit job crashed', { jobId, error: String(err) })
        guard.cancel()
        await config.admission.cancel(admitted.id)
      })

    setDemoSession(c, admitted.sessionId, config.secureCookies ?? true)
    return c.json({
      jobId,
      domain: admitted.target.hostname,
      capabilityToken: capability.token,
      capabilityExpiresAt: capability.expiresAt,
    })
  })

  app.post('/api/audit/:jobId/live-ticket', async (c) => {
    const jobId = c.req.param('jobId')
    const token = bearerToken(c.req.header('authorization'))
    if (!token) return c.json({ error: 'Not authorized' }, 404)
    const ticket = await config.capabilities.issueLiveTicket(jobId, token)
    if (!ticket) return c.json({ error: 'Not authorized' }, 404)
    return c.json({ ticket: ticket.token, expiresAt: ticket.expiresAt })
  })

  // Poll audit job status
  app.get('/api/audit/:jobId', async (c) => {
    const jobId = c.req.param('jobId')
    if (!(await authorizeJob(c, config.capabilities, jobId, 'status'))) {
      return c.json({ error: 'Job not found' }, 404)
    }
    const progress = runningJobs.get(jobId)
    const job = await getAuditJob(jobId)

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
  app.get('/api/stats', async (c) => {
    return c.json(await getGlobalStats())
  })

  // JSON domain summary
  app.get('/api/domain/:domain', async (c) => {
    const domain = c.req.param('domain')
    const summary = await getDomainSummary(domain)
    const scans = await getTrustenScansByDomain(domain, 20)
    return c.json({ domain, summary, scans })
  })

  // JSON scan detail
  app.get('/api/scan/:id', async (c) => {
    const id = c.req.param('id')
    const scan = await getTrustenScanById(id)
    if (!scan) return c.json({ error: 'Not found' }, 404)
    return c.json(scan)
  })

  // JSON scan history
  app.get('/api/history', async (c) => {
    const limit = Number(c.req.query('limit') ?? '50')
    const scans = await getTrustenScanHistory(Math.min(limit, 200))
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
  opts: {
    watch: boolean
    mode: 'fixed' | 'discover'
    onFailure: () => Promise<void>
  },
): Promise<boolean> {
  const scanIds: string[] = []
  const failedSteps: WorkflowStep[] = []
  const progress = runningJobs.get(jobId)!

  await updateAuditJob(jobId, { status: 'running' })

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
      await updateAuditJob(jobId, {
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
    const quickResult = await engine.quickScan(url, { parentAuditId: jobId })
    const results: ScanResult[] = [quickResult]
    scanIds.push(quickResult.id)
    await updateAuditJob(jobId, { scanIds })

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
          parentAuditId: jobId,
        })
        scanIds.push(result.id)
        results.push(result)
        progress.completedWorkflows.push(workflow.id)
        await updateAuditJob(jobId, { scanIds })
        const steps = result.workflowSteps ?? []
        const advancedCount = steps.filter(
          (s) => s.status === 'reached' || s.status === 'observed',
        ).length
        const reachedFunnel = steps.some((s) => s.status === 'reached')
        const funnelNote = steps.length
          ? reachedFunnel
            ? ` · navigated ${advancedCount}/${steps.length} steps`
            : ` · could not navigate the journey (${advancedCount}/${steps.length} steps)`
          : ''
        publish(jobId, {
          type: 'progress',
          action: `Completed: ${workflow.name} (${result.patterns.length} patterns, grade ${result.score.grade})${funnelNote}`,
          grade: result.score.grade,
        })
        logger.info('Trusten audit job: workflow complete', {
          jobId,
          workflowId: workflow.id,
          patterns: result.patterns.length,
          advancedSteps: advancedCount,
          totalSteps: steps.length,
        })
      } catch (err) {
        logger.warn('Trusten audit job: workflow failed', {
          jobId,
          workflowId: workflow.id,
          error: String(err),
        })
        failedSteps.push(
          ...workflow.steps.map(
            (step, index): WorkflowStep => ({
              stepNumber: index + 1,
              action: step.instruction,
              url,
              screenshot: '',
              patternsFound: [],
              timestamp: new Date().toISOString(),
              status: index === 0 ? 'not-reached' : 'skipped',
              navAdvanced: false,
              navReason:
                index === 0
                  ? 'This journey could not be completed.'
                  : 'Skipped because an earlier part of this journey failed.',
            }),
          ),
        )
        // Continue with remaining workflows
      }
    }

    progress.currentStep = 'preparing the complete report'
    const summary = await engine.summarizeAudit(url, results, failedSteps)
    scanIds.push(summary.id)
    // A failed journey still has usable homepage evidence. Publish its limited
    // report before failing/refunding so that evidence remains reviewable.
    if (progress.completedWorkflows.length === 0) {
      await updateAuditJob(jobId, { scanIds })
      throw new ScanIncompleteError(
        'The website stopped every requested journey. Only the first page could be checked.',
      )
    }

    await updateAuditJob(jobId, {
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
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // A visible failure must allow an immediate retry with the same session.
    await opts.onFailure()
    await updateAuditJob(jobId, {
      status: 'failed',
      error: msg,
      completedAt: new Date().toISOString(),
    })
    publish(jobId, { type: 'error', message: msg })
    closeChannel(jobId)
    logger.error('Trusten audit job failed', { jobId, error: msg })
    return false
  }
}
