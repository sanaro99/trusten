/**
 * Trusten LLM Client
 *
 * Lightweight LLM utility for semantic analysis in Trusten analyzers.
 * Supports: Nvidia NIM, Google Gemini, DeepSeek, OpenRouter, Ollama (local).
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
  'nvidia-nim': {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.1-70b-instruct',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
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
  'nvidia-nim',
  'gemini',
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
const unreachableUntil = new Map<TrustenLLMProvider, number>()

function isUnreachable(p: TrustenLLMProvider): boolean {
  const until = unreachableUntil.get(p)
  return until !== undefined && Date.now() < until
}

function markUnreachable(p: TrustenLLMProvider): void {
  unreachableUntil.set(p, Date.now() + UNREACHABLE_TTL_MS)
}

// ─── Credential helpers ───

function getApiKey(provider: TrustenLLMProvider): string {
  switch (provider) {
    case 'nvidia-nim':
      return process.env.NVIDIA_NIM_API_KEY ?? ''
    case 'gemini':
      return process.env.TRUSTEN_GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''
    case 'deepseek':
      return process.env.DEEPSEEK_API_KEY ?? ''
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY ?? ''
    case 'ollama':
      return ''
  }
}

function hasCredentials(provider: TrustenLLMProvider): boolean {
  return provider === 'ollama' || getApiKey(provider).length > 0
}

// ─── Environment-based config resolution ───

function resolveExplicitConfig(provider: TrustenLLMProvider): TrustenLLMConfig {
  switch (provider) {
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
        apiKey: process.env.TRUSTEN_GEMINI_API_KEY || process.env.GEMINI_API_KEY,
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
  const explicit = process.env.TRUSTEN_LLM_PROVIDER as TrustenLLMProvider | undefined
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
  /** Override the provider for this specific call */
  provider?: TrustenLLMProvider
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

  constructor(config?: TrustenLLMConfig) {
    this.config = config ?? resolveConfig()
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

  /**
   * Send a chat completion request.
   * Returns the assistant's response text.
   */
  async complete(options: LLMCompletionOptions): Promise<string> {
    const provider = options.provider ?? this.config.provider

    if (isUnreachable(provider)) {
      const next = this.nextInChain(provider)
      if (next) return this.tryFallback(options, next)
      throw new Error(`Trusten LLM: ${provider} unreachable`)
    }

    const defaults = PROVIDER_DEFAULTS[provider]
    const baseUrl = this.config.baseUrl ?? defaults.baseUrl
    const model = this.config.model ?? defaults.defaultModel
    const apiKey = this.config.apiKey ?? getApiKey(provider)

    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
    const body = {
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 1024,
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(defaults.extraHeaders ?? {}),
      ...(apiKey ? defaults.authHeader(apiKey) : {}),
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
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
    } catch (error) {
      markUnreachable(provider)
      const next = this.nextInChain(provider)
      if (next) return this.tryFallback(options, next)
      const msg = error instanceof Error ? error.message : String(error)
      logger.error('Trusten LLM request failed (all providers)', { error: msg })
      throw new Error(`Trusten LLM failed: ${msg}`)
    }
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

    // Include screenshot for visual analysis if provided
    const userContent: LLMContentPart[] | string = params.screenshotBase64
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
    })
  }

  /** Returns the next available provider after `current` in the fallback chain. */
  private nextInChain(current: TrustenLLMProvider): TrustenLLMProvider | null {
    const idx = FALLBACK_CHAIN.indexOf(current)
    for (let i = idx + 1; i < FALLBACK_CHAIN.length; i++) {
      const next = FALLBACK_CHAIN[i]
      if (!isUnreachable(next) && hasCredentials(next)) return next
    }
    return null
  }

  private async tryFallback(
    options: LLMCompletionOptions,
    fallbackProvider: TrustenLLMProvider,
  ): Promise<string> {
    logger.warn(
      `Trusten LLM: primary provider failed, trying fallback: ${fallbackProvider}`,
    )

    if (isUnreachable(fallbackProvider) || !hasCredentials(fallbackProvider)) {
      const next = this.nextInChain(fallbackProvider)
      if (next) return this.tryFallback(options, next)
      throw new Error('Trusten LLM: all providers unreachable')
    }

    const defaults = PROVIDER_DEFAULTS[fallbackProvider]
    const apiKey = getApiKey(fallbackProvider)
    const url = `${defaults.baseUrl}/chat/completions`
    const body = {
      model: defaults.defaultModel,
      messages: options.messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 1024,
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(defaults.extraHeaders ?? {}),
      ...(apiKey ? defaults.authHeader(apiKey) : {}),
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        throw new Error(
          `LLM fallback failed (${response.status}): ${errorText}`,
        )
      }

      const data = (await response.json()) as ChatCompletionResponse
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Fallback LLM response missing content')
      }

      return data.choices[0].message.content
    } catch (error) {
      markUnreachable(fallbackProvider)
      const next = this.nextInChain(fallbackProvider)
      if (next) return this.tryFallback(options, next)
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`All LLM providers failed. Last error: ${msg}`)
    }
  }
}

// ─── Singleton instance ───

let _instance: TrustenLLMClient | null = null

export function getTrustenLLM(): TrustenLLMClient {
  if (!_instance) {
    _instance = new TrustenLLMClient()
  }
  return _instance
}
