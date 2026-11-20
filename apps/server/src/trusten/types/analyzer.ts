/** Trusten — Input context handed to analyzers and the result they return. */

import type { PageLLMBatch } from '../analyzers/page-llm-batch'
import type { DetectedPattern } from './patterns'

export interface NetworkRequest {
  url: string
  method: string
  status?: number
  responseBody?: string
  headers?: Record<string, string>
}

export interface CookieInfo {
  name: string
  value: string
  domain: string
  path: string
  expires?: string
  secure: boolean
  httpOnly: boolean
  sameSite?: string
}

export interface AnalyzerContext {
  url: string
  pageTitle: string
  domSnapshot: string
  visibleText: string
  screenshotBase64: string
  networkRequests: NetworkRequest[]
  cookies: CookieInfo[]
  previousStepContext?: AnalyzerContext
  /** Shares one AI text request among the analyzers checking this page. */
  llmBatch?: PageLLMBatch
}

export interface AnalyzerResult {
  patterns: DetectedPattern[]
  metadata?: Record<string, unknown>
}
