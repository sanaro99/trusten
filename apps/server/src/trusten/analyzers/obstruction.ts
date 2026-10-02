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

const SELF_SERVICE_CANCEL =
  /(?:^|[.!?]\s*|\b(?:or|can|may)\s+)cancel\s+(?:online|in\s+your\s+account)\b/i

// ─── Subscription page patterns ───

const SUBSCRIPTION_INDICATORS = [
  /\b(?:monthly|annual|yearly|paid)\s+(?:plan|subscription|membership|billing)\b/i,
  /[$£€]\s*[\d,.]+\s*(?:\/\s*|per\s+|every\s+|each\s+)(?:month|year|week|day)\b/i,
  /\brecurring\s+(?:charge|billing|payment)\b/i,
  /\bsubscription\s+(?:will\s+)?(?:auto[\s-]?renew|continue|roll\s+over)\b/i,
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

    // Missing cancellation copy alone cannot establish obstruction.
    if (
      isSubscriptionPage &&
      this.findCancellationFriction(text).length > 0 &&
      patterns.length < 2 &&
      this.hasAmbiguousCancelTerms(text)
    ) {
      const llmPatterns = await this.runLLMAnalysis({
        analysisType:
          'roach_motel, forced_continuity, hard_to_cancel — require observed cancellation friction or recurring billing evidence; missing cancellation copy alone is insufficient. Do not infer phone-only cancellation from a phone option.',
        context,
        text,
        categoryMap: {
          roach_motel: DarkPatternCategory.ROACH_MOTEL,
          forced_continuity: DarkPatternCategory.FORCED_CONTINUITY,
          hard_to_cancel: DarkPatternCategory.HARD_TO_CANCEL,
        },
        defaultCategory: DarkPatternCategory.ROACH_MOTEL,
        defaultSeverity: 'high',
      })
      patterns.push(...llmPatterns)
    }

    return {
      patterns: this.filterByConfidence(this.deduplicatePatterns(patterns)),
    }
  }

  // ─── Deterministic Detectors ───

  private findCancellationFriction(text: string) {
    return this.findKeywordMatches(text, HARD_TO_CANCEL_SIGNALS).filter((m) => {
      const supportOption = /\b(?:call|chat|contact|phone|calling)\b/i.test(
        m.match,
      )
      return !supportOption || !SELF_SERVICE_CANCEL.test(m.context)
    })
  }

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
      }),
    )
  }

  private detectHardToCancel(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findCancellationFriction(text)
    if (matches.length === 0) return []

    const hasPhoneInstruction = /\bcall\s+(?:us\s+)?to\s+cancel\b/i.test(text)
    const hasFee = /cancell?ation\s+fee\b/i.test(text)

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.HARD_TO_CANCEL,
        severity: hasFee ? 'critical' : 'high',
        confidence: 0.9,
        description: `Hard-to-cancel detected: "${m.match}". ${
          hasPhoneInstruction
            ? 'The page directs users to call to cancel. This may add friction; the snapshot does not establish whether other cancellation options exist.'
            : hasFee
              ? 'The page mentions a cancellation fee that may add cost to ending the service.'
              : 'The page describes a cancellation restriction or support-mediated process that may add friction.'
        }`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
      }),
    )
  }

  private detectRoachMotel(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    // Signup plus observed cancellation friction can support a concern.
    // A missing cancel link on a landing page cannot prove a difficult exit.
    const hasEasySignup =
      /\b(?:sign\s+up|subscribe|join|start\s+(?:free\s+)?trial)\b/i.test(text)
    const hasCancelMechanism = this.findCancellationFriction(text).length > 0

    if (!hasEasySignup) return []

    if (hasCancelMechanism) {
      return [
        this.buildPattern({
          category: DarkPatternCategory.ROACH_MOTEL,
          severity: 'high',
          confidence: 0.72,
          description:
            'Possible roach motel pattern: this paid subscription page promotes sign-up and describes cancellation friction. The observed restriction should be checked against the complete cancellation flow.',
          url: context.url,
          pageTitle: context.pageTitle,
          evidence: { domSnapshot: text.slice(0, 300) },
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
}
