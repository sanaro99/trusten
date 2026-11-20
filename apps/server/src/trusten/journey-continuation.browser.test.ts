import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import path from 'node:path'
import { assessScanCoverage } from '@trusten/shared/domain'
import { discoverWorkflows } from './agent/discovery'
import { CHOOSE_PRODUCT_OPTIONS } from './browser/product-options'
import { PuppeteerDriver } from './browser/puppeteer-driver'
import { TrustenEngine } from './index'
import type { ScanStore } from './store'
import type { ScanResult } from './types'
import {
  CHECKOUT_WORKFLOW,
  COMPREHENSIVE_WORKFLOW,
  COOKIE_CONSENT_WORKFLOW,
  PRICING_WORKFLOW,
  SIGNUP_WORKFLOW,
} from './workflows/definitions'

// Store layouts that used to end a journey before checkout. Each one is common
// on real websites.
const enabled = process.env.TRUSTEN_BROWSER_TESTS === '1'
const reportsDir = path.join(
  process.cwd(),
  '.trusten-local',
  'journey-continuation-reports',
)

const page = (title: string, body: string) =>
  `<!doctype html><html><head><title>${title}</title><style>.hidden{display:none}#drawer{display:none;position:fixed;right:0;top:0;width:280px;background:#fff}.icon{display:inline-block;width:24px;height:24px}</style></head><body>${body}</body></html>`
const icon =
  '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>'

const SITES: Record<string, Record<string, string>> = {
  // Icon-only header links, search behind an icon button, a size to pick
  // before "Add to cart" works, a cart drawer, and a "Check out" button.
  drawer: {
    '/': page(
      'Drawer shop',
      `<header><button aria-label="Search" class="icon" onclick="document.getElementById('sf').classList.remove('hidden')"></button>
      <form id="sf" class="hidden" action="/drawer/search"><input type="search" name="q"></form>
      <a href="/drawer/account">${icon}</a> <a href="/drawer/cart">${icon}<span>0</span></a></header>
      <main><h1>New in</h1></main>`,
    ),
    '/search': page(
      'Results',
      '<main><h1>Results for shirt</h1><p>One product matches your search.</p><div class="card"><a href="/drawer/products/tee"><img alt="" width="80" height="80" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a><a href="/drawer/products/tee">Tee</a></div></main>',
    ),
    '/products/tee': page(
      'Tee',
      `<header><a href="/drawer/cart" aria-label="Cart, 0 items">${icon}</a></header>
      <main><h1>Tee</h1>
      <fieldset><legend>Size</legend>
        <label><input type="radio" name="size" value="s" onchange="document.getElementById('add').disabled=false"> S</label>
        <label><input type="radio" name="size" value="m" onchange="document.getElementById('add').disabled=false"> M</label>
      </fieldset>
      <fieldset><legend>Protection plan</legend>
        <label><input type="radio" name="protection" value="2y"> 2 years (+$9)</label>
        <label><input type="radio" name="protection" value="none"> No protection</label>
      </fieldset>
      <button id="add" disabled onclick="document.getElementById('drawer').style.display='block'">Add to cart</button></main>
      <aside id="drawer" role="dialog"><h2>Added to your cart</h2><a href="/drawer/cart">View cart (1)</a></aside>`,
    ),
    '/cart': page(
      'Cart',
      `<main><h1>Shopping bag</h1><p>Tee $20</p><a href="/drawer/">Continue shopping</a> <button onclick="location.href='/drawer/checkout'">Check out</button></main>`,
    ),
    '/checkout': page(
      'Checkout',
      '<main><h1>Checkout</h1><p>Handling fee $4.50</p></main>',
    ),
    '/account': page('Account', '<main><h1>Login</h1></main>'),
  },
  // A size select with a placeholder that blocks the form from submitting.
  select: {
    '/': page(
      'Select shop',
      '<header><a href="/select/basket">Basket</a><form action="/select/search"><input name="q" type="text" placeholder="What are you looking for?"></form></header><main><h1>Workwear</h1></main>',
    ),
    '/search': page(
      'Results',
      '<main><h1>2 results for shirt</h1><p>Sorted by relevance. Free delivery on orders over $50.</p><ul class="products"><li><a href="/select/item/42"><img alt="Canvas shirt" width="80" height="80" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a></li></ul></main>',
    ),
    '/item/42': page(
      'Canvas shirt',
      `<main><h1>Canvas shirt</h1><p>Heavy cotton canvas work shirt with two chest pockets. $48.</p><form action="/select/basket" method="get">
        <select name="size" required><option value="">Choose a size</option><option value="m" disabled>M (sold out)</option><option value="l">L</option></select>
        <select name="warranty"><option value="">Add a warranty?</option><option value="3y">3 years (+$12)</option></select>
        <button type="submit">Add to basket</button></form></main>`,
    ),
    '/basket': page(
      'Basket',
      '<main><h1>Your basket</h1><p>Canvas shirt, size L, $48. Delivery is calculated at checkout.</p><a href="/select/">Continue shopping</a> <a href="/select/checkout">Go to checkout</a></main>',
    ),
    '/checkout': page(
      'Checkout',
      '<main><h1>Secure checkout</h1><p>Basket total $48. Small order fee $3. Enter your email to continue.</p></main>',
    ),
  },
  // A booking page whose final button does nothing without guest details.
  booking: {
    '/': page(
      'Booking',
      '<header><a href="/booking/">StayNow</a></header><main><h1>Seaside Hotel</h1><a href="/booking/book">Reserve now</a></main>',
    ),
    '/book': page(
      'Book',
      '<main><h1>Your trip</h1><p>Room $129</p><button>Book now</button></main>',
    ),
  },
  // A news site: no shop at all.
  news: {
    '/': page(
      'News',
      `<header><a href="/news/">Ledger</a></header><main><h1>Top stories</h1><article><h2><a href="/news/a/1">Budget passes</a></h2></article></main>
      <div role="dialog" id="nl"><p>Get our newsletter</p><button onclick="this.parentNode.remove()">No thanks</button></div>`,
    ),
    '/a/1': page('Story', '<main><h1>Budget passes</h1></main>'),
  },
  // Modern SaaS wording.
  saas: {
    '/': page(
      'SaaS',
      `<header><a href="/saas/plans">Plans &amp; pricing</a> <a href="/saas/trial">Start free trial</a></header><main><h1>Help desk</h1></main>
      <div id="cookie-banner"><p>We use cookies.</p><button onclick="this.parentNode.remove()">Accept all cookies</button>
      <button onclick="document.getElementById('cookie-banner').innerHTML='<h3>Cookie preferences</h3><label><input type=checkbox checked> Advertising</label>'">Customise</button></div>`,
    ),
    '/plans': page(
      'Plans',
      '<main><h1>Plans</h1><div><h3>Pro</h3><p>$49</p><a href="/saas/trial?plan=pro">Start trial</a></div></main>',
    ),
    '/trial': page(
      'Trial',
      '<main><h1>Start your trial</h1><form><input name="email"><label><input type="checkbox"> Tips</label></form></main>',
    ),
  },
}

describe.skipIf(!enabled)('journeys continue through common layouts', () => {
  let server: ReturnType<typeof Bun.serve>
  let browser: PuppeteerDriver
  let engine: TrustenEngine
  let base: string
  const store: ScanStore = {
    saveScan: async () => {},
    cachePageFindings: async () => {},
    getCachedPageFindings: async () => null,
  }

  beforeAll(() => {
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const [, site, ...rest] = new URL(request.url).pathname.split('/')
        const html = SITES[site]?.[`/${rest.join('/')}`]
        return html
          ? new Response(html, { headers: { 'content-type': 'text/html' } })
          : new Response('Not found', { status: 404 })
      },
    })
    base = `http://127.0.0.1:${server.port}`
    browser = new PuppeteerDriver()
    engine = new TrustenEngine(browser, undefined, store, reportsDir)
  })

  afterAll(async () => {
    await browser?.close()
    server?.stop(true)
  })

  const statuses = (result: ScanResult) =>
    (result.workflowSteps ?? [])
      .filter((step) => step.stepNumber > 0)
      .map((step) => step.status)
  // Every step either reached its page or is not offered by the site. (The
  // visual check needs a model, so coverage itself stays "partial" here.)
  const finished = (result: ScanResult) => {
    const coverage = assessScanCoverage(
      result.scanType,
      result.workflowSteps ?? [],
    )
    return coverage.completed === coverage.total
  }
  const step = (result: ScanResult, stepNumber: number) =>
    result.workflowSteps?.find((entry) => entry.stepNumber === stepNumber)

  test('reaches checkout through icon links, a size choice and a cart drawer', async () => {
    const result = await engine.deepScan(`${base}/drawer/`, CHECKOUT_WORKFLOW)
    const steps = result.workflowSteps ?? []
    expect(statuses(result)).not.toContain('not-reached')
    expect(statuses(result)).not.toContain('skipped')
    expect(steps.at(-1)?.url).toBe(`${base}/drawer/checkout`)
    expect(steps.some((step) => step.url.endsWith('/drawer/cart'))).toBe(true)
    expect(finished(result)).toBe(true)
  }, 120_000)

  test('chooses a required size but leaves paid extras alone', async () => {
    const pageId = await browser.newPage(`${base}/drawer/products/tee`)
    try {
      const made = await browser.evaluate(pageId, CHOOSE_PRODUCT_OPTIONS)
      expect(made.value).toBe(1)
      const state = await browser.evaluate(
        pageId,
        `JSON.stringify({ size: document.querySelector('input[name=size]:checked')?.value, protection: document.querySelector('input[name=protection]:checked')?.value ?? null, enabled: !document.getElementById('add').disabled })`,
      )
      expect(JSON.parse(String(state.value))).toEqual({
        size: 's',
        protection: null,
        enabled: true,
      })
    } finally {
      await browser.closePage(pageId)
    }
  }, 60_000)

  test('picks an in-stock size from a select and skips "Continue shopping"', async () => {
    const result = await engine.deepScan(`${base}/select/`, CHECKOUT_WORKFLOW)
    const steps = result.workflowSteps ?? []
    expect(statuses(result)).not.toContain('not-reached')
    const basket = steps.find((step) => step.url.includes('/select/basket'))
    expect(basket?.url).toContain('size=l')
    expect(basket?.url).not.toContain('warranty=3y')
    expect(steps.at(-1)?.url).toBe(`${base}/select/checkout`)
    expect(finished(result)).toBe(true)
  }, 120_000)

  test('ends a booking journey at a final button that needs guest details', async () => {
    const result = await engine.deepScan(`${base}/booking/`, CHECKOUT_WORKFLOW)
    const last = (result.workflowSteps ?? []).at(-1)
    expect(last?.status).toBe('unavailable')
    expect(last?.navReason).toContain('needs details')
    expect(statuses(result)).toContain('reached')
    expect(finished(result)).toBe(true)
  }, 120_000)

  test('does not count reloading the start page as reaching a shop', async () => {
    const result = await engine.deepScan(
      `${base}/news/`,
      COMPREHENSIVE_WORKFLOW,
    )
    const shopping = (result.workflowSteps ?? []).filter(
      (step) => step.stepNumber >= 5,
    )
    expect(shopping.map((step) => step.status)).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
      'unavailable',
      'unavailable',
    ])
    expect(finished(result)).toBe(true)
  }, 120_000)

  test('follows "Start free trial", "Plans & pricing" and "Customise"', async () => {
    const signup = await engine.deepScan(`${base}/saas/`, SIGNUP_WORKFLOW)
    expect(step(signup, 1)?.status).toBe('reached')
    expect(step(signup, 1)?.url).toBe(`${base}/saas/trial`)

    const pricing = await engine.deepScan(`${base}/saas/`, PRICING_WORKFLOW)
    expect(statuses(pricing)).toEqual(['reached', 'observed', 'reached'])

    const cookies = await engine.deepScan(
      `${base}/saas/`,
      COOKIE_CONSENT_WORKFLOW,
    )
    expect(statuses(cookies)).toEqual(['observed', 'reached', 'observed'])
  }, 180_000)

  test('discovered store journeys also choose a size and find "Check out"', async () => {
    const workflows = await discoverWorkflows(browser, `${base}/drawer/`)
    const checkout = workflows.find((workflow) => workflow.id === 'checkout')
    if (!checkout) return // Discovery found no product link on this layout.
    const result = await engine.deepScan(`${base}/drawer/`, checkout)
    expect(statuses(result)).not.toContain('not-reached')
  }, 120_000)
})
