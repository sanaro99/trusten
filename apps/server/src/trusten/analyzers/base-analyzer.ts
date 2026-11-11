/**
 * Trusten — Base Analyzer
 *
 * Abstract class all analyzers extend. Provides shared utilities for:
 * - DOM text extraction (stripping scripts, styles, hidden elements)
 * - Regex-based keyword matching with word boundaries
 * - Building DetectedPattern objects with evidence
 * - Confidence-gated pattern filtering
 */

import {
  consolidateFindings,
  hasCategoryEvidence,
  DarkPatternCategory as PatternCategory,
} from '@trusten/shared/domain'
import { getTrustenLLM } from '../llm/client'
import { REGULATORY_MAP } from '../regulatory/mapping'
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
   * Find all occurrences of keyword patterns in text, in page order.
   * Overlapping matches ("Only 2 left" / "2 left in stock") describe one claim,
   * so only the first-found of each overlapping group is kept.
   */
  protected findKeywordMatches(
    text: string,
    patterns: RegExp[],
  ): Array<{ match: string; context: string; index: number }> {
    const found = this.findAllKeywordMatches(text, patterns)
    const kept: typeof found = []
    for (const candidate of found) {
      const end = candidate.index + candidate.match.length
      const overlaps = kept.some(
        (k) => candidate.index < k.index + k.match.length && k.index < end,
      )
      if (!overlaps) kept.push(candidate)
    }
    return kept.sort((a, b) => a.index - b.index)
  }

  /**
   * The sentence containing a match, cut at word boundaries, so a quote shown
   * to the reader never starts or ends mid-word.
   */
  protected sentenceAround(
    text: string,
    match: { index: number; match: string },
    maxLength = 160,
  ): string {
    const end = match.index + match.match.length
    const boundary = /[.!?](?:\s|$)|\n/g
    let start = 0
    for (const b of text.slice(0, match.index).matchAll(boundary))
      start = (b.index ?? 0) + b[0].length
    boundary.lastIndex = 0
    const next = boundary.exec(text.slice(end))
    let stop = next ? end + next.index + 1 : text.length
    if (start < match.index - maxLength / 2)
      start = text.lastIndexOf(' ', match.index - maxLength / 2) + 1
    if (stop > end + maxLength / 2) {
      const space = text.indexOf(' ', end + maxLength / 2)
      stop = space === -1 ? text.length : space
    }
    return text.slice(start, stop).trim()
  }

  /** Shorten a quote at a word boundary, marking that it continues. */
  protected clip(text: string, maxLength: number): string {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (clean.length <= maxLength) return clean
    const cut = clean.slice(0, maxLength)
    const space = cut.lastIndexOf(' ')
    return `${(space > maxLength / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, '')}…`
  }

  private findAllKeywordMatches(
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
        const context = this.sentenceAround(text, {
          index: match.index,
          match: match[0],
        })

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
      regulatoryViolations:
        params.regulatoryViolations ?? REGULATORY_MAP[params.category] ?? [],
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
    return consolidateFindings(patterns)
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

  /**
   * Run a text-based LLM pattern scan and turn the JSON response into
   * DetectedPatterns. Shared by the text analyzers, which all send the same
   * `{ patterns: [...] }` shape and differ only in the prompt, the category
   * mapping, and the fallback category/severity.
   *
   * Returns [] on any LLM/parse failure so detection degrades gracefully.
   */
  protected async runLLMAnalysis(params: {
    analysisType: string
    context: AnalyzerContext
    text: string
    /** Maps LLM category strings to enum values; omit for single-category analyzers. */
    categoryMap?: Record<string, DarkPatternCategory>
    defaultCategory: DarkPatternCategory
    defaultSeverity?: Severity
    minConfidence?: number
    maxChars?: number
  }): Promise<DetectedPattern[]> {
    const {
      analysisType,
      context,
      text,
      categoryMap,
      defaultCategory,
      defaultSeverity = 'medium',
      minConfidence = 0.7,
      maxChars = 3000,
    } = params

    try {
      const raw = await getTrustenLLM().analyzeForPatterns({
        analysisType,
        context: text.slice(0, maxChars),
      })

      const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as {
        patterns?: Array<{
          category: string
          severity: string
          confidence: number
          description: string
          evidence_text: string
        }>
      }

      if (!Array.isArray(json.patterns)) return []

      return json.patterns
        .filter(
          (p) =>
            p &&
            Object.values(PatternCategory).includes(
              p.category as PatternCategory,
            ) &&
            (categoryMap
              ? categoryMap[p.category]
              : p.category === defaultCategory) &&
            Number.isFinite(p.confidence) &&
            p.confidence >= minConfidence &&
            typeof p.description === 'string' &&
            typeof p.evidence_text === 'string' &&
            p.evidence_text.trim(),
        )
        .filter((p) =>
          hasCategoryEvidence(
            p.category,
            p.evidence_text,
            Boolean(context.previousStepContext),
          ),
        )
        .map((p) =>
          this.buildPattern({
            category: categoryMap?.[p.category] ?? defaultCategory,
            severity: (['critical', 'high', 'medium', 'low'].includes(
              p.severity,
            )
              ? p.severity
              : defaultSeverity) as Severity,
            confidence: p.confidence,
            description: p.description,
            url: context.url,
            pageTitle: context.pageTitle,
            element: { text: p.evidence_text, html: '', selector: '' },
          }),
        )
    } catch {
      return []
    }
  }
}
