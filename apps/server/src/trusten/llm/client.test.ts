import { expect, test } from 'bun:test'
import { TrustenLLMClient } from './client'

const screenshot = Buffer.from('image bytes').toString('base64')

test('the default DeepSeek request sends an image to the current vision model', async () => {
  const requests: Array<Record<string, unknown>> = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      requests.push((await request.json()) as Record<string, unknown>)
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
    })
    await client.analyzeForPatterns({
      context: 'A visible page',
      analysisType: 'visual scan',
      screenshotBase64: screenshot,
      requireImage: true,
    })
    expect(requests[0]?.model).toBe('deepseek-flash')
    const messages = requests[0]?.messages as Array<{ content: unknown }>
    expect(JSON.stringify(messages[1]?.content)).toContain('image_url')
  } finally {
    server.stop(true)
  }
})

test('a rejected image cannot turn a text-only retry into visual coverage', async () => {
  let requests = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      requests++
      const body = (await request.json()) as {
        messages: Array<{ content: string | Array<{ type: string }> }>
      }
      if (Array.isArray(body.messages[1]?.content))
        return Response.json(
          { error: 'not a multimodal model' },
          { status: 400 },
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
      model: 'deepseek-v4-flash',
    })
    await expect(
      client.analyzeForPatterns({
        context: 'A visible page',
        analysisType: 'visual scan',
        screenshotBase64: screenshot,
        requireImage: true,
      }),
    ).rejects.toThrow()
    expect(requests).toBe(1)
  } finally {
    server.stop(true)
  }
})
