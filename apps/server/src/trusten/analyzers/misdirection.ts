/**
 * Analyzer 2 — Misdirection
 *
 * Detects patterns that mislead users about their choices:
 * CONFIRMSHAMING:      "No thanks, I don't want to save money"
 * TRICK_WORDING:       Double negatives, confusing opt-out language
 * VISUAL_INTERFERENCE: Making the "right" (user's) choice hard to see
 *
 * Strategy: Deterministic checks on button/link text patterns;
 * LLM for semantic analysis of subtle shame/trick wording.
 */

import { getTrustenLLM } from '../llm/client'
import { REGULATORY_MAP } from '../regulatory/mapping'
import type { AnalyzerContext, AnalyzerResult, DetectedPattern } from '../types'
import { DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

// ─── Confirmshaming patterns ───
// These are phrases typically found on "decline" buttons or links.

const CONFIRMSHAM_NEGATIVE_PATTERNS = [
  /no[,\s]+(?:thanks?[,\s]+)?i\s+don'?t\s+want/i,
  /i\s+(?:already\s+)?(?:have\s+enough|don'?t\s+(?:want|need|care\s+about))/i,
  /i\s+prefer\s+(?:to\s+)?(?:pay|miss|skip|stay|remain)\b/i,
  /no[,\s]+(?:thanks?[,\s]+)?i\s+(?:prefer|like|love|want\s+to\s+keep)/i,
  /i(?:'ll)?\s+(?:pass|skip|miss\s+out)/i,
  /i\s+(?:hate|don'?t\s+like)\s+(?:saving|deals?|discounts?|money)/i,
  /no[,\s]+i\s+(?:hate|dislike|don'?t\s+care)/i,
]

// ─── Trick wording patterns ───
// Double negatives and confusing opt-out language.

const TRICK_WORDING_PATTERNS = [
  /\buncheck\s+(?:this\s+box\s+)?(?:to\s+)?(?:not\s+)?(?:receive|get|join|opt)/i,
  /\bcheck\s+(?:this\s+box\s+)?(?:to\s+)?(?:not\s+)?(?:receive|get|join|opt)/i,
  /\bdo\s+not\s+(?:check|uncheck|select|deselect)\s+(?:this\s+)?(?:box\s+)?(?:if\s+you\s+(?:do\s+)?(?:not\s+)?want)/i,
  /\buncheck\s+(?:this\s+)?(?:box\s+)?if\s+you\s+(?:do\s+)?not\s+want/i,
  /\bopt[\s-]out\b.*\bopt[\s-]in\b/i, // both on same element
  /\bby\s+(?:not\s+)?(?:checking|unchecking|selecting|deselecting)/i,
  /\bdo\s+not\s+tick\s+(?:this\s+)?box\s+if\s+you\s+do\s+not\b/i,
]

// HTML patterns for decline/skip links styled to be hard to see
const WEAK_DECLINE_PATTERNS = [
  /<(?:a|button|span)[^>]+(?:class|style)[^>]*(?:small|tiny|muted|gray|grey|light|secondary|subtle|dismiss|skip)[^>]*>[^<]{3,80}<\/(?:a|button|span)>/gi,
]

export class MisdirectionAnalyzer extends BaseAnalyzer {
  name = 'MisdirectionAnalyzer'
  categories = [
    DarkPatternCategory.CONFIRMSHAMING,
    DarkPatternCategory.TRICK_WORDING,
    DarkPatternCategory.VISUAL_INTERFERENCE,
  ]

  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    const patterns: DetectedPattern[] = []
    const text =
      context.visibleText || this.extractVisibleText(context.domSnapshot)

    patterns.push(
      ...this.detectConfirmshaming(text, context),
      ...this.detectTrickWording(text, context),
      ...this.detectVisualInterference(context.domSnapshot, context),
    )

    // LLM for semantic analysis of edge cases — confirmshaming is language-dependent
    if (patterns.length === 0 || this.hasAmbiguousDeclineLanguage(text)) {
      const llmPatterns = await this.runLLMAnalysis(text, context)
      patterns.push(...llmPatterns)
    }

    return {
      patterns: this.filterByConfidence(this.deduplicatePatterns(patterns)),
    }
  }

  // ─── Deterministic Detectors ───

  private detectConfirmshaming(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, CONFIRMSHAM_NEGATIVE_PATTERNS)
    if (matches.length === 0) return []

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.CONFIRMSHAMING,
        severity: 'high',
        confidence: 0.9,
        description: `Confirmshaming detected: "${m.match}". The decline option is worded to make users feel guilty or foolish for not accepting, manipulating their emotional state to drive compliance.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.CONFIRMSHAMING],
      }),
    )
  }

  private detectTrickWording(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, TRICK_WORDING_PATTERNS)
    if (matches.length === 0) return []

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.TRICK_WORDING,
        severity: 'critical',
        confidence: 0.85,
        description: `Trick wording detected: "${m.match}". Double-negative or confusing opt-out language is used to trick users into consenting to actions they did not intend.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations: REGULATORY_MAP[DarkPatternCategory.TRICK_WORDING],
      }),
    )
  }

  private detectVisualInterference(
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = []

    for (const pattern of WEAK_DECLINE_PATTERNS) {
      const elements = this.findElements(html, pattern)
      if (elements.length === 0) continue

      // Check if the text looks like a decline/skip action
      for (const el of elements.slice(0, 2)) {
        const text = el.text.toLowerCase()
        if (
          text.includes('no') ||
          text.includes('skip') ||
          text.includes("don't") ||
          text.includes('cancel') ||
          text.includes('dismiss') ||
          text.includes('close') ||
          text.includes('later') ||
          text.includes('maybe')
        ) {
          patterns.push(
            this.buildPattern({
              category: DarkPatternCategory.VISUAL_INTERFERENCE,
              severity: 'medium',
              confidence: 0.7,
              description: `Visual interference detected: decline/skip option "${el.text.trim()}" appears to be styled with reduced visual weight (small, muted, or grey) compared to the accept option, making the preferred user choice harder to find.`,
              url: context.url,
              pageTitle: context.pageTitle,
              element: { text: el.text, html: el.html, selector: '' },
              evidence: { domSnapshot: el.html.slice(0, 500) },
              regulatoryViolations:
                REGULATORY_MAP[DarkPatternCategory.VISUAL_INTERFERENCE],
            }),
          )
        }
      }
    }

    return patterns
  }

  // ─── LLM Fallback ───

  private hasAmbiguousDeclineLanguage(text: string): boolean {
    // Marketing copy that might contain subtle confirmshaming
    return (
      /\bno[,\s]+(?:thanks?|thank\s+you)\b/i.test(text) ||
      /\bi(?:'ll)?\s+(?:stay|keep|remain)\b/i.test(text) ||
      /\bi\s+(?:already\s+)?(?:get|have|know)\b/i.test(text)
    )
  }

  private async runLLMAnalysis(
    text: string,
    context: AnalyzerContext,
  ): Promise<DetectedPattern[]> {
    try {
      const llm = getTrustenLLM()
      const raw = await llm.analyzeForPatterns({
        analysisType:
          'confirmshaming, trick_wording, visual_interference — look for decline buttons phrased to make users feel guilty, double-negative opt-out language, and unequal visual treatment of accept vs decline choices',
        context: text.slice(0, 3000),
      })

      return this.parseLLMResponse(raw, context)
    } catch {
      return []
    }
  }

  private parseLLMResponse(
    raw: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    try {
      const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as {
        patterns?: Array<{
          category: string
          severity: string
          confidence: number
          description: string
          evidence_text: string
        }>
      }

      if (!json.patterns) return []

      const categoryMap: Record<string, DarkPatternCategory> = {
        confirmshaming: DarkPatternCategory.CONFIRMSHAMING,
        trick_wording: DarkPatternCategory.TRICK_WORDING,
        visual_interference: DarkPatternCategory.VISUAL_INTERFERENCE,
      }

      return json.patterns
        .filter((p) => p.confidence >= 0.7)
        .map((p) => {
          const category =
            categoryMap[p.category] ?? DarkPatternCategory.CONFIRMSHAMING
          return this.buildPattern({
            category,
            severity:
              (p.severity as 'critical' | 'high' | 'medium' | 'low') ??
              'medium',
            confidence: p.confidence,
            description: p.description,
            url: context.url,
            pageTitle: context.pageTitle,
            element: { text: p.evidence_text, html: '', selector: '' },
            regulatoryViolations: REGULATORY_MAP[category],
          })
        })
    } catch {
      return []
    }
  }
}
