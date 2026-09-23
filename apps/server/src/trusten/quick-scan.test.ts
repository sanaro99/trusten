import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { BrowserDriver } from './browser/driver'
import { TrustenEngine } from './index'
import type { ScanStore } from './store'
import type { ScanResult } from './types'

const reportsDir = path.join(process.cwd(), '.tmp-trusten-quick-scan-tests')
afterEach(() => rmSync(reportsDir, { recursive: true, force: true }))

function fixture(content: {
  url: string
  title?: string
  html: string
  text: string
  screenshot: string
}) {
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
  }
  return {
    engine: new TrustenEngine(browser, undefined, store, reportsDir),
    saved,
    closed,
  }
}

describe('quick scan evidence', () => {
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
