/**
 * Trusten — Standalone server entrypoint
 *
 * Boots the Trusten dark-pattern scanner on a plain headless browser
 * (Puppeteer Chromium) — no BrowserOS, no MCP, no CDP-to-BrowserOS bridge.
 *
 *   - Launches Puppeteer Chromium via PuppeteerDriver
 *   - Initializes PostgreSQL and applies versioned migrations
 *   - Serves the dashboard + scan APIs (Hono) on :9200
 *   - Streams live Deep Scan frames + progress over WebSocket
 *
 * Run with:  bun run src/trusten/main.ts
 */

import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { closeDb, getDb, initializeDb } from '../lib/db'
import { logger } from '../lib/logger'
import { PuppeteerDriver } from './browser/puppeteer-driver'
import { loadTrustenConfig } from './config'
import { createTrustenDashboardRoutes } from './dashboard/routes'
import { ensureTrustenSchema, failIncompleteAuditJobs } from './db'
import { subscribe } from './live/hub'
import type { BotVerifier } from './security/bot-verifier'
import { FakeBotVerifier } from './security/bot-verifier'
import { CloudflareTurnstileVerifier } from './security/cloudflare-turnstile'
import { JobCapabilityAccess } from './security/job-capability'
import { PostgreSqlCapabilityStore } from './security/postgres-capability-store'
import { PostgresPublicScanAdmissionPersistence } from './security/postgres-public-scan-admission'
import { PublicScanAdmission } from './security/public-scan-admission'
import { authorizeTarget } from './security/target-policy'

const { upgradeWebSocket, websocket } = createBunWebSocket()

const PORT = Number(process.env.TRUSTEN_PORT ?? 9200)

async function main(): Promise<void> {
  const config = loadTrustenConfig()

  // ── Storage ──
  initializeDb()
  await ensureTrustenSchema()
  const orphanedJobs = await failIncompleteAuditJobs()
  if (orphanedJobs > 0) {
    logger.warn('Marked interrupted audit jobs as failed', {
      count: orphanedJobs,
    })
  }
  logger.info('Trusten PostgreSQL database ready')

  // ── Headless browser ──
  // The browser re-authorizes the initial URL and every subsequent HTTP(S)
  // request so redirects and subresources cannot bypass admission-time SSRF
  // checks.
  const driver = new PuppeteerDriver((url) => authorizeTarget(url))

  let botVerifier: BotVerifier
  if (config.turnstile.mode === 'enforce') {
    botVerifier = new CloudflareTurnstileVerifier({
      secretKey: config.turnstile.secretKey,
      expectedHostname: config.turnstile.expectedHostname,
      expectedAction: config.turnstile.expectedAction,
      siteverifyUrl: config.turnstile.siteverifyUrl,
      timeoutMs: config.turnstile.timeoutMs,
    })
  } else {
    botVerifier = new FakeBotVerifier()
  }

  const admission = new PublicScanAdmission({
    botVerifier,
    persistence: new PostgresPublicScanAdmissionPersistence(getDb()),
    sessionQuota: {
      limit: config.demo.sessionLimit,
      windowMs: config.demo.sessionWindowMs,
    },
    ipQuota: {
      limit: config.demo.ipLimit,
      windowMs: config.demo.ipWindowMs,
    },
    domainQuota: {
      limit: config.demo.domainLimit,
      windowMs: config.demo.domainWindowMs,
    },
    maxOutstanding: config.demo.maxOutstanding,
  })
  const capabilities = new JobCapabilityAccess({
    store: new PostgreSqlCapabilityStore(),
    hashKey: config.capabilityHashKey,
  })

  // ── HTTP server ──
  const app = new Hono()
  app.use(trimTrailingSlash())

  app.get('/', (c) => c.redirect('/trusten'))
  app.get('/health/live', (c) => c.json({ status: 'ok', service: 'trusten' }))
  app.get('/health', async (c) => {
    try {
      await getDb()`SELECT 1`
      return c.json({ status: 'ok', service: 'trusten', database: 'ready' })
    } catch {
      return c.json(
        { status: 'unavailable', service: 'trusten', database: 'unavailable' },
        503,
      )
    }
  })

  // Live Deep Scan stream (frames + progress) — registered before the /trusten
  // mount so the WS upgrade is matched first.
  app.use('/trusten/api/jobs/:jobId/live', async (c, next) => {
    const authorization = await capabilities.consumeLiveTicket(
      c.req.param('jobId'),
      c.req.query('ticket') ?? '',
    )
    if (!authorization.authorized) {
      return c.json({ error: 'Job not found' }, 404)
    }
    return next()
  })

  app.get(
    '/trusten/api/jobs/:jobId/live',
    upgradeWebSocket((c) => {
      const jobId = c.req.param('jobId')
      let unsub: () => void = () => {}
      return {
        onOpen(_evt, ws) {
          unsub = subscribe(jobId, (event) => {
            try {
              ws.send(JSON.stringify(event))
            } catch {
              /* socket closing */
            }
          })
        },
        onClose() {
          unsub()
        },
      }
    }),
  )

  app.route(
    '/trusten',
    createTrustenDashboardRoutes({
      browser: driver,
      executionDir: process.cwd(),
      admission,
      capabilities,
      secureCookies: config.environment === 'production',
    }),
  )

  const server = Bun.serve({
    port: PORT,
    fetch: app.fetch,
    websocket,
    idleTimeout: 255,
  })
  logger.info('Trusten server listening', {
    url: `http://localhost:${server.port}/trusten`,
  })

  // ── Graceful shutdown ──
  const shutdown = async (signal: string) => {
    logger.info('Trusten shutting down', { signal })
    // Stop accepting new scans before closing dependencies used by in-flight
    // requests. Outstanding leases expire automatically after a crash/timeout.
    server.stop()
    try {
      await driver.close()
    } catch {
      /* ignore */
    }
    try {
      await closeDb()
    } catch {
      /* ignore */
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.error('Trusten failed to start', {
    error: err instanceof Error ? err.stack : String(err),
  })
  process.exit(1)
})
