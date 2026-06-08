/**
 * Analyzer 3 — Sneaking
 *
 * Detects patterns that add costs or items without explicit user consent:
 * BASKET_SNEAKING: Pre-added items in cart (insurance, donations, extras)
 * DRIP_PRICING:    Fees revealed late in checkout ("processing fee", "service charge")
 * BAIT_AND_SWITCH: Advertised vs actual product/price discrepancy
 *
 * Strategy: DOM inspection for cart items, fee patterns, price comparisons.
 */

import { getTrustenLLM } from '../llm/client'
import { REGULATORY_MAP } from '../regulatory/mapping'
import type { AnalyzerContext, AnalyzerResult, DetectedPattern } from '../types'
import { DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

// ─── Basket Sneaking: items commonly pre-added ───

const SNEAKED_ITEM_PATTERNS = [
  /\b(?:travel|trip|flight|purchase)\s+(?:insurance|protection)\b/i,
  /\baccident\s+(?:protection|coverage)\b/i,
  /\bextended\s+(?:warranty|guarantee)\b/i,
  /\bpremium\s+(?:membership|subscription)\b/i,
  /\badd[- ]on\s+(?:included|added|selected)\b/i,
  /\bdonation\s+(?:included|added|selected)\b/i,
  /\bsupport\s+(?:a\s+)?(?:charity|cause|ngo)\b.*(?:selected|included)/i,
  /\bservice\s+package\s+(?:included|added|selected)\b/i,
  /\bpre[\s-]selected\b/i,
]

// ─── Drip pricing: fees hidden until checkout ───

const DRIP_PRICING_PATTERNS = [
  /\b(?:service|processing|booking|convenience|resort|facility|platform)\s+fee\b/i,
  /\b(?:handling|shipping|delivery)\s+(?:and\s+handling\s+)?fee\b/i,
  /\btaxes?\s+(?:and\s+fees?|not\s+included)\b/i,
  /\badditional\s+(?:charges?|fees?|costs?)\s+(?:may\s+)?apply\b/i,
  /\bfees?\s+(?:not\s+included|excluded|extra|additional)\b/i,
  /\b\+\s*\$[\d,.]+\s+fee\b/i,
  /\bexcludes?\s+(?:taxes?|fees?|charges?)\b/i,
]

// ─── Bait and switch: price discrepancy signals ───

const BAIT_SWITCH_PATTERNS = [
  /\bwas\s+\$[\d,.]+\s*now\s+\$[\d,.]+\b/i,
  /\boriginal\s+price[^$]*\$[\d,.]+\b/i,
  /\bprice\s+shown\s+(?:at|in)\s+(?:search|listing)\b/i,
  /\bfinal\s+price\s+(?:may|will|could)\s+(?:differ|vary|change)\b/i,
  /\bprice\s+(?:shown|displayed)\s+(?:does\s+not\s+)?include\b/i,
]

export class SneakingAnalyzer extends BaseAnalyzer {
  name = 'SneakingAnalyzer'
  categories = [
    DarkPatternCategory.BASKET_SNEAKING,
    DarkPatternCategory.DRIP_PRICING,
    DarkPatternCategory.BAIT_AND_SWITCH,
  ]

  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    const patterns: DetectedPattern[] = []
    const text =
      context.visibleText || this.extractVisibleText(context.domSnapshot)

    patterns.push(
      ...this.detectBasketSneaking(text, context.domSnapshot, context),
      ...this.detectDripPricing(text, context),
      ...this.detectBaitAndSwitch(text, context),
    )

    // LLM for checkout-specific ambiguous cases
    const hasCheckoutContext =
      /\b(?:cart|basket|checkout|order\s+summary|payment)\b/i.test(text)

    if (hasCheckoutContext && patterns.length < 2) {
      const llmPatterns = await this.runLLMAnalysis(text, context)
      patterns.push(...llmPatterns)
    }

    return {
      patterns: this.filterByConfidence(this.deduplicatePatterns(patterns)),
    }
  }

  // ─── Deterministic Detectors ───

  private detectBasketSneaking(
    text: string,
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    // Basket sneaking ONLY applies inside a cart/order-summary context.
    // Do not flag product detail pages that simply mention insurance as an option.
    const isCartContext =
      /\b(?:your\s+(?:cart|bag|basket|order)|order\s+summary|shopping\s+(?:cart|bag)|checkout)\b/i.test(
        text,
      )
    if (!isCartContext) return []

    const matches = this.findKeywordMatches(text, SNEAKED_ITEM_PATTERNS)

    // Pre-checked checkboxes with a price nearby — strong deterministic signal
    const preCheckedPattern =
      /<input[^>]+type="checkbox"[^>]+checked[^>]*>[\s\S]{0,300}(?:\$[\d,.]+|£[\d,.]+|€[\d,.]+)/gi
    const checkedItems = this.findElements(html, preCheckedPattern)

    // Items that have a "Remove" action — definitively in cart and not user-chosen
    const removePattern =
      /\bremove\b[\s\S]{0,80}(?:insurance|protection|warranty|donation|subscription|membership)/gi
    const removableItems = this.findKeywordMatches(text, [removePattern])

    const findings = [
      ...matches.map((m) => ({
        text: m.context,
        confidence: 0.8,
        evidence: m.match,
      })),
      ...checkedItems.map((e) => ({
        text: e.text,
        confidence: 0.9,
        evidence: 'pre-checked paid add-on',
      })),
      ...removableItems.map((m) => ({
        text: m.context,
        confidence: 0.95,
        evidence: m.match,
      })),
    ]

    if (findings.length === 0) return []

    const best = findings.reduce((a, b) =>
      b.confidence > a.confidence ? b : a,
    )

    return [
      this.buildPattern({
        category: DarkPatternCategory.BASKET_SNEAKING,
        severity: 'critical',
        confidence: best.confidence,
        description: `Basket sneaking in your cart: "${best.evidence.slice(0, 80).trim()}" was added to your order without explicit consent. You must actively remove it — a deceptive default that inflates your total.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: best.text.slice(0, 200), html: '', selector: '' },
        evidence: { domSnapshot: best.text },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.BASKET_SNEAKING],
      }),
    ]
  }

  private detectDripPricing(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, DRIP_PRICING_PATTERNS)
    if (matches.length === 0) return []

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.DRIP_PRICING,
        severity: 'high',
        confidence: 0.8,
        description: `Drip pricing detected: "${m.match}". Fees or charges are revealed late in the checkout process rather than upfront, inflating the final price beyond what was initially advertised.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations: REGULATORY_MAP[DarkPatternCategory.DRIP_PRICING],
      }),
    )
  }

  private detectBaitAndSwitch(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, BAIT_SWITCH_PATTERNS)
    if (matches.length === 0) return []

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.BAIT_AND_SWITCH,
        severity: 'high',
        confidence: 0.75,
        description: `Potential bait-and-switch: "${m.match}". The advertised price or product may differ from what is actually being charged or delivered.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.BAIT_AND_SWITCH],
      }),
    )
  }

  // ─── LLM Fallback ───

  private async runLLMAnalysis(
    text: string,
    context: AnalyzerContext,
  ): Promise<DetectedPattern[]> {
    try {
      const llm = getTrustenLLM()
      const raw = await llm.analyzeForPatterns({
        analysisType:
          'basket_sneaking (pre-added items), drip_pricing (hidden fees), bait_and_switch (price discrepancy) — look in cart/checkout context',
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
        basket_sneaking: DarkPatternCategory.BASKET_SNEAKING,
        drip_pricing: DarkPatternCategory.DRIP_PRICING,
        bait_and_switch: DarkPatternCategory.BAIT_AND_SWITCH,
      }

      return json.patterns
        .filter((p) => p.confidence >= 0.7)
        .map((p) => {
          const category =
            categoryMap[p.category] ?? DarkPatternCategory.DRIP_PRICING
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
