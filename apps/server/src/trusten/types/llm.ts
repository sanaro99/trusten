/** Trusten — LLM provider configuration. */

export type TrustenLLMProvider =
  | 'nvidia-nim'
  | 'gemini'
  | 'cloudflare'
  | 'groq'
  | 'deepseek'
  | 'openrouter'
  | 'ollama'

export interface TrustenLLMConfig {
  provider: TrustenLLMProvider
  apiKey?: string
  /** Cloudflare Workers AI account ID (unless baseUrl already includes it). */
  accountId?: string
  baseUrl?: string
  model?: string
}
