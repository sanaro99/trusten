import { expect, test } from 'bun:test'
import type { BrowserDriver } from '../browser/driver'
import { TrustenEngine } from '../index'
import { getTrustenLLM } from '../llm/client'
import type { ScanStore } from '../store'
import { type AnalyzerContext, DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'
import { combinedAnalysisType, PageLLMBatch } from './page-llm-batch'

const answer = JSON.stringify({
  patterns: [
    {
      category: 'confirmshaming',
      severity: 'medium',
      confidence: 0.9,
      description: 'Guilt-trip decline wording',
      evidence_text: 'No thanks, I hate saving money',
    },
    {
      category: 'drip_pricing',
      severity: 'high',
      confidence: 0.9,
      description: 'A fee appears only at checkout',
      evidence_text: 'Service fee $4.99 added at checkout',
    },
  ],
})

function recordingRunner(raw = answer) {
  const calls: Array<{ analysisType: string; context: string }> = []
  return {
    calls,
    runner: async (params: { analysisType: string; context: string }) => {
      calls.push(params)
      return raw
    },
  }
}

test('requests from every text analyzer on a page go out as one AI call', async () => {
  const { calls, runner } = recordingRunner()
  const batch = new PageLLMBatch(5, runner)
  const names = ['E', 'D', 'C', 'B', 'A']
  const answers = await Promise.all(
    names.map((name) =>
      batch.request({
        analyzer: name,
        analysisType: `focus ${name}`,
        text: 'page',
      }),
    ),
  )
  expect(calls).toHaveLength(1)
  expect(batch.sent).toBe(1)
  expect(answers.every((raw) => raw === answer)).toBe(true)
  for (const name of names)
    expect(calls[0].analysisType).toContain(`focus ${name}`)
})

test('the batch waits for analyzers that have not reported yet', async () => {
  const { calls, runner } = recordingRunner()
  const batch = new PageLLMBatch(3, runner)
  const first = batch.request({ analyzer: 'A', analysisType: 'a', text: 'p' })
  await Promise.resolve()
  expect(calls).toHaveLength(0)
  // One analyzer finishes without needing AI help.
  batch.done()
  await Promise.resolve()
  expect(calls).toHaveLength(0)
  const second = batch.request({ analyzer: 'B', analysisType: 'b', text: 'p' })
  await Promise.all([first, second])
  expect(calls).toHaveLength(1)
  expect(calls[0].analysisType).toContain('1. a')
  expect(calls[0].analysisType).toContain('2. b')
})

test('a page where no analyzer needs AI sends nothing', () => {
  const { calls, runner } = recordingRunner()
  const batch = new PageLLMBatch(2, runner)
  batch.done()
  batch.done()
  expect(calls).toHaveLength(0)
})

test('a single request is sent with its own wording', async () => {
  const { calls, runner } = recordingRunner()
  const batch = new PageLLMBatch(2, runner)
  batch.done()
  await batch.request({ analyzer: 'A', analysisType: 'only this', text: 'p' })
  expect(calls[0].analysisType).toBe('only this')
})

test('the combined request is the same whatever order analyzers ask in', () => {
  const requests = [
    { analyzer: 'Sneaking', analysisType: 'drip', text: 'p' },
    { analyzer: 'Misdirection', analysisType: 'shame', text: 'p' },
    { analyzer: 'Urgency', analysisType: 'urgency', text: 'p' },
  ]
  const forward = combinedAnalysisType(requests)
  expect(combinedAnalysisType([...requests].reverse())).toBe(forward)
  expect(combinedAnalysisType([requests[2], requests[0], requests[1]])).toBe(
    forward,
  )
})

test('a failed AI call reaches every analyzer that asked', async () => {
  const batch = new PageLLMBatch(2, async () => {
    throw new Error('quota')
  })
  const results = await Promise.allSettled([
    batch.request({ analyzer: 'A', analysisType: 'a', text: 'p' }),
    batch.request({ analyzer: 'B', analysisType: 'b', text: 'p' }),
  ])
  expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
})

test('requests for different text are not merged', async () => {
  const { calls, runner } = recordingRunner()
  const batch = new PageLLMBatch(2, runner)
  await Promise.all([
    batch.request({ analyzer: 'A', analysisType: 'a', text: 'one' }),
    batch.request({ analyzer: 'B', analysisType: 'b', text: 'two' }),
  ])
  expect(calls).toHaveLength(2)
})

class FixtureAnalyzer extends BaseAnalyzer {
  override readonly usesTextLLM = true
  constructor(
    public name: string,
    public categories: DarkPatternCategory[],
    private readonly categoryMap: Record<string, DarkPatternCategory>,
  ) {
    super()
  }
  async analyze(context: AnalyzerContext) {
    return {
      patterns: await this.runLLMAnalysis({
        analysisType: this.name,
        context,
        text: context.visibleText,
        categoryMap: this.categoryMap,
        defaultCategory: this.categories[0],
      }),
    }
  }
}

test('each analyzer keeps only its own categories from the shared answer', async () => {
  const { calls, runner } = recordingRunner()
  const batch = new PageLLMBatch(2, runner)
  const context: AnalyzerContext = {
    url: 'https://shop.example/checkout',
    pageTitle: 'Checkout',
    domSnapshot: '',
    visibleText:
      'Service fee $4.99 added at checkout. No thanks, I hate saving money',
    screenshotBase64: '',
    networkRequests: [],
    cookies: [],
    llmBatch: batch,
  }
  const shame = new FixtureAnalyzer(
    'Misdirection',
    [DarkPatternCategory.CONFIRMSHAMING],
    { confirmshaming: DarkPatternCategory.CONFIRMSHAMING },
  )
  const sneak = new FixtureAnalyzer(
    'Sneaking',
    [DarkPatternCategory.DRIP_PRICING],
    { drip_pricing: DarkPatternCategory.DRIP_PRICING },
  )
  const [a, b] = await Promise.all([
    shame.analyze(context),
    sneak.analyze(context),
  ])
  expect(calls).toHaveLength(1)
  expect(a.patterns.map((p) => p.category)).toEqual([
    DarkPatternCategory.CONFIRMSHAMING,
  ])
  expect(b.patterns.map((p) => p.category)).toEqual([
    DarkPatternCategory.DRIP_PRICING,
  ])
})

test('a page check by the engine sends one AI text request, not one per analyzer', async () => {
  const store: ScanStore = {
    saveScan: async () => {},
    cachePageFindings: async () => {},
    getCachedPageFindings: async () => null,
  }
  const client = getTrustenLLM()
  const original = {
    analyze: client.analyzeForPatterns,
    configured: client.isConfigured,
    images: client.supportsImages,
  }
  const textCalls: string[] = []
  client.isConfigured = () => true
  client.supportsImages = () => false
  client.analyzeForPatterns = async (input) => {
    if (!input.screenshotBase64) textCalls.push(input.analysisType)
    return JSON.stringify({ patterns: [] })
  }
  // A checkout page with a subscription plan, an offer and terms: each text
  // analyzer has its own reason to ask the AI.
  const text =
    'Checkout. Order summary. Pro plan $9.99 per month, billed monthly. Exclusive deal: get it today. Subscription terms apply. To cancel, call us Monday to Friday. Payment details.'
  try {
    const engine = new TrustenEngine({} as BrowserDriver, undefined, store)
    await engine.analyzeProvidedContent(
      'https://shop.example/checkout',
      `<html><body><p>${text}</p></body></html>`,
      text,
      'Checkout',
    )
    expect(textCalls).toHaveLength(1)
    // All five text analyzers asked, and every focus area is in that one call.
    for (const area of [
      'urgency_scarcity',
      'confirmshaming',
      'basket_sneaking',
      'roach_motel',
      'fake_hierarchy',
    ])
      expect(textCalls[0]).toContain(area)
  } finally {
    client.analyzeForPatterns = original.analyze
    client.isConfigured = original.configured
    client.supportsImages = original.images
  }
})
