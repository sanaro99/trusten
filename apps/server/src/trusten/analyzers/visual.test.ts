import { expect, test } from 'bun:test'
import { TrustenLLMClient } from '../llm/client'
import type { AnalyzerContext } from '../types'
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
