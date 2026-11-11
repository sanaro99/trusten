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
  /\bexpires?\s+in\b/i,
  /\bflash\s+(?:sale|deal)\b/i,
  /\blightning\s+deal\b/i,
  /\bdoorb?uster\b/i,
  /\btoday\s+only\b/i,
  /\b(?:sale|deal)\s+ends?\b/i,
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
  /\b#\d+\s+(?:best\s*)?seller\b/i,
]

// "Sale ends December 31" names a checkable deadline; it is not pressure.
const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DATED_DEADLINE = new RegExp(
  `^[^.!?]{0,25}?(?:\\b${MONTH}\\.?\\s+\\d{1,2}\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b|\\b\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}\\b)`,
  'i',
)

// A clock is a countdown only when deadline wording sits right beside it.
const COUNTDOWN_WORDING =
  /\b(?:ends?\s+in|expires?\s+in|left|remaining|countdown|hurry|limited[\s-]time|(?:offer|deal|sale)\s+ends?|time\s+left)\b/i
const CLOCK = /\b\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\b/g
const TIME_OF_DAY_BEFORE =
  /\b(?:at|from|until|till|by|between|and|to|opens?|closes?|starts?|rest\s+for|for)\s*$/i
const TIME_OF_DAY_AFTER =
  /^\s*(?:a\.?m\.?|p\.?m\.?|hours?|hrs?|on|o'?clock|[ap])\b/i

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

    const timers = [
      ...this.detectCountdownTimers(context.domSnapshot, context),
      ...this.detectScriptBasedTimers(context.domSnapshot, context),
    ]
    // A timer quotes the wording beside it; don't list that wording twice.
    const quotedByTimer = new Set(timers.map((t) => t.element?.text))
    patterns.push(
      ...timers,
      ...this.detectUrgency(text, context).filter(
        (p) => !quotedByTimer.has(p.element?.text),
      ),
      ...this.detectScarcity(text, context),
      ...this.detectSocialProof(text, context),
    )

    // LLM pass for subtle cases when we find borderline evidence
    const hasWeakSignal =
      patterns.length === 0 && this.hasWeakUrgencySignal(text)

    if (hasWeakSignal) {
      const llmPatterns = await this.runLLMAnalysis({
        analysisType: 'urgency_scarcity_fake_social_proof',
        context,
        text,
        categoryMap: {
          fake_urgency: DarkPatternCategory.FAKE_URGENCY,
          fake_scarcity: DarkPatternCategory.FAKE_SCARCITY,
          fake_social_proof: DarkPatternCategory.FAKE_SOCIAL_PROOF,
        },
        defaultCategory: DarkPatternCategory.FAKE_URGENCY,
      })
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
    const matches = this.findKeywordMatches(text, URGENCY_PATTERNS).filter(
      (m) => !DATED_DEADLINE.test(text.slice(m.index + m.match.length)),
    )
    if (matches.length === 0) return []

    // Wording alone is worth knowing; a working timer is what makes it serious.
    return matches.slice(0, 3).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.FAKE_URGENCY,
        severity: 'medium',
        confidence: 0.85,
        description: `Time pressure detected: "${m.match}". This message encourages a quick decision. Pause and compare your options; this check has not verified whether the deadline is genuine.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.match, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
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
    // Script-drawn timers leave only a unit label ("h") in the markup, so an
    // element counts when it or the rendered page shows a running clock.
    // Without either it is usually unused widget markup.
    const visibleText = context.visibleText || this.extractVisibleText(html)
    const pageShowsClock =
      /\b\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2}\b|\b\d{1,2}\s*h\s*\d{1,2}\s*m\b/i.test(
        visibleText,
      )
    const timerElements = this.findElements(html, timerPattern).filter(
      (el) => /\d/.test(el.text) || pageShowsClock,
    )

    // A bare clock is usually a time of day ("starts at 10:30"). Only count one
    // in the visible text when countdown wording sits right beside it.
    const clockMatch = this.findCountdownClock(visibleText)

    if (timerElements.length === 0 && !clockMatch) return []

    const hasElement = timerElements.length > 0
    return [
      this.buildPattern({
        category: DarkPatternCategory.FAKE_URGENCY,
        severity: 'high',
        confidence: hasElement ? 0.85 : 0.7,
        description: hasElement
          ? 'A countdown timer creates pressure to decide quickly. Take time to compare your options. We have not verified whether this deadline expires or resets.'
          : 'A countdown-style clock appears alongside urgency language. Take time to compare your options; this check has not verified the deadline.',
        url: context.url,
        pageTitle: context.pageTitle,
        element: hasElement
          ? {
              text:
                this.findKeywordMatches(visibleText, URGENCY_PATTERNS)[0]
                  ?.match ||
                (timerElements[0].text.trim().length > 2
                  ? timerElements[0].text
                  : '') ||
                'Countdown timer',
              html: timerElements[0].html,
              selector:
                '[class*=timer],[id*=timer],[class*=countdown],[id*=countdown]',
            }
          : { text: clockMatch ?? '', html: '', selector: '' },
        evidence: {
          domSnapshot: hasElement ? timerElements[0].html : (clockMatch ?? ''),
        },
      }),
    ]
  }

  private findCountdownClock(text: string): string | null {
    for (const clock of text.matchAll(CLOCK)) {
      const start = clock.index ?? 0
      const end = start + clock[0].length
      const before = text.slice(Math.max(0, start - 40), start)
      const after = text.slice(end, end + 40)
      if (TIME_OF_DAY_BEFORE.test(before) || TIME_OF_DAY_AFTER.test(after))
        continue
      if (COUNTDOWN_WORDING.test(`${before} ${after}`)) return clock[0]
      // A running seconds display reads as a countdown beside any sale pressure
      // ("Flash sale 02:14:33"); a plain HH:MM still needs deadline wording.
      const hasSeconds = /:\s*\d{2}\s*:\s*\d{2}$/.test(clock[0])
      const wide = text.slice(Math.max(0, start - 80), end + 80)
      if (hasSeconds && URGENCY_PATTERNS.some((p) => p.test(wide)))
        return clock[0]
    }
    return null
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
        severity: 'medium',
        confidence: 0.8,
        description: `Scarcity claim detected: "${m.match}". Artificial scarcity exploits FOMO (fear of missing out) to pressure users into immediate purchases.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.match, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
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
        intervalPattern.test(scriptContent) &&
        URGENCY_PATTERNS.some((pattern) => pattern.test(context.visibleText))
      ) {
        return [
          this.buildPattern({
            category: DarkPatternCategory.FAKE_URGENCY,
            severity: 'high',
            confidence: 0.92,
            description:
              'Timer code accompanies a visible time-pressure message. You can pause and compare options; this check has not verified whether the deadline expires or resets.',
            url: context.url,
            pageTitle: context.pageTitle,
            element: {
              text:
                this.findKeywordMatches(
                  context.visibleText,
                  URGENCY_PATTERNS,
                )[0]?.match ?? 'Countdown timer',
              html: match[0].slice(0, 200),
              selector:
                '[class*=timer],[class*=countdown],[id*=timer],[id*=countdown]',
            },
            evidence: { domSnapshot: scriptContent.slice(0, 300) },
          }),
        ]
      }
    }
    return []
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
}
