/**
 * Trusten — Base Analyzer
 *
 * Abstract class all analyzers extend. Provides shared utilities for:
 * - DOM text extraction (stripping scripts, styles, hidden elements)
 * - Regex-based keyword matching with word boundaries
 * - Building DetectedPattern objects with evidence
 * - Confidence-gated pattern filtering
 */

import type {
  AnalyzerContext,
  AnalyzerResult,
  DarkPatternCategory,
  DetectedPattern,
  ElementEvidence,
  PatternEvidence,
  RegulatoryViolation,
  Severity,
} from '../types'

// ─── Abstract Base ───

export abstract class BaseAnalyzer {
  abstract name: string
  abstract categories: DarkPatternCategory[]

  abstract analyze(context: AnalyzerContext): Promise<AnalyzerResult>

  // ─── Shared Utilities ───

  /**
   * Extract visible text from a DOM snapshot, stripping script/style/noscript tags
   * and collapsing whitespace.
   */
  protected extractVisibleText(html: string): string {
    // Remove script, style, noscript, and SVG content
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ')

    // Decode common HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')

    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim()

    return text
  }

  /**
   * Find all occurrences of keyword patterns in text.
   * Returns match details with surrounding context.
   */
  protected findKeywordMatches(
    text: string,
    patterns: RegExp[],
  ): Array<{ match: string; context: string; index: number }> {
    const results: Array<{ match: string; context: string; index: number }> = []

    for (const pattern of patterns) {
      // Reset lastIndex for global patterns
      const regex = new RegExp(
        pattern.source,
        pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
      )
      let match: RegExpExecArray | null

      while ((match = regex.exec(text)) !== null) {
        const start = Math.max(0, match.index - 60)
        const end = Math.min(text.length, match.index + match[0].length + 60)
        const context = text.slice(start, end).trim()

        results.push({
          match: match[0],
          context,
          index: match.index,
        })
      }
    }

    return results
  }

  /**
   * Search HTML for elements matching a CSS-selector-like pattern.
   * Returns the raw HTML fragments of matching elements.
   */
  protected findElements(
    html: string,
    tagPattern: RegExp,
  ): Array<{ html: string; text: string }> {
    const results: Array<{ html: string; text: string }> = []
    let match: RegExpExecArray | null
    const regex = new RegExp(
      tagPattern.source,
      tagPattern.flags.includes('g')
        ? tagPattern.flags
        : `${tagPattern.flags}g`,
    )

    while ((match = regex.exec(html)) !== null) {
      const fullMatch = match[0]
      const text = this.extractVisibleText(fullMatch)
      results.push({ html: fullMatch, text })
    }

    return results
  }

  /**
   * Build a DetectedPattern object with all required fields.
   */
  protected buildPattern(params: {
    category: DarkPatternCategory
    severity: Severity
    confidence: number
    description: string
    url: string
    pageTitle: string
    element?: Partial<ElementEvidence>
    evidence?: Partial<PatternEvidence>
    regulatoryViolations?: RegulatoryViolation[]
  }): DetectedPattern {
    return {
      id: `trusten-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category: params.category,
      severity: params.severity,
      confidence: Math.min(1, Math.max(0, params.confidence)),
      description: params.description,
      element: params.element
        ? {
            selector: params.element.selector ?? '',
            text: params.element.text ?? '',
            html: params.element.html ?? '',
            boundingBox: params.element.boundingBox,
          }
        : undefined,
      evidence: {
        screenshot: params.evidence?.screenshot,
        screenshotUrl: params.evidence?.screenshotUrl,
        domSnapshot: params.evidence?.domSnapshot,
        networkEvidence: params.evidence?.networkEvidence,
      },
      regulatoryViolations: params.regulatoryViolations ?? [],
      detectedAt: new Date().toISOString(),
      url: params.url,
      pageTitle: params.pageTitle,
    }
  }

  /**
   * Filter patterns below a minimum confidence threshold.
   * Deterministic detections should use >= 0.7 confidence.
   */
  protected filterByConfidence(
    patterns: DetectedPattern[],
    minConfidence = 0.5,
  ): DetectedPattern[] {
    return patterns.filter((p) => p.confidence >= minConfidence)
  }

  /**
   * Deduplicate patterns by category, keeping the highest-confidence instance.
   */
  protected deduplicatePatterns(
    patterns: DetectedPattern[],
  ): DetectedPattern[] {
    const best = new Map<string, DetectedPattern>()

    for (const p of patterns) {
      const key = `${p.category}:${p.element?.text ?? p.description.slice(0, 50)}`
      const existing = best.get(key)
      if (!existing || p.confidence > existing.confidence) {
        best.set(key, p)
      }
    }

    return [...best.values()]
  }

  /**
   * Check if text contains any of the given keywords (case-insensitive, word-boundary).
   */
  protected hasKeywords(text: string, keywords: string[]): boolean {
    const lower = text.toLowerCase()
    return keywords.some((kw) => {
      const regex = new RegExp(`\\b${this.escapeRegex(kw)}\\b`, 'i')
      return regex.test(lower)
    })
  }

  /**
   * Escape special regex characters in a string.
   */
  protected escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}
