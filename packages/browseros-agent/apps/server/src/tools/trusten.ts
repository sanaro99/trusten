/**
 * Trusten MCP Tools
 *
 * Exposes the Trusten dark pattern detection engine as four MCP tools:
 *
 *   trusten_quick_scan           — Scan a URL, all 10 analyzers, single-page
 *   trusten_deep_scan            — Multi-step workflow scan
 *   trusten_analyze_current_page — Scan whatever is currently open
 *   trusten_get_score            — Quick scan + return only the score
 */

import { z } from 'zod'
import { TrustenEngine } from '../trusten/index'
import { WORKFLOW_REGISTRY } from '../trusten/workflows/definitions'
import { defineTool } from './framework'

const WORKFLOW_IDS = [
  'checkout',
  'cancellation',
  'signup',
  'cookie_consent',
  'pricing',
  'comprehensive',
] as const

export const trusten_quick_scan = defineTool({
  name: 'trusten_quick_scan',
  description:
    'Scan a URL for dark patterns using all 10 Trusten analyzers. Navigates to the URL in a background tab, captures the page state, runs detection, and returns a full ScanResult with detected patterns, severity grades, and regulatory violations.',
  input: z.object({
    url: z.string().describe('The URL to scan for dark patterns'),
  }),
  output: z.object({
    id: z.string(),
    url: z.string(),
    domain: z.string(),
    scanType: z.enum(['quick', 'deep']),
    startedAt: z.string(),
    completedAt: z.string(),
    patternCount: z.number(),
    grade: z.string(),
    numericScore: z.number(),
    summary: z.string(),
    patterns: z.array(z.unknown()),
  }),
  handler: async (args, ctx, response) => {
    const engine = new TrustenEngine(ctx.browser, ctx.directories.workingDir)
    const result = await engine.quickScan(args.url)

    const summary = [
      `Trusten scan complete for ${result.domain}`,
      `Grade: ${result.score.grade} (${result.score.numeric}/100)`,
      `Detected ${result.patterns.length} dark pattern${result.patterns.length !== 1 ? 's' : ''}`,
      result.score.summary,
    ].join('\n')

    response.text(summary)
    response.data({
      id: result.id,
      url: result.url,
      domain: result.domain,
      scanType: result.scanType,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      patternCount: result.patterns.length,
      grade: result.score.grade,
      numericScore: result.score.numeric,
      summary: result.score.summary,
      patterns: result.patterns,
    })
  },
})

export const trusten_deep_scan = defineTool({
  name: 'trusten_deep_scan',
  description:
    'Run a multi-step workflow scan for dark patterns. Executes a predefined user journey (checkout, cancellation, signup, cookie_consent, pricing, or comprehensive) and captures evidence at each step. The comprehensive workflow is the most thorough: it dismisses cookie banners, clears interfering modals, automates signup with generated fake credentials, then traces the full shopping journey from search through checkout. Returns a full ScanResult including per-step screenshots and patterns.',
  input: z.object({
    url: z.string().describe('Starting URL for the workflow'),
    workflow: z
      .enum(WORKFLOW_IDS)
      .describe(
        'Which user journey to trace: checkout (add-to-cart through payment), cancellation (find and start cancel flow), signup (registration form), cookie_consent (cookie banner analysis), pricing (pricing page comparison), comprehensive (full audit: cookie dismissal → modal clearance → fake signup → search → cart → checkout)',
      ),
  }),
  output: z.object({
    id: z.string(),
    url: z.string(),
    domain: z.string(),
    workflow: z.string(),
    patternCount: z.number(),
    grade: z.string(),
    numericScore: z.number(),
    summary: z.string(),
    stepCount: z.number(),
    patterns: z.array(z.unknown()),
    workflowSteps: z.array(z.unknown()),
    pdfPath: z.string().optional(),
    htmlPath: z.string().optional(),
  }),
  handler: async (args, ctx, response) => {
    const workflow = WORKFLOW_REGISTRY[args.workflow]
    if (!workflow) {
      response.error(`Unknown workflow: ${args.workflow}`)
      return
    }

    const engine = new TrustenEngine(ctx.browser, ctx.directories.workingDir)
    const result = await engine.deepScan(args.url, workflow)

    const reportNote = result.pdfPath ? `\nReport saved: ${result.pdfPath}` : ''
    const summary = [
      `Trusten deep scan (${workflow.name}) complete for ${result.domain}`,
      `Grade: ${result.score.grade} (${result.score.numeric}/100)`,
      `Detected ${result.patterns.length} dark pattern${result.patterns.length !== 1 ? 's' : ''} across ${result.workflowSteps?.length ?? 0} steps`,
      result.score.summary + reportNote,
    ].join('\n')

    response.text(summary)
    response.data({
      id: result.id,
      url: result.url,
      domain: result.domain,
      workflow: args.workflow,
      patternCount: result.patterns.length,
      grade: result.score.grade,
      numericScore: result.score.numeric,
      summary: result.score.summary,
      stepCount: result.workflowSteps?.length ?? 0,
      patterns: result.patterns,
      workflowSteps: result.workflowSteps ?? [],
      pdfPath: result.pdfPath,
      htmlPath: result.htmlPath,
    })
  },
})

export const trusten_analyze_current_page = defineTool({
  name: 'trusten_analyze_current_page',
  description:
    'Analyze the currently active page for dark patterns without navigating away. Runs all 10 Trusten analyzers on the current page state, injects a floating overlay panel directly onto the page highlighting each detected dark pattern with severity color-coding, and returns a full ScanResult.',
  input: z.object({}),
  output: z.object({
    id: z.string(),
    url: z.string(),
    domain: z.string(),
    patternCount: z.number(),
    grade: z.string(),
    numericScore: z.number(),
    summary: z.string(),
    overlayInjected: z.boolean(),
    patterns: z.array(z.unknown()),
  }),
  handler: async (_args, ctx, response) => {
    const engine = new TrustenEngine(ctx.browser, ctx.directories.workingDir)
    const result = await engine.analyzeCurrentPage()

    const overlayInjected =
      result.overlayStatus.startsWith('shown') ||
      result.overlayStatus === 'hidden'
    const overlayNote = overlayInjected
      ? `A Trusten overlay panel is now visible on the page, showing all detected patterns with severity highlights. Detected elements are outlined in red/orange. Press Escape or click × to dismiss it.`
      : `Note: The page overlay could not be injected (status: ${result.overlayStatus}).`

    const summary = [
      `Trusten analysis complete for ${result.domain}`,
      `Grade: ${result.score.grade} (${result.score.numeric}/100)`,
      `Detected ${result.patterns.length} dark pattern${result.patterns.length !== 1 ? 's' : ''}`,
      result.score.summary,
      overlayNote,
    ].join('\n')

    response.text(summary)
    response.data({
      id: result.id,
      url: result.url,
      domain: result.domain,
      patternCount: result.patterns.length,
      grade: result.score.grade,
      numericScore: result.score.numeric,
      summary: result.score.summary,
      overlayInjected,
      patterns: result.patterns,
    })
  },
})

export const trusten_get_score = defineTool({
  name: 'trusten_get_score',
  description:
    'Quick scan a URL and return just the dark pattern trust score (A-F grade, 0-100 numeric, category breakdown). Faster than trusten_quick_scan as it omits detailed pattern evidence from the response.',
  input: z.object({
    url: z.string().describe('The URL to score'),
  }),
  output: z.object({
    url: z.string(),
    domain: z.string(),
    grade: z.string(),
    numericScore: z.number(),
    patternCount: z.number(),
    summary: z.string(),
    categoryBreakdown: z.record(
      z.object({
        count: z.number(),
        severity: z.string(),
        score: z.number(),
      }),
    ),
  }),
  handler: async (args, ctx, response) => {
    const engine = new TrustenEngine(ctx.browser, ctx.directories.workingDir)
    const result = await engine.quickScan(args.url)

    const scoreText = [
      `${result.domain}: Grade ${result.score.grade} (${result.score.numeric}/100)`,
      `${result.patterns.length} dark patterns detected`,
      result.score.summary,
    ].join('\n')

    response.text(scoreText)
    response.data({
      url: result.url,
      domain: result.domain,
      grade: result.score.grade,
      numericScore: result.score.numeric,
      patternCount: result.patterns.length,
      summary: result.score.summary,
      categoryBreakdown: result.score.categoryBreakdown as Record<
        string,
        { count: number; severity: string; score: number }
      >,
    })
  },
})

export const trusten_scan_history = defineTool({
  name: 'trusten_scan_history',
  description:
    'Retrieve the history of past Trusten scans stored in the local database. Returns summary rows including URL, domain, grade, pattern count, and report paths. Use this to review past dark pattern scan results.',
  input: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe(
        'Maximum number of scan history records to return (default: 20)',
      ),
  }),
  output: z.object({
    scans: z.array(
      z.object({
        id: z.string(),
        url: z.string(),
        domain: z.string(),
        scanType: z.string(),
        workflowId: z.string().nullable(),
        startedAt: z.string(),
        completedAt: z.string(),
        grade: z.string(),
        numericScore: z.number(),
        patternCount: z.number(),
        criticalCount: z.number(),
        highCount: z.number(),
        pdfPath: z.string().nullable(),
        htmlPath: z.string().nullable(),
        createdAt: z.string(),
      }),
    ),
    total: z.number(),
  }),
  handler: async (args, _ctx, response) => {
    const { getTrustenScanHistory } = await import('../trusten/db')
    const rows = getTrustenScanHistory(args.limit)

    const lines = rows.map(
      (r) =>
        `${r.createdAt.slice(0, 10)} | ${r.domain} | Grade ${r.scoreGrade} | ${r.patternCount} patterns | ${r.scanType}${r.workflowId ? ` (${r.workflowId})` : ''}`,
    )

    response.text(
      rows.length === 0
        ? 'No Trusten scans found in history.'
        : `Last ${rows.length} scan${rows.length !== 1 ? 's' : ''}:\n${lines.join('\n')}`,
    )
    response.data({
      scans: rows.map((r) => ({
        id: r.id,
        url: r.url,
        domain: r.domain,
        scanType: r.scanType,
        workflowId: r.workflowId,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        grade: r.scoreGrade,
        numericScore: r.scoreNumeric,
        patternCount: r.patternCount,
        criticalCount: r.criticalCount,
        highCount: r.highCount,
        pdfPath: r.pdfPath,
        htmlPath: r.htmlPath,
        createdAt: r.createdAt,
      })),
      total: rows.length,
    })
  },
})
