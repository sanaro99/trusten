/**
 * Analyzer 11 — Visual LLM Analyzer
 *
 * Sends the page screenshot + visible text to a vision-capable LLM to detect
 * dark patterns that are invisible to regex but visible in the rendered page:
 *
 * - Countdown timers rendered in JS/CSS
 * - Asymmetric button styling (bright "Accept", grey "Reject")
 * - Fake scarcity badges ("Only 2 left!")
 * - Inflated crossed-out prices / fake discounts
 * - Social proof counters ("1,234 sold today")
 * - Confirmshaming opt-out language
 * - Visual hierarchy manipulation ("Recommended" on expensive plans)
 *
 * This analyzer always runs the LLM — it is NOT a fallback. It is the primary
 * defense against visual patterns that text-only analyzers miss.
 */

import { getTrustenLLM } from '../llm/client'
import { REGULATORY_MAP } from '../regulatory/mapping'
import type { AnalyzerContext, AnalyzerResult, DetectedPattern } from '../types'
import { DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

const CATEGORY_MAP: Record<string, DarkPatternCategory> = {
  fake_urgency: DarkPatternCategory.FAKE_URGENCY,
  fake_scarcity: DarkPatternCategory.FAKE_SCARCITY,
  fake_social_proof: DarkPatternCategory.FAKE_SOCIAL_PROOF,
  basket_sneaking: DarkPatternCategory.BASKET_SNEAKING,
  drip_pricing: DarkPatternCategory.DRIP_PRICING,
  bait_and_switch: DarkPatternCategory.BAIT_AND_SWITCH,
  confirmshaming: DarkPatternCategory.CONFIRMSHAMING,
  trick_wording: DarkPatternCategory.TRICK_WORDING,
  visual_interference: DarkPatternCategory.VISUAL_INTERFERENCE,
  preselected_options: DarkPatternCategory.PRESELECTED_OPTIONS,
  information_hiding: DarkPatternCategory.INFORMATION_HIDING,
  fake_hierarchy: DarkPatternCategory.FAKE_HIERARCHY,
  privacy_zuckering: DarkPatternCategory.PRIVACY_ZUCKERING,
  dark_consent: DarkPatternCategory.DARK_CONSENT,
  roach_motel: DarkPatternCategory.ROACH_MOTEL,
  forced_registration: DarkPatternCategory.FORCED_REGISTRATION,
  comparison_prevention: DarkPatternCategory.COMPARISON_PREVENTION,
}

export class VisualAnalyzer extends BaseAnalyzer {
  name = 'VisualAnalyzer'
  categories = Object.values(DarkPatternCategory)

  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    // Need at least some text or a screenshot to analyze
    if (!context.visibleText && !context.screenshotBase64) {
      return { patterns: [] }
    }

    const text =
      context.visibleText || this.extractVisibleText(context.domSnapshot)

    try {
      const llm = getTrustenLLM()
      const raw = await llm.analyzeForPatterns({
        analysisType:
          'comprehensive visual dark pattern scan — examine ALL categories including visual design manipulation, countdown timers, fake social proof, asymmetric button styling, price inflation, and consent dark patterns',
        context: text.slice(0, 4000),
        screenshotBase64: context.screenshotBase64 || undefined,
      })

      return { patterns: this.parseLLMResponse(raw, context) }
    } catch {
      return { patterns: [] }
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

      if (!Array.isArray(json.patterns)) return []

      return json.patterns
        .filter((p) => p.confidence >= 0.65)
        .map((p) => {
          const category =
            CATEGORY_MAP[p.category] ?? DarkPatternCategory.FAKE_URGENCY
          return this.buildPattern({
            category,
            severity: (['critical', 'high', 'medium', 'low'].includes(
              p.severity,
            )
              ? p.severity
              : 'medium') as 'critical' | 'high' | 'medium' | 'low',
            confidence: Math.min(1, p.confidence),
            description: p.description,
            url: context.url,
            pageTitle: context.pageTitle,
            element: { text: p.evidence_text ?? '', html: '', selector: '' },
            evidence: {
              domSnapshot: p.evidence_text,
              screenshot: context.screenshotBase64
                ? '[screenshot analyzed]'
                : undefined,
            },
            regulatoryViolations: REGULATORY_MAP[category] ?? [],
          })
        })
    } catch {
      return []
    }
  }
}
