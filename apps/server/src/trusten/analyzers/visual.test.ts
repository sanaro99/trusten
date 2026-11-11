import { expect, test } from 'bun:test'
import { TrustenLLMClient } from '../llm/client'
import { type AnalyzerContext, DarkPatternCategory } from '../types'
import { VisualAnalyzer } from './visual'

const context: AnalyzerContext = {
  url: 'https://example.com/',
  pageTitle: 'Example',
  domSnapshot: '<main>Choose an option</main>',
  visibleText: 'Choose an option',
  screenshotBase64: Buffer.from('image bytes').toString('base64'),
  networkRequests: [],
  cookies: [],
}

test('visual coverage means the screenshot reached a vision-capable model', async () => {
  let imageReceived = false
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as {
        messages: Array<{ content: unknown }>
      }
      imageReceived = JSON.stringify(body.messages[1]?.content).includes(
        'image_url',
      )
      return Response.json({
        choices: [{ message: { content: '{"patterns":[]}' } }],
      })
    },
  })
  try {
    const client = new TrustenLLMClient({
      provider: 'deepseek',
      apiKey: 'fixture-key',
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      model: 'deepseek-flash',
    })
    const result = await new VisualAnalyzer(client).analyze(context)
    expect(result.metadata?.visualCheckAvailable).toBe(true)
    expect(imageReceived).toBe(true)
  } finally {
    server.stop(true)
  }
})

test('a text-only model leaves visual coverage unavailable', async () => {
  const client = new TrustenLLMClient({
    provider: 'nvidia-nim',
    apiKey: 'fixture-key',
    model: 'meta/llama-3.1-70b-instruct',
  })
  const result = await new VisualAnalyzer(client).analyze(context)
  expect(result.metadata?.visualCheckAvailable).toBe(false)
})

test('a malformed vision response does not count as visual coverage', async () => {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      Response.json({ choices: [{ message: { content: 'unusable reply' } }] }),
  })
  try {
    const client = new TrustenLLMClient({
      provider: 'deepseek',
      apiKey: 'fixture-key',
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      model: 'deepseek-flash',
    })
    const result = await new VisualAnalyzer(client).analyze(context)
    expect(result.metadata?.visualCheckAvailable).toBe(false)
  } finally {
    server.stop(true)
  }
})

test('a model cannot turn a per-customer quantity limit into low stock or invent a category', async () => {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                patterns: [
                  {
                    category: 'fake_scarcity',
                    severity: 'medium',
                    confidence: 0.9,
                    description: 'Only two are left',
                    evidence_text: '(Limit 2)',
                  },
                  {
                    category: 'invented_category',
                    severity: 'high',
                    confidence: 0.9,
                    description: 'Invented',
                    evidence_text: 'Shop',
                  },
                  {
                    category: 'fake_urgency',
                    severity: 'high',
                    confidence: 0.9,
                    description: 'Countdown creates time pressure',
                    evidence_text: 'TODAY ONLY! 05:00:00',
                  },
                ],
              }),
            },
          },
        ],
      }),
  })
  try {
    const client = new TrustenLLMClient({
      provider: 'deepseek',
      apiKey: 'fixture-key',
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      model: 'deepseek-flash',
    })
    const result = await new VisualAnalyzer(client).analyze({
      ...context,
      visibleText: 'TODAY ONLY! $8 PJS (Limit 2) 05:00:00',
    })
    expect(result.metadata?.visualCheckAvailable).toBe(true)
    expect(result.patterns.map((p) => p.category)).toEqual([
      DarkPatternCategory.FAKE_URGENCY,
    ])
  } finally {
    server.stop(true)
  }
})

test('model categories require evidence beyond ordinary delivery copy, discounts, and timers', async () => {
  const claims = [
    [
      'drip_pricing',
      'NEED IT BY SATURDAY? Select Saturday Delivery at Checkout!',
    ],
    ['fake_hierarchy', 'Limited time deal 05:00:00'],
    ['fake_urgency', 'Was $49.99, now $29.99'],
  ]
  const client = {
    isConfigured: () => true,
    supportsImages: () => true,
    analyzeForPatterns: async () =>
      JSON.stringify({
        patterns: claims.map(([category, evidence_text]) => ({
          category,
          evidence_text,
          severity: 'high',
          confidence: 0.95,
          description: 'Model claim',
        })),
      }),
  } as unknown as TrustenLLMClient
  expect(
    (await new VisualAnalyzer(client).analyze(context)).patterns,
  ).toHaveLength(0)
})
