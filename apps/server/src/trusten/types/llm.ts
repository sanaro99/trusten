/** Trusten — LLM provider configuration. */

export type TrustenLLMProvider =
  | 'nvidia-nim'
  | 'gemini'
  | 'deepseek'
  | 'openrouter'
  | 'ollama'

export interface TrustenLLMConfig {
  provider: TrustenLLMProvider
  apiKey?: string
  baseUrl?: string
  model?: string
}
