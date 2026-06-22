/** Trusten — Input context handed to analyzers and the result they return. */

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
}

export interface AnalyzerResult {
  patterns: DetectedPattern[]
  metadata?: Record<string, unknown>
}
