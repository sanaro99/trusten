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
  getTrustenScanById,
  getTrustenScanHistory,
  getTrustenScansByDomain,
  updateAuditJob,
} from '../db'
import { TrustenEngine } from '../index'
import { closeChannel, publish } from '../live/hub'
import type {
  JobCapabilityAccess,
  JobCapabilityScope,
} from '../security/job-capability'
import {
  type PublicScanAdmission,
  PublicScanAdmissionError,
  type PublicScanAdmissionGrant,
} from '../security/public-scan-admission'
import type { ScanWorkflow } from '../types'
import { checkRateLimit, isAllowedByRobots } from '../utils/guardrails'
import { WORKFLOW_REGISTRY } from '../workflows/definitions'
import { parseBody } from './validate'

interface Config {
  browser: BrowserDriver
  executionDir: string
  admission: PublicScanAdmission
  capabilities: JobCapabilityAccess
  secureCookies?: boolean
}

const DEMO_SESSION_COOKIE = 'trusten_demo'

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
  if (quota) return c.json({ error: error.message, code: error.code }, 429)
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
      if (error instanceof PublicScanAdmissionError)
        return admissionResponse(c, error)
      throw error
    }

    const qsGuard = await preScanGuard(
      admitted.target.url,
      admitted.target.hostname,
    )
    if (qsGuard) {
      config.admission.release(admitted.id)
      return c.json({ error: qsGuard.error }, qsGuard.status)
    }

    try {
      const engine = new TrustenEngine(config.browser, config.executionDir)
      const result = await engine.quickScan(admitted.target.url)
      setDemoSession(c, admitted.sessionId, config.secureCookies ?? true)
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
    } finally {
      config.admission.release(admitted.id)
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
      if (error instanceof PublicScanAdmissionError)
        return admissionResponse(c, error)
      throw error
    }

    const guard = await preScanGuard(
      admitted.target.url,
      admitted.target.hostname,
    )
    if (guard) {
      config.admission.release(admitted.id)
      return c.json({ error: guard.error }, guard.status)
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
      config.admission.release(admitted.id)
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
      },
    )
      .catch((err) => {
        logger.error('Trusten audit job crashed', { jobId, error: String(err) })
      })
      .finally(() => config.admission.release(admitted.id))

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
  opts: { watch: boolean; mode: 'fixed' | 'discover' },
): Promise<void> {
  const scanIds: string[] = []
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
        // Continue with remaining workflows
      }
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await updateAuditJob(jobId, {
      status: 'failed',
      error: msg,
      completedAt: new Date().toISOString(),
    })
    publish(jobId, { type: 'error', message: msg })
    closeChannel(jobId)
    logger.error('Trusten audit job failed', { jobId, error: msg })
  }
}
