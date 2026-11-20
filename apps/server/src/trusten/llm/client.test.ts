import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { retryDelayFromBody, TrustenLLMClient } from './client'

const screenshot = Buffer.from('image bytes').toString('base64')

const environmentNames = [
  'TRUSTEN_LLM_PROVIDER',
  'TRUSTEN_LLM_VISION',
  'NVIDIA_NIM_API_KEY',
  'NVIDIA_NIM_MODEL',
  'TRUSTEN_GEMINI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_BASE_URL',
  'DEEPSEEK_API_KEY',
  'OLLAMA_MODEL',
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
      provider: 'openrouter',
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
      model: 'meta/llama-3.3-70b-instruct',
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
      provider: 'openrouter',
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
      provider: 'openrouter',
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

test('leftover DeepSeek settings are ignored', () => {
  process.env.TRUSTEN_LLM_PROVIDER = 'deepseek'
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

test('the default OpenRouter request sends an image to a vision model', async () => {
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
      provider: 'openrouter',
      apiKey: 'fixture-key',
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
    })
    await client.analyzeForPatterns({
      context: 'A visible page',
      analysisType: 'visual scan',
      screenshotBase64: screenshot,
      requireImage: true,
    })
    expect(requests[0]?.model).toBe('google/gemini-2.5-flash')
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
      provider: 'openrouter',
      apiKey: 'fixture-key',
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      model: 'vision-fixture-rejected',
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

test('the default Nvidia model is a current model that reads screenshots', async () => {
  const wire = captureRequests()
  try {
    const client = new TrustenLLMClient({
      provider: 'nvidia-nim',
      apiKey: 'nim-fixture-key',
    })
    expect(client.supportsImages()).toBe(true)
    await client.complete({ messages: imageMessages, requireImage: true })
    expect(wire.requests[0]?.url).toBe(
      'https://integrate.api.nvidia.com/v1/chat/completions',
    )
    expect(wire.requests[0]?.body.model).toBe(
      'nvidia/nemotron-3.5-super-vl-120b-a12b',
    )
    // Without this the model reasons first and often returns no answer.
    expect(wire.requests[0]?.body.chat_template_kwargs).toEqual({
      enable_thinking: false,
    })
  } finally {
    wire.restore()
  }
})

function timesOutFirst(count: number) {
  let calls = 0
  return captureRequests(() => {
    calls++
    if (calls <= count)
      throw new DOMException('The operation timed out.', 'TimeoutError')
    return Response.json({ choices: [{ message: { content: 'answered' } }] })
  })
}

test('a screenshot request that hangs once is sent again and succeeds', async () => {
  const wire = timesOutFirst(1)
  try {
    const client = new TrustenLLMClient({
      provider: 'nvidia-nim',
      apiKey: 'nim-fixture-key',
    })
    await expect(
      client.complete({ messages: imageMessages, requireImage: true }),
    ).resolves.toBe('answered')
    expect(wire.requests).toHaveLength(2)
  } finally {
    wire.restore()
  }
})

test('a screenshot request is retried only once', async () => {
  const wire = timesOutFirst(5)
  try {
    const client = new TrustenLLMClient({
      provider: 'nvidia-nim',
      apiKey: 'nim-fixture-key',
    })
    await expect(
      client.complete({ messages: imageMessages, requireImage: true }),
    ).rejects.toThrow()
    expect(wire.requests).toHaveLength(2)
  } finally {
    wire.restore()
  }
})

test('text requests and callers with their own time budget are not retried', async () => {
  for (const options of [
    { messages: [{ role: 'user' as const, content: 'Hello' }] },
    { messages: imageMessages, requireImage: true, timeoutMs: 20_000 },
  ]) {
    const wire = timesOutFirst(5)
    try {
      const client = new TrustenLLMClient({
        provider: 'nvidia-nim',
        apiKey: 'nim-fixture-key',
      })
      await expect(client.complete(options)).rejects.toThrow()
      // Text requests may still move on to the local Ollama fallback.
      expect(
        wire.requests.filter((r) => r.url.includes('nvidia.com')),
      ).toHaveLength(1)
    } finally {
      wire.restore()
    }
  }
})

const retiredBody = {
  type: 'about:blank',
  title: 'Gone',
  status: 410,
  detail:
    "The model 'meta/llama-3.2-11b-vision-instruct' has reached its end of life on 2026-11-05T09:00:00Z and is no longer available.",
}

for (const requireImage of [true, false])
  test(`a retired model is skipped at once (screenshot ${requireImage ? 'required' : 'optional'})`, async () => {
    process.env.GEMINI_API_KEY = 'gemini-fixture-key'
    const wire = captureRequests((url) =>
      url.includes('nvidia')
        ? Response.json(retiredBody, { status: 410 })
        : Response.json({ choices: [{ message: { content: 'fallback' } }] }),
    )
    try {
      const client = new TrustenLLMClient({
        provider: 'nvidia-nim',
        apiKey: 'nim-fixture-key',
      })
      for (let i = 0; i < 2; i++)
        expect(
          await client.complete({ messages: imageMessages, requireImage }),
        ).toBe('fallback')
      const nvidiaCalls = wire.requests.filter((r) => r.url.includes('nvidia'))
      expect(nvidiaCalls).toHaveLength(1)
    } finally {
      wire.restore()
    }
  })

test('a rate-limited request waits out Retry-After instead of failing', async () => {
  let calls = 0
  const wire = captureRequests(() => {
    calls++
    return calls === 1
      ? new Response('{"error":"quota"}', {
          status: 429,
          headers: { 'retry-after': '0' },
        })
      : Response.json({ choices: [{ message: { content: 'after wait' } }] })
  })
  try {
    const client = new TrustenLLMClient({
      provider: 'groq',
      apiKey: 'groq-fixture-key',
    })
    await expect(
      client.complete({ messages: [{ role: 'user', content: 'Hello' }] }),
    ).resolves.toBe('after wait')
    expect(wire.requests).toHaveLength(2)
    // A busy provider is not benched: the next request is still sent.
    await expect(
      client.complete({ messages: [{ role: 'user', content: 'Again' }] }),
    ).resolves.toBe('after wait')
  } finally {
    wire.restore()
  }
})

test('an identical request reuses the earlier answer', async () => {
  const wire = captureRequests()
  try {
    const client = new TrustenLLMClient({
      provider: 'groq',
      apiKey: 'groq-fixture-key',
    })
    const options = { messages: [{ role: 'user' as const, content: 'Same' }] }
    await client.complete(options)
    await client.complete(options)
    expect(wire.requests).toHaveLength(1)
  } finally {
    wire.restore()
  }
})

test('parallel requests to one provider are sent a few at a time', async () => {
  let active = 0
  let peak = 0
  const implementation = Object.assign(
    async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 20))
      active--
      return Response.json({ choices: [{ message: { content: 'ok' } }] })
    },
    { preconnect: fetch.preconnect },
  )
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(implementation)
  try {
    const client = new TrustenLLMClient({
      provider: 'groq',
      apiKey: 'groq-fixture-key',
    })
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        client.complete({ messages: [{ role: 'user', content: `Page ${i}` }] }),
      ),
    )
    expect(peak).toBeLessThanOrEqual(3)
  } finally {
    fetchSpy.mockRestore()
  }
})

function fakeClock() {
  let now = 1_000_000
  const sleeps: number[] = []
  return {
    sleeps,
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      now += ms
    },
  }
}

const quota = (headers: Record<string, string> = {}) =>
  new Response('{"error":"quota"}', { status: 429, headers })
const ok = (content = 'ok') =>
  Response.json({ choices: [{ message: { content } }] })

test('repeated 429s without Retry-After back off with doubling waits until the provider answers', async () => {
  let calls = 0
  const wire = captureRequests(() => (++calls <= 3 ? quota() : ok('finally')))
  const clock = fakeClock()
  try {
    const client = new TrustenLLMClient(
      { provider: 'groq', apiKey: 'groq-fixture-key' },
      { ...clock, requestsPerMinute: () => 0 },
    )
    await expect(
      client.complete({ messages: [{ role: 'user', content: 'Hi' }] }),
    ).resolves.toBe('finally')
    expect(wire.requests).toHaveLength(4)
    expect(clock.sleeps).toEqual([5_000, 10_000, 20_000])
  } finally {
    wire.restore()
  }
})

test('Retry-After sets the wait, even past the default backoff', async () => {
  let calls = 0
  const wire = captureRequests(() =>
    ++calls === 1 ? quota({ 'retry-after': '42' }) : ok(),
  )
  const clock = fakeClock()
  try {
    const client = new TrustenLLMClient(
      { provider: 'groq', apiKey: 'groq-fixture-key' },
      { ...clock, requestsPerMinute: () => 0 },
    )
    await client.complete({ messages: [{ role: 'user', content: 'Hi' }] })
    expect(clock.sleeps).toEqual([42_000])
  } finally {
    wire.restore()
  }
})

test('a rate limit longer than the wait limit moves on to the next provider at once', async () => {
  process.env.NVIDIA_NIM_API_KEY = 'nvidia-fixture-key'
  const wire = captureRequests((url) =>
    url.includes('groq') ? quota({ 'retry-after': '3600' }) : ok('fallback'),
  )
  const clock = fakeClock()
  try {
    const client = new TrustenLLMClient(
      { provider: 'groq', apiKey: 'groq-fixture-key' },
      { ...clock, requestsPerMinute: () => 0 },
    )
    await expect(
      client.complete({ messages: [{ role: 'user', content: 'Hi' }] }),
    ).resolves.toBe('fallback')
    expect(clock.sleeps).toEqual([])
  } finally {
    wire.restore()
  }
})

test('a provider that keeps answering 429 is never benched', async () => {
  let groqCalls = 0
  const wire = captureRequests((url) => {
    if (!url.includes('groq')) return new Response('down', { status: 503 })
    groqCalls++
    return groqCalls <= 20 ? quota() : ok('back')
  })
  const clock = fakeClock()
  try {
    const client = new TrustenLLMClient(
      { provider: 'groq', apiKey: 'groq-fixture-key' },
      { ...clock, requestsPerMinute: () => 0, rateLimitRetries: 0 },
    )
    // Twenty rate-limited requests in a row: well past the failure strikes
    // that bench a provider that is down.
    for (let i = 0; i < 20; i++) {
      await expect(
        client.complete({ messages: [{ role: 'user', content: `Try ${i}` }] }),
      ).rejects.toThrow()
    }
    await expect(
      client.complete({ messages: [{ role: 'user', content: 'Again' }] }),
    ).resolves.toBe('back')
    expect(groqCalls).toBe(21)
  } finally {
    wire.restore()
  }
})

test('a provider that is down is still benched after a few failures', async () => {
  const wire = captureRequests(() => new Response('down', { status: 503 }))
  const clock = fakeClock()
  try {
    const client = new TrustenLLMClient(
      { provider: 'groq', apiKey: 'groq-fixture-key' },
      { ...clock, requestsPerMinute: () => 0 },
    )
    for (let i = 0; i < 4; i++) {
      await client
        .complete({ messages: [{ role: 'user', content: `Try ${i}` }] })
        .catch(() => {})
    }
    expect(wire.requests.filter((r) => r.url.includes('groq'))).toHaveLength(3)
  } finally {
    wire.restore()
  }
})

test('requests are paced to the provider per-minute limit instead of hitting 429', async () => {
  const wire = captureRequests()
  const clock = fakeClock()
  try {
    const client = new TrustenLLMClient(
      { provider: 'gemini', apiKey: 'gemini-fixture-key' },
      { ...clock, requestsPerMinute: () => 2 },
    )
    const start = clock.now()
    const sentAt: number[] = []
    for (let i = 0; i < 5; i++) {
      await client.complete({ messages: [{ role: 'user', content: `P${i}` }] })
      sentAt.push(clock.now() - start)
    }
    expect(wire.requests).toHaveLength(5)
    expect(sentAt).toEqual([0, 0, 60_000, 60_000, 120_000])
  } finally {
    wire.restore()
  }
})

test('parallel requests cannot overbook the per-minute limit', async () => {
  let now = 0
  const sentAt: number[] = []
  const wire = captureRequests(() => {
    sentAt.push(now)
    return ok()
  })
  try {
    const client = new TrustenLLMClient(
      { provider: 'gemini', apiKey: 'gemini-fixture-key' },
      {
        concurrency: 10,
        requestsPerMinute: () => 3,
        now: () => now,
        // Time only moves when a waiting request sleeps.
        sleep: async (ms) => {
          await Promise.resolve()
          now += ms
        },
      },
    )
    await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        client.complete({ messages: [{ role: 'user', content: `P${i}` }] }),
      ),
    )
    expect(wire.requests).toHaveLength(7)
    // No rolling minute ever holds more than three requests.
    expect(sentAt.slice(0, 3)).toEqual([0, 0, 0])
    for (let i = 3; i < sentAt.length; i++)
      expect(sentAt[i] - sentAt[i - 3]).toBeGreaterThanOrEqual(60_000)
  } finally {
    wire.restore()
  }
})

test('each provider has a free-tier pace by default, and TRUSTEN_LLM_RPM overrides it', async () => {
  const previous = process.env.TRUSTEN_LLM_RPM
  const wire = captureRequests()
  try {
    delete process.env.TRUSTEN_LLM_RPM
    const run = async () => {
      const clock = fakeClock()
      const client = new TrustenLLMClient(
        { provider: 'gemini', apiKey: 'gemini-fixture-key' },
        clock,
      )
      for (let i = 0; i < 12; i++)
        await client.complete({ messages: [{ role: 'user', content: `${i}` }] })
      return clock.sleeps
    }
    // Gemini's free tier allows 10 requests a minute: the 11th waits.
    expect(await run()).toEqual([60_000])
    process.env.TRUSTEN_LLM_RPM = '0'
    expect(await run()).toEqual([])
  } finally {
    if (previous === undefined) delete process.env.TRUSTEN_LLM_RPM
    else process.env.TRUSTEN_LLM_RPM = previous
    wire.restore()
  }
})

test('pattern analysis asks for a repeatable answer', async () => {
  const wire = captureRequests(() => ok('{"patterns":[]}'))
  try {
    const client = new TrustenLLMClient({
      provider: 'groq',
      apiKey: 'groq-fixture-key',
    })
    await client.analyzeForPatterns({ analysisType: 'x', context: 'page' })
    expect(wire.requests[0]?.body.temperature).toBe(0)
  } finally {
    wire.restore()
  }
})

test('the wait a provider names in its error body is honored', async () => {
  expect(
    retryDelayFromBody(
      '[{"error":{"code":429,"details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"37s"}]}}]',
    ),
  ).toBe(37_000)
  expect(
    retryDelayFromBody(
      'Rate limit reached for model. Please try again in 7.5s. Need more tokens?',
    ),
  ).toBe(7_500)
  expect(retryDelayFromBody('Please try again in 1m30s.')).toBe(90_000)
  expect(retryDelayFromBody('Please try again in 450ms.')).toBe(450)
  expect(retryDelayFromBody('quota exceeded')).toBeUndefined()

  let calls = 0
  const wire = captureRequests(() =>
    ++calls === 1
      ? new Response('{"error":{"details":[{"retryDelay":"12s"}]}}', {
          status: 429,
        })
      : ok(),
  )
  const clock = fakeClock()
  try {
    const client = new TrustenLLMClient(
      { provider: 'gemini', apiKey: 'gemini-fixture-key' },
      { ...clock, requestsPerMinute: () => 0 },
    )
    await client.complete({ messages: [{ role: 'user', content: 'Hi' }] })
    expect(clock.sleeps).toEqual([12_000])
  } finally {
    wire.restore()
  }
})
