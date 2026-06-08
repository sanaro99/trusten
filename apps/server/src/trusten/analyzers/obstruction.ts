/**
 * Analyzer 4 — Obstruction (Roach Motel)
 *
 * Detects patterns that make it easy to get in but hard to get out:
 * ROACH_MOTEL:        Easy to subscribe, impossible to cancel
 * FORCED_CONTINUITY:  Auto-renew with no clear warning
 * HARD_TO_CANCEL:     Multiple steps, hidden cancel button
 *
 * Strategy: DOM inspection for cancellation-related content, subscription terms,
 * and auto-renewal language. Counts click-depth proxy signals from page content.
 */

import { getTrustenLLM } from '../llm/client'
import { REGULATORY_MAP } from '../regulatory/mapping'
import type { AnalyzerContext, AnalyzerResult, DetectedPattern } from '../types'
import { DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

// ─── Auto-renewal / Forced continuity patterns ───

const FORCED_CONTINUITY_PATTERNS = [
  /\bauto[\s-]?renew(?:al|s)?\b/i,
  /\bautomatic(?:ally)?\s+(?:renew|billed|charged|renewed)\b/i,
  /\brecurring\s+(?:charge|billing|payment)\b/i,
  /\bcontinue[sd]?\s+(?:to\s+be\s+)?(?:charged|billed)\b/i,
  /\bsubscription\s+(?:will\s+)?(?:auto[\s-]?renew|continue|roll\s+over)\b/i,
  /\byou'?ll\s+be\s+(?:charged|billed)\s+\$[\d,.]+\s+(?:per|every|each)\b/i,
  /\btrial\s+ends?.*(?:charged|billed|converted)/i,
  /\bfree\s+trial.*(?:credit\s+card|payment\s+method)\b/i,
  /\bno\s+commitment.*cancel\s+any\s+time\b/i, // "no commitment" often paired with hard cancel
]

// ─── Roach motel: hard-to-cancel signals ───

const HARD_TO_CANCEL_SIGNALS = [
  /\bcall\s+(?:us\s+)?to\s+cancel\b/i,
  /\bchat\s+(?:with\s+(?:us\s+)?)?to\s+cancel\b/i,
  /\bcontact\s+(?:us\s+|support\s+)?to\s+(?:cancel|unsubscribe)\b/i,
  /\bcancel(?:lation)?\s+(?:by\s+)?(?:phone|calling)\b/i,
  /\bwrite\s+(?:to\s+us|a\s+letter)\s+to\s+cancel\b/i,
  /\bsend\s+(?:a\s+)?(?:letter|written)\s+notice\s+to\s+cancel\b/i,
  /\bcancell?ation\s+(?:fee|charge|penalty)\b/i,
  /\bearly\s+termination\s+fee\b/i,
  /\bno\s+refund\s+on\s+(?:cancel|cancell)/i,
]

// ─── Subscription page patterns ───

const SUBSCRIPTION_INDICATORS = [
  /\b(?:subscribe|subscription|membership|plan)\b/i,
  /\b(?:monthly|annual|yearly)\s+(?:plan|subscription|billing)\b/i,
  /\brenew(?:al)?\b/i,
  /\bcontinue\s+(?:my\s+)?membership\b/i,
]

// ─── Absence of cancel signal ───

const CANCEL_PRESENT_PATTERNS = [
  /\bcancel\s+(?:anytime|any\s+time|subscription|membership|plan)\b/i,
  /\beasy\s+(?:to\s+)?cancel\b/i,
  /\bno[\s-]?hassle\s+cancel\b/i,
]

export class ObstructionAnalyzer extends BaseAnalyzer {
  name = 'ObstructionAnalyzer'
  categories = [
    DarkPatternCategory.ROACH_MOTEL,
    DarkPatternCategory.FORCED_CONTINUITY,
    DarkPatternCategory.HARD_TO_CANCEL,
  ]

  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    const patterns: DetectedPattern[] = []
    const text =
      context.visibleText || this.extractVisibleText(context.domSnapshot)

    const isSubscriptionPage = SUBSCRIPTION_INDICATORS.some((p) => p.test(text))

    patterns.push(
      ...this.detectForcedContinuity(text, context),
      ...this.detectHardToCancel(text, context),
    )

    if (isSubscriptionPage) {
      const roachMotelPatterns = this.detectRoachMotel(text, context)
      patterns.push(...roachMotelPatterns)
    }

    // LLM for subscription pages with ambiguous cancel terms
    if (
      isSubscriptionPage &&
      patterns.length < 2 &&
      this.hasAmbiguousCancelTerms(text)
    ) {
      const llmPatterns = await this.runLLMAnalysis(text, context)
      patterns.push(...llmPatterns)
    }

    return {
      patterns: this.filterByConfidence(this.deduplicatePatterns(patterns)),
    }
  }

  // ─── Deterministic Detectors ───

  private detectForcedContinuity(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, FORCED_CONTINUITY_PATTERNS)
    if (matches.length === 0) return []

    // Check if the cancel mechanism is also clearly described
    const hasClearCancel = CANCEL_PRESENT_PATTERNS.some((p) => p.test(text))

    // If auto-renew is mentioned but cancellation instructions are buried,
    // that's forced continuity. If cancel is clearly explained, lower severity.
    const severity = hasClearCancel ? 'medium' : 'high'
    const confidence = hasClearCancel ? 0.65 : 0.82

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.FORCED_CONTINUITY,
        severity,
        confidence,
        description: `Forced continuity detected: "${m.match}". ${
          hasClearCancel
            ? 'Auto-renewal is present but cancellation process should be verified for accessibility.'
            : 'Auto-renewal billing is present without clear, prominent cancellation instructions. Users may be charged unexpectedly after a trial or initial period.'
        }`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.FORCED_CONTINUITY],
      }),
    )
  }

  private detectHardToCancel(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, HARD_TO_CANCEL_SIGNALS)
    if (matches.length === 0) return []

    const isPhoneOnly = /\bcall\s+(?:us\s+)?to\s+cancel\b/i.test(text)
    const hasFee = /cancell?ation\s+fee\b/i.test(text)

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.HARD_TO_CANCEL,
        severity: isPhoneOnly || hasFee ? 'critical' : 'high',
        confidence: 0.9,
        description: `Hard-to-cancel detected: "${m.match}". ${
          isPhoneOnly
            ? 'Cancellation requires a phone call — a deliberate friction mechanism to reduce cancellations.'
            : hasFee
              ? 'Cancellation incurs a fee, trapping users in subscriptions against their interest.'
              : 'Cancellation requires contacting support rather than self-service, creating deliberate friction.'
        }`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.HARD_TO_CANCEL],
      }),
    )
  }

  private detectRoachMotel(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    // Roach motel = subscription page that makes it easy to subscribe
    // but does NOT clearly explain how to cancel
    const hasEasySignup =
      /\b(?:sign\s+up|subscribe|join|start\s+(?:free\s+)?trial)\b/i.test(text)
    const hasCancelInfo = CANCEL_PRESENT_PATTERNS.some((p) => p.test(text))
    const hasCancelMechanism = HARD_TO_CANCEL_SIGNALS.some((p) => p.test(text))

    if (!hasEasySignup) return []

    if (!hasCancelInfo && !hasCancelMechanism) {
      return [
        this.buildPattern({
          category: DarkPatternCategory.ROACH_MOTEL,
          severity: 'high',
          confidence: 0.72,
          description:
            'Roach motel pattern: this subscription page promotes easy sign-up but contains no visible information about how to cancel. Users may not discover cancellation difficulty until after subscribing.',
          url: context.url,
          pageTitle: context.pageTitle,
          evidence: { domSnapshot: text.slice(0, 300) },
          regulatoryViolations: REGULATORY_MAP[DarkPatternCategory.ROACH_MOTEL],
        }),
      ]
    }

    return []
  }

  // ─── LLM Fallback ───

  private hasAmbiguousCancelTerms(text: string): boolean {
    return (
      /\bterms?\b/i.test(text) ||
      /\bpolicy\b/i.test(text) ||
      /\bno\s+(?:commitment|contract)\b/i.test(text)
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
          'roach_motel, forced_continuity, hard_to_cancel — look for hidden auto-renewal, obscured cancellation process, phone-only cancel, cancellation fees',
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
        roach_motel: DarkPatternCategory.ROACH_MOTEL,
        forced_continuity: DarkPatternCategory.FORCED_CONTINUITY,
        hard_to_cancel: DarkPatternCategory.HARD_TO_CANCEL,
      }

      return json.patterns
        .filter((p) => p.confidence >= 0.7)
        .map((p) => {
          const category =
            categoryMap[p.category] ?? DarkPatternCategory.ROACH_MOTEL
          return this.buildPattern({
            category,
            severity:
              (p.severity as 'critical' | 'high' | 'medium' | 'low') ?? 'high',
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
