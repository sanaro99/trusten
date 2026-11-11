import { expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import type { BrowserDriver } from './browser/driver'
import { TrustenEngine } from './index'
import { getTrustenLLM } from './llm/client'
import type { ScanStore } from './store'

test('a captured extension verification screen cannot become a clean website result', async () => {
  let saved = false
  const store: ScanStore = {
    saveScan: async () => {
      saved = true
    },
    cachePageFindings: async () => {},
    getCachedPageFindings: async () => null,
  }
  const engine = new TrustenEngine({} as BrowserDriver, undefined, store)
  const error = await engine
    .analyzeProvidedContent(
      'https://www.temu.com/bgn_verification.html',
      '<html><body>Security Verification: Slide to complete the puzzle</body></html>',
      'Security Verification: Slide to complete the puzzle',
      'Security verification',
    )
    .catch((error) => error)
  expect(error.code).toBe('SITE_BLOCKED')
  expect(saved).toBe(false)
})

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
  { title: 'Shop', text: '', code: 'PAGE_NOT_READY' },
]) {
  test(`does not save a reassuring extension result for ${page.title}: ${page.code}`, async () => {
    let saved = false
    const store: ScanStore = {
      saveScan: async () => {
        saved = true
      },
      cachePageFindings: async () => {},
      getCachedPageFindings: async () => null,
    }
    const engine = new TrustenEngine({} as BrowserDriver, undefined, store)
    const error = await engine
      .analyzeProvidedContent(
        'https://shop.example/',
        `<html><body>${page.text}</body></html>`,
        page.text,
        page.title,
      )
      .catch((error) => error)
    expect(error.code).toBe(page.code)
    expect(saved).toBe(false)
  })
}

test('extension capture keeps reviewable evidence and deduplicates text and visual warnings', async () => {
  const reportsDir = `${process.cwd()}/.tmp-trusten-provided-content`
  const saved: any[] = []
  const store: ScanStore = {
    saveScan: async (result) => {
      saved.push(result)
    },
    cachePageFindings: async () => {},
    getCachedPageFindings: async () => null,
  }
  const client = getTrustenLLM()
  const original = {
    analyze: client.analyzeForPatterns,
    configured: client.isConfigured,
    images: client.supportsImages,
  }
  client.isConfigured = () => true
  client.supportsImages = () => true
  client.analyzeForPatterns = async (input) =>
    JSON.stringify({
      patterns: input.screenshotBase64
        ? [
            {
              category: 'fake_urgency',
              severity: 'high',
              confidence: 0.9,
              description: 'A countdown creates pressure',
              evidence_text: 'TODAY ONLY! $8 PJS 05:00:00',
            },
          ]
        : [],
    })
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 16, 255, 217])
  try {
    const engine = new TrustenEngine(
      {} as BrowserDriver,
      undefined,
      store,
      reportsDir,
    )
    const result = await engine.analyzeProvidedContent(
      'https://shop.example/',
      '<html><body>TODAY ONLY! $8 PJS<div class="countdown">05:00:00</div></body></html>',
      'TODAY ONLY! $8 PJS 05:00:00',
      'Shop',
      { screenshotBase64: jpeg.toString('base64') },
    )
    expect(result.patterns).toHaveLength(1)
    expect(result.workflowSteps).toHaveLength(1)
    expect(result.workflowSteps?.[0].visualCheckAvailable).toBe(true)
    const screenshotPath = saved[0].workflowSteps[0].screenshotPath
    expect(existsSync(screenshotPath)).toBe(true)
    expect(readFileSync(screenshotPath)).toEqual(jpeg)
  } finally {
    client.analyzeForPatterns = original.analyze
    client.isConfigured = original.configured
    client.supportsImages = original.images
    rmSync(reportsDir, { recursive: true, force: true })
  }
})

test('a document title and nonbreaking spaces do not make an empty body scannable', async () => {
  const store: ScanStore = {
    saveScan: async () => {
      throw new Error('must not save')
    },
    cachePageFindings: async () => {},
    getCachedPageFindings: async () => null,
  }
  const engine = new TrustenEngine({} as BrowserDriver, undefined, store)
  const error = await engine
    .analyzeProvidedContent(
      'https://shop.example/',
      '<html><head><title>Shop</title></head><body>&nbsp;&#160;</body></html>',
      '',
      'Shop',
    )
    .catch((error) => error)
  expect(error.code).toBe('PAGE_NOT_READY')
})
