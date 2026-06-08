/**
 * Analyzer 6 — Preselection
 *
 * Detects patterns that use default selections against user interest:
 * PRESELECTED_OPTIONS: Pre-checked boxes for newsletters, offers, insurance
 * HIDDEN_DEFAULTS:     Defaults set against user interest (opt-in by default)
 */

import { REGULATORY_MAP } from '../regulatory/mapping'
import type { AnalyzerContext, AnalyzerResult, DetectedPattern } from '../types'
import { DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

// Checkbox elements that are checked by default
const CHECKED_CHECKBOX_PATTERN =
  /<input[^>]+type=["']?checkbox["']?[^>]+checked(?:="checked")?[^>]*>/gi

// Text near checkboxes that suggests consent (marketing, data sharing, etc.)
const CONSENT_CHECKBOX_TEXT_PATTERNS = [
  /\b(?:yes[,\s]+)?i\s+(?:agree|consent|accept|would\s+like\s+to\s+receive)\b/i,
  /\breceive\s+(?:marketing|promotional|special\s+offer|newsletter)\b/i,
  /\bkeep\s+me\s+(?:informed|updated|posted)\b/i,
  /\bsend\s+me\s+(?:offers?|deals?|updates?|newsletters?|emails?)\b/i,
  /\bopt[\s-](?:in|out)\b/i,
  /\bshare\s+(?:my\s+)?(?:data|information|details?)\s+with\b/i,
  /\bthird[\s-]party\b/i,
  /\bpartner\s+(?:offers?|communications?)\b/i,
]

// Select/radio elements with non-user-friendly defaults
const _SELECT_DEFAULT_PATTERN =
  /<select[^>]*>[\s\S]*?<option[^>]*selected[^>]*>([^<]+)<\/option>[\s\S]*?<\/select>/gi

const HIDDEN_DEFAULT_SIGNALS = [
  /\bby\s+default[,\s]+you(?:'re|\s+are)\s+(?:opted|subscribed|enrolled)\b/i,
  /\b(?:automatically|by\s+default)\s+(?:enrolled|opted|subscribed)\b/i,
  /\bopt[\s-]out\s+(?:if|to\s+not)\b/i,
  /\bunsubscribe\s+(?:from|at)\b.*\bdefault\b/i,
]

export class PreselectionAnalyzer extends BaseAnalyzer {
  name = 'PreselectionAnalyzer'
  categories = [
    DarkPatternCategory.PRESELECTED_OPTIONS,
    DarkPatternCategory.HIDDEN_DEFAULTS,
  ]

  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    const patterns: DetectedPattern[] = []
    const text =
      context.visibleText || this.extractVisibleText(context.domSnapshot)

    patterns.push(
      ...this.detectPreselectedCheckboxes(context.domSnapshot, text, context),
      ...this.detectHiddenDefaults(text, context),
    )

    return {
      patterns: this.filterByConfidence(this.deduplicatePatterns(patterns)),
    }
  }

  private detectPreselectedCheckboxes(
    html: string,
    _text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = []

    // Find all pre-checked checkboxes
    const checkedBoxes: string[] = []
    const checkedRegex = new RegExp(CHECKED_CHECKBOX_PATTERN.source, 'gi')
    let match: RegExpExecArray | null

    while ((match = checkedRegex.exec(html)) !== null) {
      checkedBoxes.push(match[0])
    }

    if (checkedBoxes.length === 0) return []

    // For each checked box, look for consent-like text nearby
    for (const boxHtml of checkedBoxes.slice(0, 3)) {
      const boxIndex = html.indexOf(boxHtml)
      const surroundingHtml = html.slice(
        Math.max(0, boxIndex - 200),
        Math.min(html.length, boxIndex + boxHtml.length + 300),
      )
      const surroundingText = this.extractVisibleText(surroundingHtml)

      const isConsentCheckbox = CONSENT_CHECKBOX_TEXT_PATTERNS.some((p) =>
        p.test(surroundingText),
      )

      if (isConsentCheckbox) {
        patterns.push(
          this.buildPattern({
            category: DarkPatternCategory.PRESELECTED_OPTIONS,
            severity: 'critical',
            confidence: 0.9,
            description: `Pre-selected consent checkbox detected. A checkbox for marketing, data sharing, or third-party consent is checked by default, requiring users to actively opt out. This is illegal under GDPR (consent must be freely given and unambiguous).`,
            url: context.url,
            pageTitle: context.pageTitle,
            element: {
              text: surroundingText.slice(0, 200),
              html: boxHtml,
              selector: 'input[type="checkbox"][checked]',
            },
            evidence: { domSnapshot: surroundingHtml.slice(0, 500) },
            regulatoryViolations:
              REGULATORY_MAP[DarkPatternCategory.PRESELECTED_OPTIONS],
          }),
        )
      } else if (checkedBoxes.length > 0) {
        // Even non-consent pre-checked boxes (e.g., insurance add-ons) are problematic
        patterns.push(
          this.buildPattern({
            category: DarkPatternCategory.PRESELECTED_OPTIONS,
            severity: 'high',
            confidence: 0.75,
            description: `Pre-selected checkbox detected. An option is checked by default near: "${surroundingText.slice(0, 100)}". Users who don't notice will inadvertently agree to this selection.`,
            url: context.url,
            pageTitle: context.pageTitle,
            element: {
              text: surroundingText.slice(0, 200),
              html: boxHtml,
              selector: 'input[type="checkbox"][checked]',
            },
            evidence: { domSnapshot: surroundingHtml.slice(0, 500) },
            regulatoryViolations:
              REGULATORY_MAP[DarkPatternCategory.PRESELECTED_OPTIONS],
          }),
        )
      }
    }

    return patterns.slice(0, 3)
  }

  private detectHiddenDefaults(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, HIDDEN_DEFAULT_SIGNALS)
    if (matches.length === 0) return []

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.HIDDEN_DEFAULTS,
        severity: 'high',
        confidence: 0.8,
        description: `Hidden default detected: "${m.match}". Users are enrolled or opted-in by default, requiring active effort to opt out. Valid consent requires explicit affirmative action, not inaction.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.HIDDEN_DEFAULTS],
      }),
    )
  }
}
