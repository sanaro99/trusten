/**
 * Trusten — Standalone server entrypoint
 *
 * Boots the Trusten dark-pattern scanner on a plain headless browser
 * (Puppeteer Chromium) — no BrowserOS, no MCP, no CDP-to-BrowserOS bridge.
 *
 *   - Launches Puppeteer Chromium via PuppeteerDriver
 *   - Initializes the SQLite store
 *   - Serves the dashboard + scan APIs (Hono) on :9200
 *   - Streams live Deep Scan frames + progress over WebSocket
 *
 * Run with:  bun run src/trusten/main.ts
 */

import os from 'node:os'
import path from 'node:path'
import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { closeDb, initializeDb } from '../lib/db'
import { logger } from '../lib/logger'
import { PuppeteerDriver } from './browser/puppeteer-driver'
import { createTrustenDashboardRoutes } from './dashboard/routes'
import { ensureTrustenSchema } from './db'
import { subscribe } from './live/hub'

const { upgradeWebSocket, websocket } = createBunWebSocket()

const PORT = Number(process.env.TRUSTEN_PORT ?? 9200)

function dataDir(): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? os.homedir()
  return path.join(home, '.trusten')
}

async function main(): Promise<void> {
  // ── Storage ──
  const dir = dataDir()
  const fs = await import('node:fs')
  fs.mkdirSync(dir, { recursive: true })
  const dbPath = path.join(dir, 'trusten.db')
  initializeDb(dbPath)
  ensureTrustenSchema()
  logger.info('Trusten database ready', { dbPath })

  // ── Headless browser ──
  const driver = new PuppeteerDriver()

  // ── HTTP server ──
  const app = new Hono()
  app.use(trimTrailingSlash())

  app.get('/', (c) => c.redirect('/trusten'))
  app.get('/health', (c) => c.json({ status: 'ok', service: 'trusten' }))

  // Live Deep Scan stream (frames + progress) — registered before the /trusten
  // mount so the WS upgrade is matched first.
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
    try {
      await driver.close()
    } catch {
      /* ignore */
    }
    try {
      closeDb()
    } catch {
      /* ignore */
    }
    server.stop()
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
