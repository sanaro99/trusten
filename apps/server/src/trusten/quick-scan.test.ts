import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { UrgencyScarcityAnalyzer } from './analyzers/urgency-scarcity'
import type { BrowserDriver } from './browser/driver'
import { TrustenEngine } from './index'
import type { ScanStore } from './store'
import type { ScanResult } from './types'

const reportsDir = path.join(process.cwd(), '.tmp-trusten-quick-scan-tests')
afterEach(() => rmSync(reportsDir, { recursive: true, force: true }))

function fixture(
  content: {
    url: string
    title?: string
    html: string
    text: string
    screenshot: string
  },
  cache?: Pick<ScanStore, 'getCachedPageFindings'>,
) {
  const saved: ScanResult[] = []
  const closed: number[] = []
  const browser = {
    newPage: async () => 1,
    closePage: async (id: number) => {
      closed.push(id)
    },
    listPages: async () => [
      { pageId: 1, url: content.url, title: content.title ?? 'Example page' },
    ],
    waitFor: async () => true,
    evaluate: async (_id: number, expression: string) => ({
      value:
        expression === 'document.documentElement.outerHTML'
          ? content.html
          : '[]',
    }),
    contentAsMarkdown: async () => content.text,
    screenshot: async () => ({ data: content.screenshot }),
  } as unknown as BrowserDriver
  const store: ScanStore = {
    saveScan: async (result) => {
      saved.push(result)
    },
    getCachedPageFindings: async () => null,
    cachePageFindings: async () => {},
    ...cache,
  }
  return {
    engine: new TrustenEngine(browser, undefined, store, reportsDir),
    saved,
    closed,
  }
}

describe('quick scan evidence', () => {
  for (const page of [
    {
      title: 'Amazon.com',
      text: 'Click the button below to continue shopping\nContinue shopping\nConditions of Use Privacy Policy',
      code: 'SITE_BLOCKED',
    },
    {
      title: 'Error Page | eBay',
      text: 'SORRY\nSomething went wrong on our end\nPlease go back and try again or go to eBay Homepage.',
      code: 'PAGE_LOAD_FAILED',
    },
  ]) {
    test(`rejects ${page.title} without grading or persisting its access/error page`, async () => {
      const { engine, saved, closed } = fixture({
        url: 'https://shop.example/',
        title: page.title,
        html: `<html><body>${page.text}</body></html>`,
        text: page.text,
        screenshot: Buffer.from('page image').toString('base64'),
      })
      const error = await engine
        .quickScan('https://shop.example/')
        .catch((error) => error)
      expect(error.code).toBe(page.code)
      expect(saved).toHaveLength(0)
      expect(closed).toEqual([1])
    })
  }
  test('keeps an audit homepage associated with its parent before persistence', async () => {
    const { engine, saved } = fixture({
      url: 'https://example.com/',
      html: '<html><body><h1>Example page</h1><p>Visible content for analysis.</p></body></html>',
      text: 'Example page. Visible content for analysis.',
      screenshot: Buffer.from('captured image').toString('base64'),
    })
    const result = await engine.quickScan('https://example.com/', {
      parentAuditId: 'audit-fixture',
    })
    expect(result).toMatchObject({ parentAuditId: 'audit-fixture' })
    expect(saved[0]).toMatchObject({ parentAuditId: 'audit-fixture' })
  })

  test('does not award a clean grade for an empty page', async () => {
    const { engine, saved, closed } = fixture({
      url: 'about:blank',
      html: '',
      text: '',
      screenshot: '',
    })
    await expect(engine.quickScan('https://example.com/')).rejects.toThrow()
    expect(saved).toHaveLength(0)
    expect(closed).toEqual([1])
  })

  test('does not score a bot challenge as the target page', async () => {
    const { engine, saved } = fixture({
      url: 'https://example.com/',
      title: 'Just a moment...',
      html: '<html><body><p>Checking your browser before accessing the site.</p></body></html>',
      text: 'Checking your browser before accessing the site.',
      screenshot: Buffer.from('challenge').toString('base64'),
    })
    await expect(engine.quickScan('https://example.com/')).rejects.toThrow()
    expect(saved).toHaveLength(0)
  })

  test('rejects a verification redirect even when it has enough text', async () => {
    const { engine, saved, closed } = fixture({
      url: 'https://www.temu.com/bgn_verification.html?verifyCode=sample',
      title: 'Temu',
      html: '<html><body><p>Verification content</p></body></html>',
      text: 'Verification content that would otherwise be scored.',
      screenshot: Buffer.from('verification image').toString('base64'),
    })
    await expect(engine.quickScan('https://www.temu.com/')).rejects.toThrow()
    expect(saved).toHaveLength(0)
    expect(closed).toEqual([1])
  })

  test('saves the page screenshot even when no patterns are found', async () => {
    const jpeg = Buffer.from('captured image')
    const { engine, saved } = fixture({
      url: 'https://example.com/',
      html: '<html><body><h1>Example page</h1><p>Visible content for analysis.</p></body></html>',
      text: 'Example page. Visible content for analysis.',
      screenshot: jpeg.toString('base64'),
    })
    const result = await engine.quickScan('https://example.com/')
    expect(saved).toHaveLength(1)
    expect(result.workflowSteps).toHaveLength(1)
    const step = result.workflowSteps![0]
    expect(step.url).toBe('https://example.com/')
    expect(step.status).toBe('observed')
    expect(step.visualCheckAvailable).toBe(false)
    expect(step.screenshotPath).toBeTruthy()
    expect(existsSync(step.screenshotPath!)).toBe(true)
    expect(readFileSync(step.screenshotPath!)).toEqual(jpeg)
  })
})

test('URL quick scans merge cached wording of the same countdown without double-counting', async () => {
  const url = 'https://shop.example/'
  const html =
    '<html><body><div class="countdown">05:00:00</div><p>TODAY ONLY</p></body></html>'
  const text = 'TODAY ONLY 05:00:00'
  const cached = await new UrgencyScarcityAnalyzer().analyze({
    url,
    pageTitle: 'Shop',
    domSnapshot: html,
    visibleText: text,
    screenshotBase64: '',
    networkRequests: [],
    cookies: [],
  })
  const { engine } = fixture(
    {
      url,
      title: 'Shop',
      html,
      text,
      screenshot: Buffer.from('image').toString('base64'),
    },
    {
      getCachedPageFindings: async () => ({
        scanId: 'earlier-scan',
        patterns: cached.patterns.map((p) => ({
          ...p,
          description: 'An earlier description of this same timer',
        })),
        cachedAt: new Date().toISOString(),
      }),
    },
  )
  const result = await engine.quickScan(url)
  expect(
    result.patterns.filter((p) => p.category === 'fake_urgency'),
  ).toHaveLength(1)
}, 20000)
