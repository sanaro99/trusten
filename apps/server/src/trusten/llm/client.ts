/**
 * Trusten LLM Client
 *
 * Lightweight LLM utility for semantic analysis in Trusten analyzers.
 * Supports: Cloudflare Workers AI, Groq, Gemini, Nvidia NIM, DeepSeek,
 * OpenRouter, and Ollama (local).
 *
 * All providers expose an OpenAI-compatible chat completions API,
 * so we use a single fetch-based implementation with provider-specific
 * base URLs, auth headers, and default models.
 */

import { logger } from '../../lib/logger'
import type { TrustenLLMConfig, TrustenLLMProvider } from '../types'

// ─── Provider Defaults ───

interface ProviderDefaults {
  baseUrl: string
  defaultModel: string
  authHeader: (apiKey: string) => Record<string, string>
  extraHeaders?: Record<string, string>
}

const PROVIDER_DEFAULTS: Record<TrustenLLMProvider, ProviderDefaults> = {
  cloudflare: {
    baseUrl: '', // The endpoint includes the configured Cloudflare account ID.
    defaultModel: '@cf/meta/llama-4-scout-17b-16e-instruct',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'qwen/qwen3.8-27b',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  'nvidia-nim': {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.1-70b-instruct',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-flash',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    extraHeaders: {
      'HTTP-Referer': 'https://trusten.app',
      'X-Title': 'Trusten Dark Pattern Scanner',
    },
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    authHeader: () => ({}),
  },
}

/** Auto-detect + fallback order when TRUSTEN_LLM_PROVIDER is not set */
const FALLBACK_CHAIN: TrustenLLMProvider[] = [
  'cloudflare',
  'groq',
  'gemini',
  'nvidia-nim',
  'deepseek',
  'openrouter',
  'ollama',
]

// ─── Reliability knobs ───

/** Per-call HTTP timeout. Short so a dead provider never stalls a scan. */
const LLM_TIMEOUT_MS = Number(process.env.TRUSTEN_LLM_TIMEOUT_MS ?? 8000)

/**
 * Remember providers that just failed (network error / timeout) so the ~11
 * analyzers running in parallel — and every subsequent deep-scan step — don't
 * each eat a full timeout against the same dead endpoint.
 */
const UNREACHABLE_TTL_MS = 60_000
const STRIKE_THRESHOLD = Number(process.env.TRUSTEN_LLM_STRIKES ?? 3)

function messagesHaveImage(messages: LLMMessage[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) && m.content.some((c) => c.type === 'image_url'),
  )
}

function stripImages(messages: LLMMessage[]): LLMMessage[] {
  return messages.map((m) =>
    Array.isArray(m.content)
      ? {
          ...m,
          content: m.content.filter((c) => c.type !== 'image_url'),
        }
      : m,
  )
}

/** Heuristic for "the model can't take images" given the provider's error text. */
function isImageRejection(errorText: string): boolean {
  return /multimodal|image input|image_url|vision|does not support image|not a multimodal/i.test(
    errorText,
  )
}

// ─── Credential helpers ───

function getApiKey(provider: TrustenLLMProvider): string {
  switch (provider) {
    case 'cloudflare':
      return process.env.CLOUDFLARE_API_TOKEN ?? ''
    case 'groq':
      return process.env.GROQ_API_KEY ?? ''
    case 'nvidia-nim':
      return process.env.NVIDIA_NIM_API_KEY ?? ''
    case 'gemini':
      return (
        process.env.TRUSTEN_GEMINI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        ''
      )
    case 'deepseek':
      return process.env.DEEPSEEK_API_KEY ?? ''
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY ?? ''
    case 'ollama':
      return ''
  }
}

function hasCredentials(provider: TrustenLLMProvider): boolean {
  return isUsableConfig(resolveExplicitConfig(provider))
}

function isUsableConfig(config: TrustenLLMConfig): boolean {
  if (config.provider === 'ollama') return true
  if (!config.apiKey?.trim()) return false
  return (
    config.provider !== 'cloudflare' ||
    Boolean(config.accountId?.trim() || config.baseUrl)
  )
}

function modelSupportsImages(
  config: TrustenLLMConfig,
  textOnlyModels: Set<string>,
): boolean {
  const model = (
    config.model ?? PROVIDER_DEFAULTS[config.provider].defaultModel
  ).toLowerCase()
  if (textOnlyModels.has(model)) return false
  const env = process.env.TRUSTEN_LLM_VISION?.toLowerCase()
  if (env === '1' || env === 'true') return true
  if (env === '0' || env === 'false') return false
  return /vision|gemini|gpt-4o|\b4o\b|claude|llava|pixtral|llama-3\.2|llama-4-(scout|maverick)|qwen.*(vl|3\.8)|multimodal|deepseek-v4|deepseek-flash/.test(
    model,
  )
}

// ─── Environment-based config resolution ───

function resolveExplicitConfig(provider: TrustenLLMProvider): TrustenLLMConfig {
  switch (provider) {
    case 'cloudflare':
      return {
        provider,
        apiKey: getApiKey(provider),
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        baseUrl: process.env.CLOUDFLARE_BASE_URL,
        model: process.env.CLOUDFLARE_MODEL,
      }
    case 'groq':
      return {
        provider,
        apiKey: getApiKey(provider),
        baseUrl: process.env.GROQ_BASE_URL,
        model: process.env.GROQ_MODEL,
      }
    case 'nvidia-nim':
      return {
        provider,
        apiKey: process.env.NVIDIA_NIM_API_KEY,
        baseUrl: process.env.NVIDIA_NIM_BASE_URL,
        model: process.env.NVIDIA_NIM_MODEL,
      }
    case 'gemini':
      return {
        provider,
        apiKey: getApiKey(provider),
        baseUrl: process.env.GEMINI_BASE_URL,
        model: process.env.GEMINI_MODEL,
      }
    case 'deepseek':
      return {
        provider,
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: process.env.DEEPSEEK_BASE_URL,
        model: process.env.DEEPSEEK_MODEL,
      }
    case 'openrouter':
      return {
        provider,
        apiKey: process.env.OPENROUTER_API_KEY,
        baseUrl: process.env.OPENROUTER_BASE_URL,
        model: process.env.OPENROUTER_MODEL,
      }
    case 'ollama':
      return {
        provider,
        baseUrl: process.env.OLLAMA_BASE_URL,
        model: process.env.OLLAMA_MODEL,
      }
  }
}

function resolveConfig(): TrustenLLMConfig {
  const explicit = process.env.TRUSTEN_LLM_PROVIDER as
    | TrustenLLMProvider
    | undefined
  if (explicit && explicit in PROVIDER_DEFAULTS) {
    return resolveExplicitConfig(explicit)
  }

  // Auto-detect in chain order: first provider with credentials wins
  for (const provider of FALLBACK_CHAIN) {
    if (hasCredentials(provider)) return resolveExplicitConfig(provider)
  }

  return resolveExplicitConfig('ollama')
}

// ─── Types ───

type LLMContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | LLMContentPart[]
}

export interface LLMCompletionOptions {
  messages: LLMMessage[]
  temperature?: number
  maxTokens?: number
  /** A screenshot check must fail rather than silently retry without the image. */
  requireImage?: boolean
  /** Override the provider for this specific call */
  provider?: TrustenLLMProvider
  /**
   * Per-call HTTP timeout override (ms). Navigation calls are sequential and
   * critical-path, so they pass a longer budget than the parallel analyzers.
   */
  timeoutMs?: number
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ─── Client ───

export class TrustenLLMClient {
  private config: TrustenLLMConfig
  // The production singleton shares these across parallel analyzers. Separate
  // clients/accounts do not inherit another configuration's failures.
  private readonly unreachableUntil = new Map<TrustenLLMProvider, number>()
  private readonly failureStrikes = new Map<TrustenLLMProvider, number>()
  private readonly textOnlyModels = new Set<string>()

  private isUnreachable(provider: TrustenLLMProvider): boolean {
    const until = this.unreachableUntil.get(provider)
    return until !== undefined && Date.now() < until
  }

  private markUnreachable(provider: TrustenLLMProvider): void {
    const strikes = (this.failureStrikes.get(provider) ?? 0) + 1
    this.failureStrikes.set(provider, strikes)
    if (strikes >= STRIKE_THRESHOLD)
      this.unreachableUntil.set(provider, Date.now() + UNREACHABLE_TTL_MS)
  }

  private markReachable(provider: TrustenLLMProvider): void {
    this.failureStrikes.delete(provider)
    this.unreachableUntil.delete(provider)
  }

  constructor(config?: TrustenLLMConfig) {
    const environment = config
      ? resolveExplicitConfig(config.provider)
      : resolveConfig()
    this.config = {
      provider: environment.provider,
      apiKey: config?.apiKey ?? environment.apiKey,
      accountId: config?.accountId ?? environment.accountId,
      baseUrl: config?.baseUrl ?? environment.baseUrl,
      model: config?.model ?? environment.model,
    }
    logger.info('Trusten LLM client initialized', {
      provider: this.config.provider,
      model:
        this.config.model ??
        PROVIDER_DEFAULTS[this.config.provider].defaultModel,
    })
  }

  get provider(): TrustenLLMProvider {
    return this.config.provider
  }

  /** Whether the primary or a cloud fallback has the required credentials. */
  isConfigured(): boolean {
    return (
      isUsableConfig(this.config) ||
      FALLBACK_CHAIN.some(
        (provider) => provider !== 'ollama' && hasCredentials(provider),
      )
    )
  }

  /** Includes configured vision fallbacks when the primary is text-only. */
  supportsImages(): boolean {
    return this.availableConfigs().some((config) =>
      modelSupportsImages(config, this.textOnlyModels),
    )
  }

  private configFor(provider: TrustenLLMProvider): TrustenLLMConfig {
    return provider === this.config.provider
      ? this.config
      : resolveExplicitConfig(provider)
  }

  /** Try an explicitly pinned provider first, then each configured alternative once. */
  private availableConfigs(primary = this.config.provider): TrustenLLMConfig[] {
    return [
      primary,
      ...FALLBACK_CHAIN.filter((provider) => provider !== primary),
    ]
      .map((provider) => this.configFor(provider))
      .filter(isUsableConfig)
  }

  private buildRequest(
    config: TrustenLLMConfig,
    options: LLMCompletionOptions,
  ): {
    url: string
    headers: Record<string, string>
    body: Record<string, unknown>
    model: string
  } {
    const { provider } = config
    const defaults = PROVIDER_DEFAULTS[provider]
    const baseUrl =
      config.baseUrl ??
      (provider === 'cloudflare'
        ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId?.trim() ?? '')}/ai/v1`
        : defaults.baseUrl)
    const model = config.model ?? defaults.defaultModel
    const body: Record<string, unknown> = {
      model,
      messages: options.messages,
      ...(provider === 'groq'
        ? { max_completion_tokens: options.maxTokens ?? 1024 }
        : { max_tokens: options.maxTokens ?? 1024 }),
    }
    // Match Applination's Gemini 3 handling: omit unsupported sampling controls.
    if (provider === 'gemini' && model.startsWith('gemini-3')) {
      body.reasoning_effort = 'low'
    } else {
      body.temperature = options.temperature ?? 0.1
      if (
        provider === 'gemini' &&
        /^gemini-2\.5-flash(?:$|-lite$)/.test(model)
      ) {
        body.reasoning_effort = 'none'
      }
    }
    return {
      url: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        ...(defaults.extraHeaders ?? {}),
        ...(config.apiKey ? defaults.authHeader(config.apiKey) : {}),
      },
      body,
      model,
    }
  }

  /** POST a prepared request and return the assistant content, or throw. */
  private async sendRequest(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
  ): Promise<string> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      throw new Error(`LLM request failed (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as ChatCompletionResponse
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('LLM response missing content')
    }
    return data.choices[0].message.content
  }

  private async completeWithProvider(
    config: TrustenLLMConfig,
    options: LLMCompletionOptions,
  ): Promise<string> {
    const request = this.buildRequest(config, options)
    const timeout = options.timeoutMs ?? LLM_TIMEOUT_MS
    try {
      return await this.sendRequest(
        request.url,
        request.headers,
        request.body,
        timeout,
      )
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (messagesHaveImage(options.messages) && isImageRejection(msg)) {
        this.textOnlyModels.add(request.model.toLowerCase())
        logger.warn('Trusten LLM model rejected image input', {
          provider: config.provider,
          model: request.model,
        })
        // Required screenshots stay attached when moving to the next provider.
        if (!options.requireImage) {
          const retry = this.buildRequest(config, {
            ...options,
            messages: stripImages(options.messages),
          })
          return this.sendRequest(retry.url, retry.headers, retry.body, timeout)
        }
      }
      throw error
    }
  }

  /** Try each usable provider once, preserving required screenshots on fallback. */
  async complete(options: LLMCompletionOptions): Promise<string> {
    if (options.requireImage && !messagesHaveImage(options.messages)) {
      throw new Error('Trusten vision request requires a screenshot')
    }
    const primary = options.provider ?? this.config.provider
    let lastError: unknown = new Error(
      options.requireImage
        ? 'No screenshot-capable provider is available'
        : 'No usable LLM provider is configured',
    )
    for (const config of this.availableConfigs(primary)) {
      const { provider } = config
      if (this.isUnreachable(provider)) continue
      if (
        options.requireImage &&
        !modelSupportsImages(config, this.textOnlyModels)
      )
        continue
      if (provider !== primary)
        logger.warn('Trusten LLM: trying fallback', { provider })
      try {
        const content = await this.completeWithProvider(config, options)
        this.markReachable(provider)
        return content
      } catch (error) {
        lastError = error
        const msg = error instanceof Error ? error.message : String(error)
        if (!isImageRejection(msg)) this.markUnreachable(provider)
        logger.warn('Trusten LLM provider request failed', {
          provider,
          model: config.model ?? PROVIDER_DEFAULTS[provider].defaultModel,
          error: msg,
        })
      }
    }
    const message =
      lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(`Trusten LLM failed: ${message}`)
  }

  /**
   * Analyze content for dark pattern indicators.
   * Optionally includes a screenshot for visual pattern detection.
   */
  async analyzeForPatterns(params: {
    context: string
    analysisType: string
    domFragment?: string
    screenshotBase64?: string
    requireImage?: boolean
  }): Promise<string> {
    const systemPrompt = `You are a dark pattern detection expert. Analyze web page content and screenshots to identify manipulative UI/UX patterns.

Dark pattern categories to look for:
- fake_urgency: countdown timers, "offer expires", "limited time"
- fake_scarcity: "only X left", "X people viewing", low stock claims
- fake_social_proof: "X bought today", unverifiable social counters
- basket_sneaking: pre-added items/fees in cart
- drip_pricing: fees revealed late in checkout
- bait_and_switch: price/product discrepancy
- confirmshaming: guilt-trip opt-out language ("No thanks, I hate saving money")
- trick_wording: misleading double-negatives, confusing opt-in/out
- visual_interference: dark/hidden "decline" buttons, small reject text
- preselected_options: pre-checked boxes for marketing/add-ons
- information_hiding: important terms hidden in collapsed sections
- fake_hierarchy: "Recommended" badge pushing expensive plans
- privacy_zuckering: unclear data sharing defaults
- dark_consent: asymmetric accept/reject prominence
- roach_motel: easy to sign up, hard to cancel

Rules:
- Be precise and evidence-based. Only flag patterns you are confident about.
- When analyzing a screenshot, look for visual design manipulation (button color contrast, text size asymmetry, fake badges).
- Return ONLY valid JSON:
{
  "patterns": [
    {
      "category": "<category_from_list_above>",
      "severity": "critical" | "high" | "medium" | "low",
      "confidence": <0.0-1.0>,
      "description": "<clear explanation of why this is a dark pattern>",
      "evidence_text": "<the specific text/element that is problematic>"
    }
  ],
  "summary": "<one sentence overall assessment>"
}
- If no dark patterns: { "patterns": [], "summary": "No dark patterns detected." }`

    const textContent = `Analysis type: ${params.analysisType}

Page context:
${params.context}

${params.domFragment ? `Relevant DOM fragment:\n${params.domFragment}` : ''}

Analyze the above content and return your findings as JSON.`

    // Include the screenshot only when the model can actually accept images —
    // otherwise the request 400s and we lose the (still useful) text analysis.
    const useImage = !!params.screenshotBase64 && this.supportsImages()
    if (params.requireImage && !useImage)
      throw new Error('No screenshot-capable model is configured')
    const userContent: LLMContentPart[] | string = useImage
      ? [
          { type: 'text', text: textContent },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${params.screenshotBase64}`,
            },
          },
          {
            type: 'text',
            text: 'Also analyze the screenshot above for visual dark patterns such as asymmetric button styling, hidden decline options, countdown timers, fake scarcity badges, and manipulative price displays.',
          },
        ]
      : textContent

    return this.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      maxTokens: 2048,
      requireImage: params.requireImage,
    })
  }
}

let _instance: TrustenLLMClient | null = null

export function getTrustenLLM(): TrustenLLMClient {
  if (!_instance) {
    _instance = new TrustenLLMClient()
  }
  return _instance
}
