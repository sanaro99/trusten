import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { discoverWorkflows } from './agent/discovery'
import { PuppeteerDriver } from './browser/puppeteer-driver'
import { TrustenEngine } from './index'
import type { SaveScanOptions, ScanStore } from './store'
import type { ScanResult, ScanWorkflow } from './types'
import {
  CHECKOUT_WORKFLOW,
  COOKIE_CONSENT_WORKFLOW,
} from './workflows/definitions'

const enabled = process.env.TRUSTEN_BROWSER_TESTS === '1'
const reportsDir = path.join(
  process.cwd(),
  '.trusten-local',
  'browser-regression-reports',
)

function page(body: string) {
  return `<!doctype html><html><head><title>Trusten test shop</title></head><body>${body}</body></html>`
}

describe.skipIf(!enabled)('deep scan in Chromium', () => {
  let server: ReturnType<typeof Bun.serve>
  let browser: PuppeteerDriver
  let baseUrl: string
  const saved: ScanResult[] = []
  const savedOptions = new Map<string, SaveScanOptions | undefined>()
  const store: ScanStore = {
    saveScan: async (result, options) => {
      saved.push(result)
      savedOptions.set(result.id, options)
    },
    cachePageFindings: async () => {},
    getCachedPageFindings: async () => null,
  }
  let engine: TrustenEngine

  beforeAll(() => {
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const url = new URL(request.url)
        let html = ''
        if (url.pathname === '/consent') {
          html =
            page(`<main><h1>Test shop</h1><p>Welcome to the test shop.</p></main>
            <section id="cookie-banner"><h2>We use cookies</h2><p>Accept all cookies or manage preferences.</p>
              <button onclick="document.querySelector('#cookie-banner').remove()">Accept all</button>
              <button onclick="document.querySelector('#cookie-banner').innerHTML = '<h2>Cookie preferences</h2><label><input type=checkbox checked>Receive marketing offers</label><button>Save preferences</button>'">Manage preferences</button>
            </section>`)
        } else if (url.pathname === '/') {
          html = page(
            '<header><a href="/cart">Cart</a></header><main><h1>Shop</h1><form action="/products"><input type="search" name="q"><button>Search</button></form></main>',
          )
        } else if (url.pathname === '/products') {
          html = page(
            '<main><h1>Products</h1><article class="product"><a href="/product/shirt"><h2>Test shirt</h2><p>$20</p></a></article></main>',
          )
        } else if (url.pathname === '/product/shirt') {
          html = page(
            `<main><h1>Test shirt</h1><p>$20</p><button onclick="document.querySelector('main').insertAdjacentHTML('beforeend', '<section role=dialog><h2>Added to cart</h2><label><input type=checkbox checked>Include shipping insurance for $5</label><a href=/cart>View cart</a></section>')">Add to cart</button></main>`,
          )
        } else if (url.pathname === '/cart') {
          html = page(
            '<main><h1>Your cart</h1><p>Test shirt $20</p><p>Shipping insurance $5</p><a href="/checkout">Proceed to checkout</a></main>',
          )
        } else if (url.pathname === '/checkout') {
          html = page(
            '<main><h1>Checkout</h1><p>Service fee $9 is added at checkout.</p><label><input type="checkbox" checked>Receive marketing offers</label><input name="card" aria-label="Card number"><button>Place order</button></main>',
          )
        } else if (url.pathname === '/timer') {
          html = page(
            '<main><h1>Welcome</h1><p id="timer">59 seconds left</p></main><script>let seconds=59; setInterval(()=>document.querySelector("#timer").textContent=seconds-- + " seconds left",100)</script>',
          )
        } else if (url.pathname === '/challenge') {
          html =
            '<html><head><title>Just a moment...</title></head><body>Verify you are human.</body></html>'
        } else {
          return new Response('Page missing', { status: 404 })
        }
        return new Response(html, { headers: { 'content-type': 'text/html' } })
      },
    })
    baseUrl = `http://127.0.0.1:${server.port}`
    browser = new PuppeteerDriver()
    engine = new TrustenEngine(browser, undefined, store, reportsDir)
  })

  afterAll(async () => {
    await browser?.close()
    server?.stop(true)
    const resolved = path.resolve(reportsDir)
    if (
      !resolved.startsWith(
        path.resolve(process.cwd(), '.trusten-local') + path.sep,
      )
    )
      throw new Error('Unsafe cleanup path')
    rmSync(resolved, { recursive: true, force: true })
  })

  test('captures consent before dismissal and reaches preferences at the same URL', async () => {
    const result = await engine.deepScan(
      `${baseUrl}/consent`,
      COOKIE_CONSENT_WORKFLOW,
    )
    expect(result.patterns.some((p) => p.category === 'dark_consent')).toBe(
      true,
    )
    expect(result.workflowSteps?.map((s) => s.status)).toEqual([
      'observed',
      'reached',
      'observed',
    ])
    expect(
      result.patterns.some((p) => p.category === 'preselected_options'),
    ).toBe(true)
    expect(
      result.workflowSteps?.every(
        (s) => s.screenshotPath && existsSync(s.screenshotPath),
      ),
    ).toBe(true)
    expect(
      result.pdfPath && readFileSync(result.pdfPath).subarray(0, 4).toString(),
    ).toBe('%PDF')
    expect(saved.some((s) => s.id === result.id)).toBe(true)
  }, 60_000)

  test('traverses search, product, same-page cart, cart page, and checkout without a model', async () => {
    const result = await engine.deepScan(`${baseUrl}/`, CHECKOUT_WORKFLOW)
    expect(result.workflowSteps?.map((s) => s.status)).toEqual([
      'reached',
      'reached',
      'reached',
      'reached',
      'reached',
    ])
    expect(result.workflowSteps?.map((s) => new URL(s.url).pathname)).toEqual([
      '/products',
      '/product/shirt',
      '/product/shirt',
      '/cart',
      '/checkout',
    ])
    expect(
      result.patterns.some(
        (p) =>
          p.category === 'preselected_options' &&
          new URL(p.url).pathname === '/checkout',
      ),
    ).toBe(true)
    expect(
      result.patterns.every((p) => p.regulatoryViolations.length > 0),
    ).toBe(true)
    expect(result.videoPath && existsSync(result.videoPath)).toBe(true)
    expect(await browser.listPages()).toHaveLength(0)
  }, 90_000)

  test('does not inspect dependent observations when their destination was never reached', async () => {
    const workflow: ScanWorkflow = {
      id: 'missing-destination',
      name: 'Missing destination',
      description: '',
      steps: [
        {
          id: 'find',
          instruction: 'Find nonexistent signup',
          clickText: ['Nonexistent signup'],
          expectsNavigation: true,
          analyzersToRun: ['PrivacyAnalyzer'],
          timeout: 5,
          screenshotBefore: false,
          screenshotAfter: true,
        },
        {
          id: 'inspect',
          instruction: 'Inspect the unseen signup form',
          analyzersToRun: ['PrivacyAnalyzer'],
          timeout: 5,
          screenshotBefore: false,
          screenshotAfter: true,
        },
      ],
    }
    const result = await engine.deepScan(`${baseUrl}/timer`, workflow)
    expect(
      result.workflowSteps
        ?.filter((s) => s.stepNumber > 0)
        .map((s) => s.status),
    ).toEqual(['not-reached', 'skipped'])
    const unseen = result.workflowSteps?.find((s) => s.stepNumber === 2)
    expect(unseen?.screenshotPath).toBeFalsy()
    expect(unseen?.patternsFound).toEqual([])
  }, 60_000)

  test('rejects bot challenge content during a deep scan', async () => {
    await expect(
      engine.deepScan(`${baseUrl}/challenge`, COOKIE_CONSENT_WORKFLOW),
    ).rejects.toThrow()
  }, 30_000)

  test('surfaces HTTP failures instead of treating an error page as reached', async () => {
    const id = await browser.newPage(`${baseUrl}/`)
    try {
      await expect(browser.goto(id, `${baseUrl}/missing`)).rejects.toThrow(
        'HTTP 404',
      )
    } finally {
      await browser.closePage(id)
    }
  }, 15_000)

  test('combines findings and page evidence from every audited journey', async () => {
    const consent = await engine.quickScan(`${baseUrl}/consent`)
    const checkout = await engine.quickScan(`${baseUrl}/checkout`)
    const summary = await engine.summarizeAudit(`${baseUrl}/`, [
      consent,
      checkout,
    ])
    expect(summary.scanType).toBe('deep')
    expect(summary.patterns.some((p) => p.category === 'dark_consent')).toBe(
      true,
    )
    expect(summary.patterns.some((p) => p.category === 'drip_pricing')).toBe(
      true,
    )
    expect(summary.workflowSteps?.map((s) => s.stepNumber)).toEqual([1, 2])
    expect(
      summary.workflowSteps?.every(
        (s) => s.screenshotPath && existsSync(s.screenshotPath),
      ),
    ).toBe(true)
    expect(
      summary.pdfPath &&
        readFileSync(summary.pdfPath).subarray(0, 4).toString(),
    ).toBe('%PDF')
    expect(saved.some((s) => s.id === summary.id)).toBe(true)
    const html = readFileSync(summary.htmlPath!, 'utf8')
    expect(html.match(/src="data:image\/jpeg;base64,/g)).toHaveLength(2)
  }, 30_000)

  test('provides the PDF download offered by the quick-check result page', async () => {
    const result = await engine.quickScan(`${baseUrl}/checkout`)
    expect(
      result.pdfPath && readFileSync(result.pdfPath).subarray(0, 4).toString(),
    ).toBe('%PDF')
    expect(savedOptions.get(result.id)?.pdfPath).toBe(
      result.pdfPath ?? undefined,
    )
    expect(readFileSync(result.htmlPath!, 'utf8')).toContain(
      'src="data:image/jpeg;base64,',
    )
  }, 15_000)

  test('discovers and follows the actual shopping journey without a model', async () => {
    const workflows = await discoverWorkflows(browser, `${baseUrl}/`)
    const checkout = workflows.find((workflow) => workflow.id === 'checkout')
    expect(checkout).toBeDefined()
    const result = await engine.deepScan(`${baseUrl}/`, checkout!)
    expect(result.workflowSteps?.map((s) => s.status)).toEqual([
      'reached',
      'reached',
      'reached',
      'reached',
      'reached',
    ])
    expect(result.workflowSteps?.at(-1)?.url).toBe(`${baseUrl}/checkout`)
    expect(result.patterns.some((p) => p.category === 'drip_pricing')).toBe(
      true,
    )
  }, 60_000)

  test('propagates persistence failures instead of returning an unloadable result', async () => {
    const broken = new TrustenEngine(
      browser,
      undefined,
      {
        ...store,
        saveScan: async () => {
          throw new Error('Storage unavailable')
        },
      },
      reportsDir,
    )
    const workflow: ScanWorkflow = {
      ...COOKIE_CONSENT_WORKFLOW,
      steps: COOKIE_CONSENT_WORKFLOW.steps.slice(0, 1),
    }
    await expect(
      broken.deepScan(`${baseUrl}/consent`, workflow),
    ).rejects.toThrow('Storage unavailable')
  }, 60_000)
})
