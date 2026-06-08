/**
 * Analyzer 10 — Interface Manipulation
 *
 * Detects visual design manipulation that biases user choice:
 * FAKE_HIERARCHY: Visual weight placed on preferred (merchant) option,
 *                 making the user's preferred option (decline, cheaper plan)
 *                 visually subordinate.
 */

import { getTrustenLLM } from '../llm/client'
import { REGULATORY_MAP } from '../regulatory/mapping'
import type { AnalyzerContext, AnalyzerResult, DetectedPattern } from '../types'
import { DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

// ─── Fake hierarchy signals ───

// Buttons styled as "most popular" or "best value" — biasing without neutral comparison
const BIASED_BADGE_PATTERNS = [
  /\bmost\s+popular\b/i,
  /\bbest\s+(?:value|deal|choice|plan|seller)\b/i,
  /\brecommended\b/i,
  /\beditor'?s?\s+choice\b/i,
  /\btop\s+(?:pick|choice|seller)\b/i,
  /\b#1\s+(?:choice|pick|seller|plan)\b/i,
]

// Pricing page patterns where one option is visually inflated
const PRICING_HIERARCHY_PATTERN =
  /<(?:div|article|section)[^>]+(?:class|id)="[^"]*(?:pricing|plan|tier|package)[^"]*"[^>]*>[\s\S]{0,2000}(?:most\s+popular|best\s+value|recommended)/gi

// "Dark" button for expensive option vs plain link for cheap/cancel option
const VISUAL_WEIGHT_PATTERN =
  /<button[^>]+(?:class|style)="[^"]*(?:primary|cta|hero|highlight|btn-lg|large)[^"]*"[^>]*>[\s\S]{0,100}(?:upgrade|premium|pro|subscribe|buy|purchase)[\s\S]{0,100}<\/button>/gi

export class InterfaceManipulationAnalyzer extends BaseAnalyzer {
  name = 'InterfaceManipulationAnalyzer'
  categories = [DarkPatternCategory.FAKE_HIERARCHY]

  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    const patterns: DetectedPattern[] = []
    const text =
      context.visibleText || this.extractVisibleText(context.domSnapshot)

    patterns.push(
      ...this.detectFakeHierarchy(text, context.domSnapshot, context),
      ...this.detectRecommendedOnExpensivePlan(context.domSnapshot, context),
      ...this.detectConsentButtonAsymmetry(context.domSnapshot, context),
    )

    // LLM for visual context we cannot fully assess from HTML alone
    if (patterns.length === 0 && this.hasPricingContext(text)) {
      const llmPatterns = await this.runLLMAnalysis(text, context)
      patterns.push(...llmPatterns)
    }

    return {
      patterns: this.filterByConfidence(this.deduplicatePatterns(patterns)),
    }
  }

  private detectFakeHierarchy(
    text: string,
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = []

    // Biased promotional badges
    const badgeMatches = this.findKeywordMatches(text, BIASED_BADGE_PATTERNS)
    for (const m of badgeMatches.slice(0, 2)) {
      patterns.push(
        this.buildPattern({
          category: DarkPatternCategory.FAKE_HIERARCHY,
          severity: 'medium',
          confidence: 0.72,
          description: `Fake hierarchy via biased badge: "${m.match}". Labels like "Most Popular" or "Best Value" are subjective claims used to steer users toward higher-priced options without objective justification.`,
          url: context.url,
          pageTitle: context.pageTitle,
          element: { text: m.context, html: '', selector: '' },
          evidence: { domSnapshot: m.context },
          regulatoryViolations:
            REGULATORY_MAP[DarkPatternCategory.FAKE_HIERARCHY],
        }),
      )
    }

    // Pricing page with highlighted tier
    const highlightedPricingElements = this.findElements(
      html,
      PRICING_HIERARCHY_PATTERN,
    )
    if (highlightedPricingElements.length > 0) {
      const el = highlightedPricingElements[0]
      patterns.push(
        this.buildPattern({
          category: DarkPatternCategory.FAKE_HIERARCHY,
          severity: 'medium',
          confidence: 0.75,
          description:
            'Fake visual hierarchy on pricing page: one plan is visually inflated (larger card, highlighted border, badge) to steer users toward it without presenting a neutral comparison.',
          url: context.url,
          pageTitle: context.pageTitle,
          element: {
            text: el.text.slice(0, 200),
            html: el.html.slice(0, 300),
            selector: '[class*=pricing],[class*=plan]',
          },
          evidence: { domSnapshot: el.html.slice(0, 500) },
          regulatoryViolations:
            REGULATORY_MAP[DarkPatternCategory.FAKE_HIERARCHY],
        }),
      )
    }

    // Large CTA button for expensive action vs text link for cheap/cancel
    const heavyCTA = this.findElements(html, VISUAL_WEIGHT_PATTERN)
    if (heavyCTA.length > 0) {
      const el = heavyCTA[0]
      // Only flag if we can also find a weaker decline nearby
      const hasWeakDecline =
        /(?:no\s+thanks?|maybe\s+later|skip|continue\s+with\s+free)/i.test(
          el.html,
        ) ||
        /<(?:a|span|small)[^>]*>(?:no\s+thanks?|maybe\s+later|skip)[^<]*<\/(?:a|span|small)>/i.test(
          html.slice(
            Math.max(0, html.indexOf(el.html) - 500),
            html.indexOf(el.html) + el.html.length + 500,
          ),
        )

      if (hasWeakDecline) {
        patterns.push(
          this.buildPattern({
            category: DarkPatternCategory.FAKE_HIERARCHY,
            severity: 'high',
            confidence: 0.8,
            description: `Asymmetric visual hierarchy: the upgrade/purchase action uses a large, prominent button while the decline option ("No thanks", "Skip", "Continue free") is a small text link. This exploits visual salience to bias the user's choice.`,
            url: context.url,
            pageTitle: context.pageTitle,
            element: {
              text: el.text.slice(0, 150),
              html: el.html.slice(0, 300),
              selector: 'button.primary,[class*=cta]',
            },
            evidence: { domSnapshot: el.html.slice(0, 400) },
            regulatoryViolations:
              REGULATORY_MAP[DarkPatternCategory.FAKE_HIERARCHY],
          }),
        )
      }
    }

    return patterns
  }

  /**
   * Detects "Recommended" / "Most Popular" badges placed on the highest-priced plan.
   * Strategy: parse pricing cards, find the one with a badge, extract its price,
   * compare to other plan prices — if it's the most expensive, flag it.
   */
  private detectRecommendedOnExpensivePlan(
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    // Find pricing card containers
    const pricingCardPattern =
      /<(?:div|article|li|section)[^>]+(?:class|id)="[^"]*(?:plan|tier|package|pricing|price-card)[^"]*"[^>]*>([\s\S]{50,2000}?)<\/(?:div|article|li|section)>/gi
    const cards = [...html.matchAll(pricingCardPattern)]
    if (cards.length < 2) return []

    const BADGE_RE =
      /(?:most\s+popular|best\s+value|recommended|top\s+pick|#1\s+choice)/i
    const PRICE_RE = /[$£€¥₹]\s*([\d,]+)(?:\.\d{2})?/g

    const cardData = cards.map((m) => {
      const content = m[1] ?? ''
      const hasBadge = BADGE_RE.test(content)
      const prices = [...content.matchAll(PRICE_RE)].map((p) =>
        parseFloat((p[1] ?? '0').replace(/,/g, '')),
      )
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0
      return {
        hasBadge,
        maxPrice,
        html: m[0].slice(0, 300),
        text: content.slice(0, 200),
      }
    })

    const badgedCard = cardData.find((c) => c.hasBadge)
    if (!badgedCard || badgedCard.maxPrice === 0) return []

    const otherPrices = cardData
      .filter((c) => !c.hasBadge && c.maxPrice > 0)
      .map((c) => c.maxPrice)
    if (otherPrices.length === 0) return []

    const isExpensive = badgedCard.maxPrice >= Math.max(...otherPrices)
    if (!isExpensive) return []

    return [
      this.buildPattern({
        category: DarkPatternCategory.FAKE_HIERARCHY,
        severity: 'high',
        confidence: 0.88,
        description: `"Recommended" or "Most Popular" badge placed on the most expensive pricing plan ($${badgedCard.maxPrice}). This steers users toward the highest-priced option under the guise of a neutral recommendation, exploiting trust and authority bias.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: {
          text: badgedCard.text.slice(0, 150),
          html: badgedCard.html,
          selector:
            '[class*=plan][class*=popular],[class*=plan][class*=recommend],[class*=recommended],[class*=highlighted]',
        },
        evidence: { domSnapshot: badgedCard.html },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.FAKE_HIERARCHY],
      }),
    ]
  }

  /**
   * Detects consent dialogs where Accept/Agree uses a visually dominant button
   * while Reject/Decline is styled as a ghost button, text link, or is hidden.
   * This is one of the most clear-cut GDPR dark patterns.
   */
  private detectConsentButtonAsymmetry(
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    // Find consent/cookie banner containers
    const bannerPattern =
      /<(?:div|section|aside)[^>]+(?:class|id)="[^"]*(?:cookie|consent|gdpr|privacy-notice|banner|notice)[^"]*"[^>]*>([\s\S]{20,3000}?)<\/(?:div|section|aside)>/gi
    const banners = [...html.matchAll(bannerPattern)]
    if (banners.length === 0) return []

    const ACCEPT_RE =
      /\b(?:accept|agree|allow|ok|yes|got\s+it|i\s+accept|i\s+agree)\b/i
    const REJECT_RE =
      /\b(?:reject|decline|refuse|no\s+thanks?|manage|settings?|customize|later)\b/i
    // A dominant button has primary/filled style; a ghost/link has outline or text-only style
    const DOMINANT_BTN_RE =
      /<button[^>]+(?:class|style)="[^"]*(?:primary|filled|bg-|background|btn-success|btn-primary|accept|allow)[^"]*"[^>]*>/i
    const GHOST_RE =
      /<(?:button|a)[^>]+(?:class|style)="[^"]*(?:outline|ghost|text-only|link|secondary|subtle|btn-link|btn-outline)[^"]*"[^>]*>/i

    for (const banner of banners) {
      const content = banner[1] ?? ''
      const hasAccept = ACCEPT_RE.test(content)
      const hasReject = REJECT_RE.test(content)
      if (!hasAccept || !hasReject) continue

      const hasDominantAccept = DOMINANT_BTN_RE.test(content)
      const hasGhostReject = GHOST_RE.test(content)

      if (hasDominantAccept && hasGhostReject) {
        return [
          this.buildPattern({
            category: DarkPatternCategory.FAKE_HIERARCHY,
            severity: 'critical',
            confidence: 0.9,
            description:
              'Cookie/consent dialog with asymmetric button styling: the "Accept" action uses a visually prominent filled button while "Reject/Decline/Settings" is styled as a ghost button or text link. This violates GDPR Article 7 — consent must be as easy to withdraw as to give, implying equal visual prominence.',
            url: context.url,
            pageTitle: context.pageTitle,
            element: {
              text: content.slice(0, 150),
              html: banner[0].slice(0, 300),
              selector:
                '[class*=cookie],[class*=consent],[class*=gdpr],[class*=notice]',
            },
            evidence: { domSnapshot: banner[0].slice(0, 500) },
            regulatoryViolations:
              REGULATORY_MAP[DarkPatternCategory.FAKE_HIERARCHY],
          }),
        ]
      }
    }
    return []
  }

  // ─── LLM Fallback ───

  private hasPricingContext(text: string): boolean {
    return (
      /\b(?:plan|tier|pricing|subscription)\b/i.test(text) &&
      /\b(?:month|year|annual|free|pro|premium)\b/i.test(text)
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
          'fake_hierarchy — look for visual design manipulation: one option given more visual prominence to steer users, biased labels (Most Popular, Recommended) without objective basis, asymmetric button styling',
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

      return json.patterns
        .filter((p) => p.confidence >= 0.7)
        .map((p) =>
          this.buildPattern({
            category: DarkPatternCategory.FAKE_HIERARCHY,
            severity:
              (p.severity as 'critical' | 'high' | 'medium' | 'low') ??
              'medium',
            confidence: p.confidence,
            description: p.description,
            url: context.url,
            pageTitle: context.pageTitle,
            element: { text: p.evidence_text, html: '', selector: '' },
            regulatoryViolations:
              REGULATORY_MAP[DarkPatternCategory.FAKE_HIERARCHY],
          }),
        )
    } catch {
      return []
    }
  }
}
