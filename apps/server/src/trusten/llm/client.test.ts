import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { TrustenLLMClient } from './client'

const screenshot = Buffer.from('image bytes').toString('base64')

const environmentNames = [
  'TRUSTEN_LLM_PROVIDER',
  'TRUSTEN_LLM_VISION',
  'NVIDIA_NIM_API_KEY',
  'TRUSTEN_GEMINI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_BASE_URL',
  'DEEPSEEK_API_KEY',
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'GROQ_BASE_URL',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_MODEL',
  'CLOUDFLARE_BASE_URL',
]
let environment: Record<string, string | undefined>
beforeEach(() => {
  environment = Object.fromEntries(
    environmentNames.map((name) => [name, process.env[name]]),
  )
  for (const name of environmentNames) delete process.env[name]
})
afterEach(() => {
  for (const name of environmentNames) {
    const value = environment[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

const imageMessages = [
  {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: 'Read the screenshot' },
      {
        type: 'image_url' as const,
        image_url: { url: `data:image/jpeg;base64,${screenshot}` },
      },
    ],
  },
]

function captureRequests(
  respond?: (url: string, body: Record<string, unknown>) => Response,
) {
  const requests: Array<{
    url: string
    authorization: string | null
    body: Record<string, unknown>
  }> = []
  const implementation = Object.assign(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const url = String(input)
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      requests.push({
        url,
        authorization: new Headers(init?.headers).get('Authorization'),
        body,
      })
      return (
        respond?.(url, body) ??
        Response.json({ choices: [{ message: { content: 'image analyzed' } }] })
      )
    },
    { preconnect: fetch.preconnect },
  )
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(implementation)
  return { requests, restore: () => fetchSpy.mockRestore() }
}

test('Cloudflare sends an authenticated screenshot to the account-specific endpoint', async () => {
  process.env.TRUSTEN_LLM_PROVIDER = 'cloudflare'
  process.env.CLOUDFLARE_API_TOKEN = 'cloudflare-fixture-token'
  process.env.CLOUDFLARE_ACCOUNT_ID = 'fixture-account'
  const wire = captureRequests()
  try {
    const client = new TrustenLLMClient()
    expect(client.isConfigured()).toBe(true)
    expect(client.supportsImages()).toBe(true)
    expect(
      await client.complete({ messages: imageMessages, requireImage: true }),
    ).toBe('image analyzed')
    expect(wire.requests[0]?.url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/fixture-account/ai/v1/chat/completions',
    )
    expect(wire.requests[0]?.authorization).toBe(
      'Bearer cloudflare-fixture-token',
    )
    expect(wire.requests[0]?.body.messages).toEqual(imageMessages)
  } finally {
    wire.restore()
  }
})

test('Cloudflare requires an account ID as well as an API token', () => {
  process.env.TRUSTEN_LLM_PROVIDER = 'cloudflare'
  process.env.CLOUDFLARE_API_TOKEN = 'fixture-token'
  expect(new TrustenLLMClient().isConfigured()).toBe(false)
  process.env.GOOGLE_API_KEY = 'fixture-google-key'
  delete process.env.TRUSTEN_LLM_PROVIDER
  expect(new TrustenLLMClient().provider).toBe('gemini')
})

test('Groq uses its vision model and completion-token parameter', async () => {
  process.env.TRUSTEN_LLM_PROVIDER = 'groq'
  process.env.GROQ_API_KEY = 'groq-fixture-key'
  const wire = captureRequests()
  try {
    const client = new TrustenLLMClient()
    expect(client.supportsImages()).toBe(true)
    await client.complete({
      messages: imageMessages,
      requireImage: true,
      maxTokens: 256,
    })
    expect(wire.requests[0]?.url).toBe(
      'https://api.groq.com/openai/v1/chat/completions',
    )
    expect(wire.requests[0]?.authorization).toBe('Bearer groq-fixture-key')
    expect(wire.requests[0]?.body.max_completion_tokens).toBe(256)
    expect(wire.requests[0]?.body.messages).toEqual(imageMessages)
    process.env.GROQ_MODEL = 'openai/gpt-oss-120b'
    expect(new TrustenLLMClient().supportsImages()).toBe(false)
  } finally {
    wire.restore()
  }
})

test('Gemini accepts Applination credentials and omits unsupported Gemini 3 sampling controls', async () => {
  process.env.TRUSTEN_LLM_PROVIDER = 'gemini'
  process.env.GEMINI_MODEL = 'gemini-3.8-flash'
  process.env.GOOGLE_API_KEY = 'google-fixture-key'
  const wire = captureRequests()
  try {
    const client = new TrustenLLMClient()
    expect(client.isConfigured()).toBe(true)
    await client.complete({
      messages: imageMessages,
      requireImage: true,
      maxTokens: 256,
    })
    expect(wire.requests[0]?.authorization).toBe('Bearer google-fixture-key')
    expect(wire.requests[0]?.body.temperature).toBeUndefined()
    expect(wire.requests[0]?.body.reasoning_effort).toBe('low')
    expect(wire.requests[0]?.body.max_tokens).toBe(256)
  } finally {
    wire.restore()
  }
})

test('Gemini Flash disables thinking so the output budget is available for scan JSON', async () => {
  process.env.TRUSTEN_LLM_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'fixture-key'
  const wire = captureRequests()
  try {
    await new TrustenLLMClient().complete({
      messages: imageMessages,
      requireImage: true,
      maxTokens: 512,
    })
    expect(wire.requests[0]?.body.reasoning_effort).toBe('none')
    expect(wire.requests[0]?.body.max_tokens).toBe(512)
  } finally {
    wire.restore()
  }
})

test('a payment failure and image rejection fall back with the original screenshot and provider overrides', async () => {
  process.env.CLOUDFLARE_API_TOKEN = 'cf-fixture-token'
  process.env.CLOUDFLARE_ACCOUNT_ID = 'fixture-account'
  process.env.CLOUDFLARE_BASE_URL = 'https://fixture.test/cf'
  process.env.CLOUDFLARE_MODEL = 'vision-fixture-rejected'
  process.env.GROQ_API_KEY = 'groq-fixture-key'
  process.env.GROQ_BASE_URL = 'https://fixture.test/groq'
  process.env.GROQ_MODEL = 'qwen/qwen3.8-27b'
  const wire = captureRequests((url) => {
    if (url.includes('/primary/'))
      return Response.json({ error: 'Insufficient Balance' }, { status: 402 })
    if (url.includes('/cf/'))
      return Response.json(
        { error: 'image input is unsupported' },
        { status: 400 },
      )
    return Response.json({
      choices: [{ message: { content: 'image analyzed' } }],
    })
  })
  try {
    const client = new TrustenLLMClient({
      provider: 'deepseek',
      apiKey: 'primary-key',
      baseUrl: 'https://fixture.test/primary',
    })
    expect(
      await client.complete({ messages: imageMessages, requireImage: true }),
    ).toBe('image analyzed')
    expect(wire.requests.map((r) => r.url)).toEqual([
      'https://fixture.test/primary/chat/completions',
      'https://fixture.test/cf/chat/completions',
      'https://fixture.test/groq/chat/completions',
    ])
    expect(wire.requests.map((r) => r.authorization)).toEqual([
      'Bearer primary-key',
      'Bearer cf-fixture-token',
      'Bearer groq-fixture-key',
    ])
    for (const request of wire.requests)
      expect(request.body.messages).toEqual(imageMessages)
    expect(wire.requests[1]?.body.model).toBe('vision-fixture-rejected')
  } finally {
    wire.restore()
  }
})

test('a text-only primary can use a configured vision fallback for pattern analysis', async () => {
  process.env.GEMINI_API_KEY = 'gemini-fixture-key'
  const wire = captureRequests()
  try {
    const client = new TrustenLLMClient({
      provider: 'nvidia-nim',
      apiKey: 'nim-fixture-key',
    })
    expect(client.supportsImages()).toBe(true)
    await client.analyzeForPatterns({
      context: 'page',
      analysisType: 'visual',
      screenshotBase64: screenshot,
      requireImage: true,
    })
    expect(wire.requests).toHaveLength(1)
    expect(wire.requests[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    )
    expect(JSON.stringify(wire.requests[0]?.body.messages)).toContain(
      'image_url',
    )
  } finally {
    wire.restore()
  }
})

test('a per-call provider override uses that provider credentials and endpoint', async () => {
  process.env.GROQ_API_KEY = 'groq-fixture-key'
  const wire = captureRequests()
  try {
    const client = new TrustenLLMClient({
      provider: 'deepseek',
      apiKey: 'primary-key',
      baseUrl: 'https://fixture.test/primary',
    })
    await client.complete({
      provider: 'groq',
      messages: imageMessages,
      requireImage: true,
    })
    expect(wire.requests[0]?.url).toBe(
      'https://api.groq.com/openai/v1/chat/completions',
    )
    expect(wire.requests[0]?.authorization).toBe('Bearer groq-fixture-key')
  } finally {
    wire.restore()
  }
})

test('exhausted vision providers cannot succeed by retrying without the image', async () => {
  process.env.GEMINI_API_KEY = 'fixture-gemini-key'
  process.env.GEMINI_MODEL = 'gemini-fixture-rejected'
  const wire = captureRequests((_url, body) => {
    if (JSON.stringify(body.messages).includes('image_url'))
      return Response.json(
        { error: 'image input is unsupported' },
        { status: 400 },
      )
    return Response.json({
      choices: [{ message: { content: 'text-only success' } }],
    })
  })
  try {
    const client = new TrustenLLMClient({
      provider: 'deepseek',
      apiKey: 'fixture-key',
      model: 'vision-primary-rejected',
    })
    await expect(
      client.complete({ messages: imageMessages, requireImage: true }),
    ).rejects.toThrow()
    expect(wire.requests).toHaveLength(2)
    for (const request of wire.requests)
      expect(request.body.messages).toEqual(imageMessages)
  } finally {
    wire.restore()
  }
})

test('a required screenshot cannot be omitted by the caller', async () => {
  const wire = captureRequests()
  try {
    const client = new TrustenLLMClient({
      provider: 'gemini',
      apiKey: 'fixture-key',
    })
    await expect(
      client.complete({
        messages: [{ role: 'user', content: 'no screenshot' }],
        requireImage: true,
      }),
    ).rejects.toThrow()
    expect(wire.requests).toHaveLength(0)
  } finally {
    wire.restore()
  }
})

test('auto-detection prefers configured alternatives over DeepSeek', () => {
  process.env.DEEPSEEK_API_KEY = 'deepseek-fixture-key'
  process.env.GROQ_API_KEY = 'groq-fixture-key'
  expect(new TrustenLLMClient().provider).toBe('groq')
})

test('a failed client does not disable a newly configured provider client', async () => {
  const wire = captureRequests((url) =>
    url.includes('unavailable')
      ? Response.json({ error: 'unavailable' }, { status: 503 })
      : Response.json({ choices: [{ message: { content: 'recovered' } }] }),
  )
  try {
    const failed = new TrustenLLMClient({
      provider: 'gemini',
      apiKey: 'old-key',
      baseUrl: 'https://fixture.test/unavailable',
    })
    for (let i = 0; i < 3; i++)
      await expect(
        failed.complete({ messages: imageMessages, requireImage: true }),
      ).rejects.toThrow()
    const fresh = new TrustenLLMClient({
      provider: 'gemini',
      apiKey: 'new-key',
      baseUrl: 'https://fixture.test/available',
    })
    expect(
      await fresh.complete({ messages: imageMessages, requireImage: true }),
    ).toBe('recovered')
  } finally {
    wire.restore()
  }
})

test('partial client configuration inherits provider credentials and endpoint from the environment', async () => {
  process.env.GEMINI_API_KEY = 'environment-fixture-key'
  process.env.GEMINI_BASE_URL = 'https://fixture.test/environment'
  const wire = captureRequests()
  try {
    const client = new TrustenLLMClient({
      provider: 'gemini',
      model: 'gemini-configured-override',
      apiKey: undefined,
    })
    await client.complete({ messages: imageMessages, requireImage: true })
    expect(wire.requests[0]?.url).toBe(
      'https://fixture.test/environment/chat/completions',
    )
    expect(wire.requests[0]?.authorization).toBe(
      'Bearer environment-fixture-key',
    )
    expect(wire.requests[0]?.body.model).toBe('gemini-configured-override')
  } finally {
    wire.restore()
  }
})

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
