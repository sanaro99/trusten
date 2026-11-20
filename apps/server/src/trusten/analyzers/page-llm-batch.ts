/**
 * Trusten — one AI text check per page
 *
 * Several text analyzers each used to send their own AI request for the same
 * page, which burned through free-tier rate limits five times faster than
 * needed. A batch collects the requests the analyzers make for one page and
 * sends them as a single request that lists every focus area. Each analyzer
 * still reads only the categories it owns from the shared answer.
 *
 * The batch waits until every participating analyzer has either asked for AI
 * help or finished without it, so it never depends on timing.
 */

import { getTrustenLLM } from '../llm/client'

export interface BatchedTextRequest {
  /** The analyzer asking; used to order focus areas the same way every time. */
  analyzer: string
  analysisType: string
  /** Page text, already cut to the analyzer's limit. */
  text: string
}

export type TextAnalysisRunner = (params: {
  analysisType: string
  context: string
}) => Promise<string>

interface Pending extends BatchedTextRequest {
  resolve: (raw: string) => void
  reject: (error: unknown) => void
}

const defaultRunner: TextAnalysisRunner = (params) =>
  getTrustenLLM().analyzeForPatterns(params)

/**
 * The analysis type sent for a group of requests. A single request keeps its
 * own wording, so a page that needs one focus area asks exactly what it did
 * before batching.
 */
export function combinedAnalysisType(requests: BatchedTextRequest[]): string {
  const types = [
    ...new Set(
      [...requests]
        .sort((a, b) => a.analyzer.localeCompare(b.analyzer))
        .map((r) => r.analysisType),
    ),
  ]
  if (types.length === 1) return types[0]
  return `Check this page for each of these areas separately and list every pattern found, using the category names given:\n${types
    .map((type, i) => `${i + 1}. ${type}`)
    .join('\n')}`
}

export class PageLLMBatch {
  private pending: Pending[] = []
  private finished = 0
  /** Number of AI requests actually sent; read by tests and logs. */
  sent = 0

  constructor(
    /** How many analyzers may ask; the batch flushes once all have reported. */
    private readonly participants: number,
    private readonly runner: TextAnalysisRunner = defaultRunner,
  ) {}

  /** Ask for AI analysis; resolves with the raw model answer for the page. */
  request(request: BatchedTextRequest): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.pending.push({ ...request, resolve, reject })
      this.maybeFlush()
    })
  }

  /** An analyzer has returned; it will not ask again. */
  done(): void {
    this.finished++
    this.maybeFlush()
  }

  private maybeFlush(): void {
    if (this.pending.length === 0) return
    if (this.pending.length + this.finished < this.participants) return
    const batch = this.pending
    this.pending = []
    // Requests normally share the page text; any that differ get their own call.
    const byText = new Map<string, Pending[]>()
    for (const item of batch) {
      const group = byText.get(item.text) ?? []
      group.push(item)
      byText.set(item.text, group)
    }
    for (const [text, group] of byText) {
      this.sent++
      this.runner({ analysisType: combinedAnalysisType(group), context: text })
        .then((raw) => {
          for (const item of group) item.resolve(raw)
        })
        .catch((error) => {
          for (const item of group) item.reject(error)
        })
    }
  }
}
