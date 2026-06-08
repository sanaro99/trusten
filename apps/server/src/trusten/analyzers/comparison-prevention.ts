/**
 * Analyzer 8 — Comparison Prevention
 *
 * Detects patterns that make it hard for users to compare options or
 * find important information:
 * COMPARISON_PREVENTION: Inconsistent plan structures, hidden tiers
 * INFORMATION_HIDING:    Key terms buried in fine print, collapsed sections
 */

import { REGULATORY_MAP } from '../regulatory/mapping'
import type { AnalyzerContext, AnalyzerResult, DetectedPattern } from '../types'
import { DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

// ─── Comparison prevention signals ───

const COMPARISON_PREVENTION_PATTERNS = [
  /\bcontact\s+(?:us|sales)\s+for\s+(?:pricing|price|quote)\b/i,
  /\bpricing\s+available\s+on\s+request\b/i,
  /\bcustom\s+pricing\b/i,
  /\benterp?rise\s+(?:plan|pricing)\b.*\bcontact\b/i,
  /\bfeatures?\s+vary\s+by\s+plan\b/i,
  /\bsee\s+(?:full\s+)?(?:terms?|details?|comparison)\b/i,
  /\bmost\s+popular\b.*\bplan\b/i, // "Most popular" badge biases choice without showing comparison
  /\bbest\s+value\b.*\bplan\b/i,
]

// ─── Information hiding signals ───

const INFORMATION_HIDING_PATTERNS = [
  /\bsee\s+(?:full\s+)?(?:terms?\s+and\s+conditions?|t&c)\b/i,
  /\bfull\s+(?:terms?|details?)\s+(?:available|apply)\b/i,
  /\b\*\s*(?:see|refer\s+to|visit)\s+(?:footnote|disclaimer|terms?)\b/i,
  /\bimportant\s+(?:information|notice|disclosure)\s*\*/i,
  /\bconditions?\s+apply\b/i,
  /\bsubject\s+to\s+(?:terms?|conditions?|change)\b/i,
  /\bsee\s+below\s+for\s+details?\b/i,
  /\bclick\s+(?:here\s+)?(?:to\s+)?(?:see|read|view)\s+(?:more|full|complete)\s+(?:details?|terms?|information)\b/i,
]

// DOM: Collapsed / accordion sections hiding critical info
const ACCORDION_PATTERN =
  /<(?:details|summary|div)[^>]+(?:class|id)="[^"]*(?:accordion|collapse|expand|toggle|faq|more)[^"]*"[^>]*>/gi

// Fine print indicators
const FINE_PRINT_PATTERN =
  /<(?:small|p|span|div)[^>]+(?:class|style)="[^"]*(?:fine-?print|disclaimer|footnote|legal|terms|small-?text|micro)[^"]*"[^>]*>([^<]{5,})<\/(?:small|p|span|div)>/gi

export class ComparisonPreventionAnalyzer extends BaseAnalyzer {
  name = 'ComparisonPreventionAnalyzer'
  categories = [
    DarkPatternCategory.COMPARISON_PREVENTION,
    DarkPatternCategory.INFORMATION_HIDING,
  ]

  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    const patterns: DetectedPattern[] = []
    const text =
      context.visibleText || this.extractVisibleText(context.domSnapshot)

    patterns.push(
      ...this.detectComparisonPrevention(text, context),
      ...this.detectInformationHiding(text, context.domSnapshot, context),
    )

    return {
      patterns: this.filterByConfidence(this.deduplicatePatterns(patterns)),
    }
  }

  private detectComparisonPrevention(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(
      text,
      COMPARISON_PREVENTION_PATTERNS,
    )
    if (matches.length === 0) return []

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.COMPARISON_PREVENTION,
        severity: 'medium',
        confidence: 0.72,
        description: `Comparison prevention detected: "${m.match}". Pricing or feature information is obscured, requiring contact with sales or hiding behind "custom pricing" — making it impossible for users to compare options without engaging with the company.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.COMPARISON_PREVENTION],
      }),
    )
  }

  private detectInformationHiding(
    text: string,
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = []

    // Text-based information hiding
    const textMatches = this.findKeywordMatches(
      text,
      INFORMATION_HIDING_PATTERNS,
    )
    for (const m of textMatches.slice(0, 2)) {
      patterns.push(
        this.buildPattern({
          category: DarkPatternCategory.INFORMATION_HIDING,
          severity: 'medium',
          confidence: 0.7,
          description: `Information hiding detected: "${m.match}". Important terms, conditions, or pricing details are referenced but hidden, requiring extra steps to find.`,
          url: context.url,
          pageTitle: context.pageTitle,
          element: { text: m.context, html: '', selector: '' },
          evidence: { domSnapshot: m.context },
          regulatoryViolations:
            REGULATORY_MAP[DarkPatternCategory.INFORMATION_HIDING],
        }),
      )
    }

    // DOM-based: collapsed sections hiding critical info
    const collapsedSections = this.findElements(html, ACCORDION_PATTERN)
    if (collapsedSections.length > 2) {
      patterns.push(
        this.buildPattern({
          category: DarkPatternCategory.INFORMATION_HIDING,
          severity: 'low',
          confidence: 0.6,
          description: `Multiple collapsed/accordion sections detected (${collapsedSections.length} found). Important information may be hidden behind "expand" interactions, reducing its visibility.`,
          url: context.url,
          pageTitle: context.pageTitle,
          element: {
            text: collapsedSections[0].text.slice(0, 100),
            html: collapsedSections[0].html.slice(0, 300),
            selector: 'details,summary,[class*=accordion],[class*=collapse]',
          },
          evidence: { domSnapshot: collapsedSections[0].html.slice(0, 500) },
          regulatoryViolations:
            REGULATORY_MAP[DarkPatternCategory.INFORMATION_HIDING],
        }),
      )
    }

    // Fine print detection
    const finePrint = this.findElements(html, FINE_PRINT_PATTERN)
    if (finePrint.length > 0) {
      for (const fp of finePrint.slice(0, 2)) {
        if (fp.text.length > 20) {
          patterns.push(
            this.buildPattern({
              category: DarkPatternCategory.INFORMATION_HIDING,
              severity: 'medium',
              confidence: 0.72,
              description: `Fine print detected: "${fp.text.slice(0, 100)}". Material information is presented in reduced-size text or designated fine-print sections, reducing its legibility and conspicuousness.`,
              url: context.url,
              pageTitle: context.pageTitle,
              element: {
                text: fp.text.slice(0, 200),
                html: fp.html.slice(0, 300),
                selector: 'small,[class*=fine-print],[class*=disclaimer]',
              },
              evidence: { domSnapshot: fp.html.slice(0, 500) },
              regulatoryViolations:
                REGULATORY_MAP[DarkPatternCategory.INFORMATION_HIDING],
            }),
          )
        }
      }
    }

    return patterns
  }
}
