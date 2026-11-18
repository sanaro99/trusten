/**
 * Analyzer 6 — Preselection
 *
 * Detects patterns that use default selections against user interest:
 * PRESELECTED_OPTIONS: Pre-checked boxes for newsletters, offers, insurance
 * HIDDEN_DEFAULTS:     Defaults set against user interest (opt-in by default)
 */

import type { AnalyzerContext, AnalyzerResult, DetectedPattern } from '../types'
import { DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

// Checkbox elements that are checked by default
const CHECKED_CHECKBOX_PATTERN = /<input\b[^>]*>/gi

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

// A pre-ticked agreement to terms is worth knowing, but it is not marketing
// or data-sharing consent.
const TERMS_ONLY_PATTERN =
  /\b(?:terms|conditions|privacy\s+(?:policy|notice|statement)|eula|user\s+agreement)\b/i

// Pre-ticked boxes that add something the user may not want: a paid extra,
// a donation, a membership, or messages. Other pre-ticked boxes ("Remember
// me", "Billing address same as shipping", search filters) are conveniences.
const ADD_ON_PATTERN =
  /[$€£¥₹]\s?\d|\d\s?(?:usd|eur|gbp)\b|\b(?:add(?:ed)?|include|insurance|protection|protect|warranty|guarantee|donat\w*|tip|round\s+up|gift\s+wrap|membership|member|subscri\w*|newsletter|offers?|promotions?|marketing|deals?|upgrade|premium|priority|express|auto[\s-]?renew\w*|renew\w*|trial|plan|coverage|carbon|offset|charity|sms|text\s+messages?|notifications?|emails?)\b/i

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
    const checkedBoxes: Array<{ html: string; index: number }> = []
    const checkedRegex = new RegExp(CHECKED_CHECKBOX_PATTERN.source, 'gi')
    let match: RegExpExecArray | null

    while ((match = checkedRegex.exec(html)) !== null) {
      if (
        /\btype\s*=\s*["']?checkbox\b/i.test(match[0]) &&
        /\schecked(?:\s|=|\/?>)/i.test(match[0]) &&
        // A locked box ("Strictly necessary, always active") is not a choice.
        !/\sdisabled(?:\s|=|\/?>)/i.test(match[0])
      )
        checkedBoxes.push({ html: match[0], index: match.index })
    }

    if (checkedBoxes.length === 0) return []

    // For each checked box, look for consent-like text nearby
    // Identical boxes share the same markup, so keep each match's position.
    for (const { html: boxHtml, index: boxIndex } of checkedBoxes) {
      if (patterns.length >= 3) break
      const surroundingHtml = html.slice(
        Math.max(0, boxIndex - 200),
        Math.min(html.length, boxIndex + boxHtml.length + 300),
      )
      const surroundingText = this.extractVisibleText(surroundingHtml)
      // The label normally follows the box and ends with its element; text
      // before it, or after the label closes, is unrelated.
      const after = html.slice(
        boxIndex + boxHtml.length,
        boxIndex + boxHtml.length + 300,
      )
      const labelEnd = after.search(
        /<\/(?:label|p|div|li|td|dd|button)>|<(?:br|input|select|p|div|li|section|footer|button)\b/i,
      )
      let labelText = this.clip(
        this.extractVisibleText(
          labelEnd === -1 ? after : after.slice(0, labelEnd),
        ).split(/(?<=[.!?])\s/)[0],
        120,
      )
      // <label>Send me offers <input checked></label>: the words come first.
      if (!labelText) {
        const before = html.slice(Math.max(0, boxIndex - 300), boxIndex)
        const labelStart = before.lastIndexOf('<label')
        if (labelStart !== -1)
          labelText = this.clip(
            this.extractVisibleText(before.slice(labelStart)),
            120,
          )
      }

      // Classify by the box's own label when there is one; nearby text can
      // belong to a different control.
      const choiceText = labelText || surroundingText
      const isConsentCheckbox = CONSENT_CHECKBOX_TEXT_PATTERNS.some((p) =>
        p.test(choiceText),
      )
      const isTermsOnly =
        isConsentCheckbox &&
        TERMS_ONLY_PATTERN.test(choiceText) &&
        !CONSENT_CHECKBOX_TEXT_PATTERNS.slice(1).some((p) => p.test(choiceText))

      if (isTermsOnly) {
        patterns.push(
          this.buildPattern({
            category: DarkPatternCategory.PRESELECTED_OPTIONS,
            severity: 'medium',
            confidence: 0.75,
            description:
              'An agreement checkbox is ticked before you read it. Open the linked terms before continuing; agreeing should be your own choice.',
            url: context.url,
            pageTitle: context.pageTitle,
            element: {
              text: labelText || this.clip(surroundingText, 200),
              html: boxHtml,
              selector: boxHtml.match(/\bid=["']([^"']+)["']/i)?.[1]
                ? '[id=' +
                  JSON.stringify(boxHtml.match(/\bid=["']([^"']+)["']/i)![1]) +
                  ']'
                : 'input[type="checkbox"][checked]',
            },
            evidence: { domSnapshot: surroundingHtml.slice(0, 500) },
          }),
        )
      } else if (isConsentCheckbox) {
        patterns.push(
          this.buildPattern({
            category: DarkPatternCategory.PRESELECTED_OPTIONS,
            severity: 'critical',
            confidence: 0.9,
            description: `Pre-selected consent checkbox detected. A checkbox for marketing, data sharing, or third-party consent is checked by default, requiring users to actively opt out. Review this default before proceeding; valid consent requires an affirmative choice.`,
            url: context.url,
            pageTitle: context.pageTitle,
            element: {
              text: labelText || this.clip(surroundingText, 200),
              html: boxHtml,
              selector: boxHtml.match(/\bid=["']([^"']+)["']/i)?.[1]
                ? '[id=' +
                  JSON.stringify(boxHtml.match(/\bid=["']([^"']+)["']/i)![1]) +
                  ']'
                : 'input[type="checkbox"][checked]',
            },
            evidence: { domSnapshot: surroundingHtml.slice(0, 500) },
          }),
        )
      } else if (ADD_ON_PATTERN.test(labelText || surroundingText)) {
        // Pre-checked extras (insurance, donations, memberships) are problematic
        patterns.push(
          this.buildPattern({
            category: DarkPatternCategory.PRESELECTED_OPTIONS,
            severity: 'high',
            confidence: 0.75,
            description: `Pre-selected checkbox detected. An option is checked by default near: "${labelText || this.clip(surroundingText, 100)}". Users who don't notice will inadvertently agree to this selection.`,
            url: context.url,
            pageTitle: context.pageTitle,
            element: {
              text: labelText || this.clip(surroundingText, 200),
              html: boxHtml,
              selector: boxHtml.match(/\bid=["']([^"']+)["']/i)?.[1]
                ? '[id=' +
                  JSON.stringify(boxHtml.match(/\bid=["']([^"']+)["']/i)![1]) +
                  ']'
                : 'input[type="checkbox"][checked]',
            },
            evidence: { domSnapshot: surroundingHtml.slice(0, 500) },
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
      }),
    )
  }
}
