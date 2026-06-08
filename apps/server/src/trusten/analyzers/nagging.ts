/**
 * Analyzer 7 — Nagging
 *
 * Detects persistent, intrusive prompts and disguised advertising:
 * REPEATED_PROMPTS: Pop-up patterns, permission spam, notification requests
 * DISGUISED_ADS:    Ads that look like content, navigation, or system messages
 */

import { REGULATORY_MAP } from '../regulatory/mapping'
import type { AnalyzerContext, AnalyzerResult, DetectedPattern } from '../types'
import { DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

// ─── Nagging / repeated prompt patterns ───

const NAGGING_TEXT_PATTERNS = [
  /\b(?:allow|enable)\s+notifications?\b/i,
  /\bdon'?t\s+miss\s+(?:out\s+on\s+)?(?:updates?|deals?|offers?|alerts?)\b/i,
  /\bturn\s+on\s+notifications?\b/i,
  /\bstay\s+(?:updated|informed|in\s+the\s+loop)\b/i,
  /\bget\s+(?:push|browser)\s+notifications?\b/i,
  /\bwe\s+noticed\s+you\s+(?:have(?:n'?t)?|are|were)\b/i,
  /\bare\s+you\s+(?:still\s+there|sure\s+you\s+want\s+to\s+leave)\b/i,
  /\bwait[,!]\s+(?:before\s+you\s+go|don'?t\s+leave)\b/i,
  /\bexit\s+intent\b/i,
  /\bbefore\s+you\s+(?:leave|go|close)\b/i,
]

// ─── Disguised ad signals ───
// Ads that look like content often use labels like "sponsored", "promoted"
// but style them to blend in. We look for these labels near ad content.

const DISGUISED_AD_LABELS = [
  /\bsponsored\b/i,
  /\bpromoted\b/i,
  /\badvertisement\b/i,
  /\bads?\b/i,
  /\bpaid\s+(?:content|placement|post)\b/i,
  /\bbrand(?:ed)?\s+content\b/i,
  /\bnative\s+ad(?:vertisement)?\b/i,
]

// Common class patterns used for ad containers that don't make ads obvious
const AD_CONTAINER_PATTERN =
  /<(?:div|article|section|aside)[^>]+(?:class|id)="[^"]*(?:ad|ads|advert|banner|dfp|gpt|adsense|sponsored)[^"]*"[^>]*>/gi

// Pop-up/overlay DOM patterns
const POPUP_PATTERN =
  /<div[^>]+(?:class|id)="[^"]*(?:popup|modal|overlay|interstitial|lightbox|banner|toast|notification)[^"]*"[^>]*>/gi

export class NaggingAnalyzer extends BaseAnalyzer {
  name = 'NaggingAnalyzer'
  categories = [
    DarkPatternCategory.REPEATED_PROMPTS,
    DarkPatternCategory.DISGUISED_ADS,
  ]

  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    const patterns: DetectedPattern[] = []
    const text =
      context.visibleText || this.extractVisibleText(context.domSnapshot)

    patterns.push(
      ...this.detectNagging(text, context.domSnapshot, context),
      ...this.detectDisguisedAds(text, context.domSnapshot, context),
      ...this.detectTinyFontSponsored(context.domSnapshot, context),
    )

    return {
      patterns: this.filterByConfidence(this.deduplicatePatterns(patterns)),
    }
  }

  private detectNagging(
    text: string,
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = []

    // Text-based nagging
    const textMatches = this.findKeywordMatches(text, NAGGING_TEXT_PATTERNS)
    for (const m of textMatches.slice(0, 2)) {
      patterns.push(
        this.buildPattern({
          category: DarkPatternCategory.REPEATED_PROMPTS,
          severity: 'medium',
          confidence: 0.75,
          description: `Nagging prompt detected: "${m.match}". Intrusive prompts to enable notifications, prevent page exit, or re-engage users are disruptive dark patterns that undermine user autonomy.`,
          url: context.url,
          pageTitle: context.pageTitle,
          element: { text: m.context, html: '', selector: '' },
          evidence: { domSnapshot: m.context },
          regulatoryViolations:
            REGULATORY_MAP[DarkPatternCategory.REPEATED_PROMPTS],
        }),
      )
    }

    // DOM-based pop-up detection
    const popupElements = this.findElements(html, POPUP_PATTERN)
    if (popupElements.length > 0) {
      const popupText = popupElements[0].text.slice(0, 150)
      patterns.push(
        this.buildPattern({
          category: DarkPatternCategory.REPEATED_PROMPTS,
          severity: 'medium',
          confidence: 0.7,
          description: `Pop-up/overlay element detected: "${popupText}". Modal overlays that interrupt the user experience without a clear and easy dismiss mechanism constitute nagging.`,
          url: context.url,
          pageTitle: context.pageTitle,
          element: {
            text: popupText,
            html: popupElements[0].html.slice(0, 300),
            selector: '[class*=popup],[class*=modal],[class*=overlay]',
          },
          evidence: { domSnapshot: popupElements[0].html.slice(0, 500) },
          regulatoryViolations:
            REGULATORY_MAP[DarkPatternCategory.REPEATED_PROMPTS],
        }),
      )
    }

    return patterns
  }

  /**
   * Detects "Sponsored" / "Ad" labels intentionally rendered in tiny font sizes
   * to make them effectively invisible to casual readers.
   * These are common on search result pages, social feeds, and news aggregators.
   */
  private detectTinyFontSponsored(
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    // Match inline styles with very small font sizes (≤ 11px) containing ad labels
    const tinyStylePattern =
      /<[^>]+style="[^"]*font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)[^"]*"[^>]*>([^<]{1,80})<\/[^>]+>/gi
    const AD_WORDS =
      /\b(?:sponsored|advertisement|advertise?ment|paid|promoted|partner(?:ed)?|ad)\b/i

    const matches = [...html.matchAll(tinyStylePattern)]
    for (const m of matches) {
      const size = parseFloat(m[1] ?? '99')
      const unit = m[2] ?? 'px'
      const textContent = m[3] ?? ''

      // Convert rem/em to approximate px (assume 16px base)
      const sizePx = unit === 'px' ? size : size * 16

      if (sizePx <= 11 && AD_WORDS.test(textContent)) {
        return [
          this.buildPattern({
            category: DarkPatternCategory.DISGUISED_ADS,
            severity: 'high',
            confidence: 0.87,
            description: `Tiny-font ad disclosure detected: "${textContent.trim()}" is rendered at only ${sizePx}px — too small for most users to read. Deliberately de-emphasizing ad labels to make sponsored content appear organic violates FTC disclosure guidelines and EU DSA requirements.`,
            url: context.url,
            pageTitle: context.pageTitle,
            element: {
              text: textContent.trim(),
              html: m[0].slice(0, 200),
              selector: '[class*=sponsor],[class*=promoted],[class*=ad-label]',
            },
            evidence: { domSnapshot: m[0].slice(0, 300) },
            regulatoryViolations:
              REGULATORY_MAP[DarkPatternCategory.DISGUISED_ADS],
          }),
        ]
      }
    }

    // Also check for CSS class-based tiny font patterns (no inline style, but class name suggests small label)
    const smallLabelPattern =
      /<[^>]+class="[^"]*(?:sponsored-tag|ad-label|ad-badge|promo-tag|native-tag)[^"]*"[^>]*>([^<]{1,60})<\/[^>]+>/gi
    const classMatches = [...html.matchAll(smallLabelPattern)]
    for (const m of classMatches) {
      const text = m[1] ?? ''
      if (AD_WORDS.test(text) || text.trim().length < 20) {
        return [
          this.buildPattern({
            category: DarkPatternCategory.DISGUISED_ADS,
            severity: 'medium',
            confidence: 0.75,
            description: `Ad disclosure label styled to blend in: "${text.trim()}". The disclosure uses a class name designed to minimize visual prominence, making it easy for users to miss that the content is paid/sponsored.`,
            url: context.url,
            pageTitle: context.pageTitle,
            element: {
              text: text.trim(),
              html: m[0].slice(0, 200),
              selector:
                '[class*=sponsored-tag],[class*=ad-label],[class*=ad-badge],[class*=promo-tag]',
            },
            evidence: { domSnapshot: m[0].slice(0, 300) },
            regulatoryViolations:
              REGULATORY_MAP[DarkPatternCategory.DISGUISED_ADS],
          }),
        ]
      }
    }

    return []
  }

  private detectDisguisedAds(
    text: string,
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = []

    // Look for ad containers with labels
    const adContainers = this.findElements(html, AD_CONTAINER_PATTERN)

    if (adContainers.length > 0) {
      for (const container of adContainers.slice(0, 2)) {
        const containerText = container.text
        const hasAdLabel = DISGUISED_AD_LABELS.some((p) =>
          p.test(containerText),
        )

        if (!hasAdLabel) {
          // Ad container without a label = disguised ad
          patterns.push(
            this.buildPattern({
              category: DarkPatternCategory.DISGUISED_ADS,
              severity: 'high',
              confidence: 0.72,
              description: `Disguised ad detected: an advertising container was found without a clear "Ad", "Sponsored", or "Advertisement" label visible to users. This violates FTC native advertising guidelines.`,
              url: context.url,
              pageTitle: context.pageTitle,
              element: {
                text: containerText.slice(0, 150),
                html: container.html.slice(0, 300),
                selector: '[class*=ad],[class*=ads],[class*=sponsored]',
              },
              evidence: { domSnapshot: container.html.slice(0, 500) },
              regulatoryViolations:
                REGULATORY_MAP[DarkPatternCategory.DISGUISED_ADS],
            }),
          )
        }
      }
    }

    // Check for ad labels in text that suggest ads are present
    const adLabelMatches = this.findKeywordMatches(text, DISGUISED_AD_LABELS)
    if (adLabelMatches.length > 0) {
      // Ads are labeled — lower severity but flag for review
      patterns.push(
        this.buildPattern({
          category: DarkPatternCategory.DISGUISED_ADS,
          severity: 'low',
          confidence: 0.6,
          description: `Advertising content detected (labeled). Verify that ad labels are visually distinct from editorial content and not styled to blend in.`,
          url: context.url,
          pageTitle: context.pageTitle,
          element: { text: adLabelMatches[0].context, html: '', selector: '' },
          evidence: { domSnapshot: adLabelMatches[0].context },
          regulatoryViolations:
            REGULATORY_MAP[DarkPatternCategory.DISGUISED_ADS],
        }),
      )
    }

    return patterns
  }
}
