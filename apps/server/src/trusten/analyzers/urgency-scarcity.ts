/**
 * Analyzer 1 — Urgency & Scarcity
 *
 * Detects manufactured urgency and artificial scarcity signals:
 * FAKE_URGENCY:      Countdown timers, "offer expires", "limited time"
 * FAKE_SCARCITY:     "Only X left", "X people viewing this now"
 * FAKE_SOCIAL_PROOF: "Y bought today", "Z watching", suspicious counters
 *
 * Strategy: deterministic regex + DOM structure checks first;
 * LLM only when urgency language is embedded in marketing copy.
 */

import { getTrustenLLM } from '../llm/client'
import { REGULATORY_MAP } from '../regulatory/mapping'
import type { AnalyzerContext, AnalyzerResult, DetectedPattern } from '../types'
import { DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

// ─── Keyword Lists ───

const URGENCY_PATTERNS = [
  /\blimited[\s-]time\b/i,
  /\boffer\s+expires?\b/i,
  /\bends?\s+(?:today|tonight|soon|in)\b/i,
  /\bact\s+now\b/i,
  /\bhurry\b/i,
  /\blast\s+chance\b/i,
  /\bdon'?t\s+miss\b/i,
  /\bexpires?\s+in\b/i,
  /\bflash\s+(?:sale|deal)\b/i,
  /\blightning\s+deal\b/i,
  /\bdoorb?uster\b/i,
  /\btoday\s+only\b/i,
  /\bwhile\s+(?:supplies|stocks?)\s+last\b/i,
  /\b(?:sale|deal)\s+ends?\b/i,
  /\b\d+\s*:\s*\d{2}\s*:\s*\d{2}\b/, // time countdown HH:MM:SS
  /\bhours?\s+left\b/i,
  /\bminutes?\s+left\b/i,
]

const SCARCITY_PATTERNS = [
  /\bonly\s+\d+\s+left\b/i,
  /\b\d+\s+(?:items?|units?|left)\s+in\s+stock\b/i,
  /\blow\s+(?:stock|inventory)\b/i,
  /\balmost\s+(?:gone|sold\s+out)\b/i,
  /\bselling\s+(?:fast|quickly)\b/i,
  /\b\d+\s+people\s+(?:are\s+)?viewing\b/i,
  /\b\d+\s+watching\b/i,
  /\b(?:high|popular)\s+demand\b/i,
  /\bonly\s+\d+\s+remaining\b/i,
  /\blast\s+\d+\s+(?:items?|units?)\b/i,
]

const SOCIAL_PROOF_PATTERNS = [
  /\b[\d,]+\s+(?:people\s+)?bought\s+(?:today|this\s+(?:week|month))\b/i,
  /\b[\d,]+\s+(?:customers?\s+)?purchased\b/i,
  /\b[\d,]+\s+watching\s+(?:now|this)\b/i,
  /\b[\d,]+\s+(?:others?\s+)?(?:viewed|looked\s+at)\s+this\b/i,
  /\btrending\b.*\b(?:today|now|this\s+week)\b/i,
  /\b#\d+\s+(?:best\s*)?seller\b/i,
  /\bmost[\s-]popular\b/i,
]

// CSS selectors that are common for countdown timers
const TIMER_SELECTORS = [
  'countdown',
  'timer',
  'count-down',
  'deal-timer',
  'offer-timer',
  'flash-timer',
  'sale-timer',
]

export class UrgencyScarcityAnalyzer extends BaseAnalyzer {
  name = 'UrgencyScarcityAnalyzer'
  categories = [
    DarkPatternCategory.FAKE_URGENCY,
    DarkPatternCategory.FAKE_SCARCITY,
    DarkPatternCategory.FAKE_SOCIAL_PROOF,
  ]

  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    const patterns: DetectedPattern[] = []
    const text =
      context.visibleText || this.extractVisibleText(context.domSnapshot)

    patterns.push(
      ...this.detectUrgency(text, context),
      ...this.detectCountdownTimers(context.domSnapshot, context),
      ...this.detectScriptBasedTimers(context.domSnapshot, context),
      ...this.detectFakeStrikethroughPrices(context.domSnapshot, context),
      ...this.detectScarcity(text, context),
      ...this.detectSocialProof(text, context),
    )

    // LLM pass for subtle cases when we find borderline evidence
    const hasWeakSignal =
      patterns.length === 0 && this.hasWeakUrgencySignal(text)

    if (hasWeakSignal) {
      const llmPatterns = await this.runLLMAnalysis(text, context)
      patterns.push(...llmPatterns)
    }

    return {
      patterns: this.filterByConfidence(this.deduplicatePatterns(patterns)),
    }
  }

  // ─── Deterministic Detectors ───

  private detectUrgency(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, URGENCY_PATTERNS)
    if (matches.length === 0) return []

    return matches.slice(0, 3).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.FAKE_URGENCY,
        severity: 'high',
        confidence: 0.85,
        description: `Urgency language detected: "${m.match}". Manufactured time pressure is a dark pattern that exploits loss aversion to rush purchasing decisions.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.match, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations: REGULATORY_MAP[DarkPatternCategory.FAKE_URGENCY],
      }),
    )
  }

  private detectCountdownTimers(
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    // A timer-like class/id is the strong, specific signal.
    const timerPattern = new RegExp(
      `<[^>]+(?:class|id)="[^"]*(?:${TIMER_SELECTORS.join('|')})[^"]*"[^>]*>[^<]*</[^>]+>`,
      'gi',
    )
    const timerElements = this.findElements(html, timerPattern)

    // A bare HH:MM:SS / MM:SS in the markup is NOT enough — it matches scripts,
    // SVG, data-attributes, prices, etc. (that produced false positives). Only
    // count a clock in the *visible* text when urgency language corroborates it.
    const visibleText = context.visibleText || this.extractVisibleText(html)
    const clockMatch = visibleText.match(
      /\b\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\b/,
    )
    const urgencyNearby = URGENCY_PATTERNS.some((p) => p.test(visibleText))
    const corroboratedClock = clockMatch !== null && urgencyNearby

    if (timerElements.length === 0 && !corroboratedClock) return []

    const hasElement = timerElements.length > 0
    return [
      this.buildPattern({
        category: DarkPatternCategory.FAKE_URGENCY,
        severity: hasElement ? 'critical' : 'high',
        confidence: hasElement ? 0.85 : 0.7,
        description: hasElement
          ? 'Countdown timer element detected (its class/id marks it as a timer). Timers create artificial urgency; if it resets on page reload it constitutes fake urgency.'
          : 'A countdown-style clock appears in the visible page text alongside urgency language, suggesting manufactured time pressure.',
        url: context.url,
        pageTitle: context.pageTitle,
        element: hasElement
          ? {
              text: timerElements[0].text,
              html: timerElements[0].html,
              selector:
                '[class*=timer],[id*=timer],[class*=countdown],[id*=countdown]',
            }
          : { text: clockMatch?.[0] ?? '', html: '', selector: '' },
        evidence: {
          domSnapshot: hasElement
            ? timerElements[0].html
            : (clockMatch?.[0] ?? ''),
        },
        regulatoryViolations: REGULATORY_MAP[DarkPatternCategory.FAKE_URGENCY],
      }),
    ]
  }

  private detectScarcity(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, SCARCITY_PATTERNS)
    if (matches.length === 0) return []

    return matches.slice(0, 3).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.FAKE_SCARCITY,
        severity: 'high',
        confidence: 0.8,
        description: `Scarcity claim detected: "${m.match}". Artificial scarcity exploits FOMO (fear of missing out) to pressure users into immediate purchases.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.match, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations: REGULATORY_MAP[DarkPatternCategory.FAKE_SCARCITY],
      }),
    )
  }

  private detectSocialProof(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, SOCIAL_PROOF_PATTERNS)
    if (matches.length === 0) return []

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.FAKE_SOCIAL_PROOF,
        severity: 'medium',
        confidence: 0.75,
        description: `Suspicious social proof counter detected: "${m.match}". Real-time counters like "X people viewing" are often randomized or fabricated to create false social pressure.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.match, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.FAKE_SOCIAL_PROOF],
      }),
    )
  }

  /**
   * Detects countdown timers driven by JavaScript setInterval/setTimeout.
   * Sites often use JS to tick down a timer — the JS source will contain
   * variable names like "countdown", "timerSeconds", "dealExpiry", etc.
   */
  private detectScriptBasedTimers(
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    // Look for inline script tags containing countdown/timer JS patterns
    const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi
    const timerVarPattern =
      /(?:countdown|timer|time_?left|deal_?expir|sale_?ends?|hours?_?left|minutes?_?left|seconds?_?left|deal_?timer)\s*[=:]/i
    const intervalPattern =
      /set(?:Interval|Timeout)\s*\([^)]*(?:\d{1,5}|timer|countdown|tick)/i

    const scriptMatches = [...html.matchAll(scriptPattern)]
    for (const match of scriptMatches) {
      const scriptContent = match[1] ?? ''
      if (
        timerVarPattern.test(scriptContent) &&
        intervalPattern.test(scriptContent)
      ) {
        return [
          this.buildPattern({
            category: DarkPatternCategory.FAKE_URGENCY,
            severity: 'critical',
            confidence: 0.92,
            description:
              'JavaScript-driven countdown timer detected. The page uses setInterval/setTimeout with timer variables to display a countdown. These timers almost always reset on page reload, proving they are manufactured urgency — not real deadlines.',
            url: context.url,
            pageTitle: context.pageTitle,
            element: {
              text: scriptContent.slice(0, 100),
              html: match[0].slice(0, 200),
              selector:
                '[class*=timer],[class*=countdown],[id*=timer],[id*=countdown]',
            },
            evidence: { domSnapshot: scriptContent.slice(0, 300) },
            regulatoryViolations:
              REGULATORY_MAP[DarkPatternCategory.FAKE_URGENCY],
          }),
        ]
      }
    }
    return []
  }

  /**
   * Detects fake strikethrough/crossed-out "original" prices.
   * Sites show a higher original price crossed out next to a "sale" price.
   * When the original price was never real, this is a deceptive dark pattern.
   */
  private detectFakeStrikethroughPrices(
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    // Look for <del>, <s>, <strike> tags, or CSS strikethrough classes near price patterns
    const strikethroughTags =
      /<(?:del|s|strike)[^>]*>([^<]{1,50})<\/(?:del|s|strike)>/gi
    const strikethroughClasses =
      /<[^>]+class="[^"]*(?:strike|strikethrough|was-price|original-price|list-price|before-price|old-price|crossed)[^"]*"[^>]*>([^<]{1,60})<\/[^>]+>/gi
    const pricePattern = /[$£€¥₹]\s*[\d,]+(?:\.\d{2})?/

    const tagMatches = [...html.matchAll(strikethroughTags)]
    const classMatches = [...html.matchAll(strikethroughClasses)]
    const allMatches = [...tagMatches, ...classMatches]

    const priceMatches = allMatches.filter((m) => pricePattern.test(m[1] ?? ''))
    if (priceMatches.length === 0) return []

    return [
      this.buildPattern({
        category: DarkPatternCategory.FAKE_URGENCY,
        severity: 'high',
        confidence: 0.82,
        description: `Strikethrough "original" price detected: "${(priceMatches[0][1] ?? '').trim()}". Sites frequently inflate the crossed-out price to make the sale discount appear larger than it really is (reference price manipulation). This violates FTC pricing guidelines and the EU Consumer Rights Directive.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: {
          text: (priceMatches[0][1] ?? '').trim(),
          html: priceMatches[0][0].slice(0, 200),
          selector:
            'del, s, [class*=strike],[class*=was-price],[class*=original-price],[class*=old-price]',
        },
        evidence: {
          domSnapshot: priceMatches
            .slice(0, 3)
            .map((m) => m[0])
            .join(' | '),
        },
        regulatoryViolations: REGULATORY_MAP[DarkPatternCategory.FAKE_URGENCY],
      }),
    ]
  }

  // ─── LLM Fallback ───

  private hasWeakUrgencySignal(text: string): boolean {
    const weakSignals = [
      /\bdon'?t\s+wait\b/i,
      /\bget\s+(?:it\s+)?(?:now|today)\b/i,
      /\bsave\s+\d+%?\s+(?:today|now)\b/i,
      /\bexclusive\s+(?:deal|offer|discount)\b/i,
    ]
    return this.hasKeywords(text, []) || weakSignals.some((p) => p.test(text))
  }

  private async runLLMAnalysis(
    text: string,
    context: AnalyzerContext,
  ): Promise<DetectedPattern[]> {
    try {
      const llm = getTrustenLLM()
      const raw = await llm.analyzeForPatterns({
        analysisType: 'urgency_scarcity_fake_social_proof',
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
        .map((p) => {
          const category =
            p.category === 'fake_scarcity'
              ? DarkPatternCategory.FAKE_SCARCITY
              : p.category === 'fake_social_proof'
                ? DarkPatternCategory.FAKE_SOCIAL_PROOF
                : DarkPatternCategory.FAKE_URGENCY

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
