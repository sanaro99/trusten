/**
 * Analyzer 9 — Privacy
 *
 * Detects privacy-related dark patterns:
 * PRIVACY_ZUCKERING: Tricking users into sharing more data than intended
 * COOKIE_WALL:       Accept all cookies or leave
 * DARK_CONSENT:      Making reject harder than accept in consent flows
 */

import { REGULATORY_MAP } from '../regulatory/mapping'
import type { AnalyzerContext, AnalyzerResult, DetectedPattern } from '../types'
import { DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

// ─── Cookie consent patterns ───

const COOKIE_CONSENT_SIGNALS = [
  /\baccept\s+all\s+cookies?\b/i,
  /\baccept\s+all\b/i,
  /\bcookie\s+(?:policy|notice|consent|banner|preferences?)\b/i,
  /\bwe\s+use\s+cookies?\b/i,
  /\bcookies?\s+(?:to|on\s+this|used\s+on)\b/i,
  /\byour\s+cookie\s+(?:choices?|preferences?)\b/i,
  /\bmanage\s+(?:cookie\s+)?preferences?\b/i,
]

const REJECT_ALL_PATTERNS = [
  /\breject\s+all\b/i,
  /\bdecline\s+all\b/i,
  /\brefuse\s+all\b/i,
  /\bopt\s+out\s+of\s+all\b/i,
  /\bdo\s+not\s+(?:accept|allow|consent)\b/i,
]

// ─── Privacy Zuckering patterns ───

const PRIVACY_ZUCKERING_PATTERNS = [
  /\byour\s+(?:data|information)\s+(?:may\s+be\s+)?shared\s+with\b/i,
  /\bwe\s+(?:may\s+)?share\s+your\s+(?:data|information|details?)\s+with\s+(?:our\s+)?(?:partners?|third\s+parties)\b/i,
  /\bpublic\s+(?:by\s+default|profile)\b/i,
  /\bvisible\s+to\s+(?:everyone|the\s+public)\s+by\s+default\b/i,
  /\bdata\s+may\s+be\s+used\s+for\s+advertising\b/i,
  /\bpersonaliz(?:ed|ation)\s+(?:across|on)\s+(?:the\s+web|partner\s+sites?)\b/i,
  /\btargeted\s+advertising\b/i,
  /\bcross[\s-]site\s+tracking\b/i,
]

// DOM patterns for cookie banner analysis
const COOKIE_BANNER_PATTERN =
  /<(?:div|section|aside)[^>]+(?:class|id)="[^"]*(?:cookie|consent|gdpr|privacy|cmp|onetrust|cookielaw)[^"]*"[^>]*>/gi

export class PrivacyAnalyzer extends BaseAnalyzer {
  name = 'PrivacyAnalyzer'
  categories = [
    DarkPatternCategory.PRIVACY_ZUCKERING,
    DarkPatternCategory.COOKIE_WALL,
    DarkPatternCategory.DARK_CONSENT,
  ]

  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    const patterns: DetectedPattern[] = []
    const text =
      context.visibleText || this.extractVisibleText(context.domSnapshot)

    patterns.push(
      ...this.detectCookieWall(text, context.domSnapshot, context),
      ...this.detectDarkConsent(text, context.domSnapshot, context),
      ...this.detectPrivacyZuckering(text, context),
    )

    return {
      patterns: this.filterByConfidence(this.deduplicatePatterns(patterns)),
    }
  }

  private detectCookieWall(
    text: string,
    _html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const hasCookieConsent = COOKIE_CONSENT_SIGNALS.some((p) => p.test(text))
    if (!hasCookieConsent) return []

    // Cookie wall: accept cookies OR leave (no middle ground)
    const isCookieWall =
      /\b(?:to\s+)?(?:use|access|view|browse)\s+(?:this\s+site|our\s+website|this\s+page)\s+(?:you\s+must|please|requires?)\s+(?:accept|agree|consent)\b/i.test(
        text,
      ) ||
      /\byou\s+must\s+accept\s+(?:all\s+)?cookies?\s+to\b/i.test(text) ||
      /\baccess\s+to\s+this\s+(?:site|content)\s+requires?\s+(?:accepting?\s+)?cookies?\b/i.test(
        text,
      )

    if (isCookieWall) {
      return [
        this.buildPattern({
          category: DarkPatternCategory.COOKIE_WALL,
          severity: 'critical',
          confidence: 0.9,
          description:
            'Cookie wall detected. The site requires users to accept all cookies to access content, with no option to use the site with only essential cookies. This is illegal under GDPR (recital 42 & 43) which requires that consent be freely given — it cannot be conditioned on service access.',
          url: context.url,
          pageTitle: context.pageTitle,
          evidence: { domSnapshot: text.slice(0, 300) },
          regulatoryViolations: REGULATORY_MAP[DarkPatternCategory.COOKIE_WALL],
        }),
      ]
    }

    return []
  }

  private detectDarkConsent(
    text: string,
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = []
    const hasCookieConsent = COOKIE_CONSENT_SIGNALS.some((p) => p.test(text))

    if (!hasCookieConsent) return []

    const hasAcceptAll = /\baccept\s+all\b/i.test(text)
    const hasRejectAll = REJECT_ALL_PATTERNS.some((p) => p.test(text))

    // Dark consent: accept all present, reject all absent or buried
    if (hasAcceptAll && !hasRejectAll) {
      patterns.push(
        this.buildPattern({
          category: DarkPatternCategory.DARK_CONSENT,
          severity: 'critical',
          confidence: 0.88,
          description:
            '"Accept All" button present but no equivalent "Reject All" option found. Rejecting cookies requires more steps than accepting, violating GDPR requirement for consent to be as easy to withdraw as to give (Art. 7(3)).',
          url: context.url,
          pageTitle: context.pageTitle,
          evidence: { domSnapshot: text.slice(0, 400) },
          regulatoryViolations:
            REGULATORY_MAP[DarkPatternCategory.DARK_CONSENT],
        }),
      )
    }

    // Check for asymmetric button prominence in DOM
    const cookieBanners = this.findElements(html, COOKIE_BANNER_PATTERN)
    if (cookieBanners.length > 0) {
      const bannerHtml = cookieBanners[0].html
      const bannerText = cookieBanners[0].text

      // Accept prominently styled (btn-primary, highlight, filled) vs reject secondary
      const hasProminentAccept =
        /accept[^<]*(?:class|style)="[^"]*(?:primary|cta|main|highlight|filled|blue|green)[^"]*"/i.test(
          bannerHtml,
        ) ||
        /(?:class|style)="[^"]*(?:primary|cta|main|highlight|filled)[^"]*"[^>]*>accept/i.test(
          bannerHtml,
        )

      const hasWeakReject =
        /reject[^<]*(?:class|style)="[^"]*(?:secondary|text|link|gray|muted|outline)[^"]*"/i.test(
          bannerHtml,
        )

      if (hasProminentAccept && hasWeakReject) {
        patterns.push(
          this.buildPattern({
            category: DarkPatternCategory.DARK_CONSENT,
            severity: 'high',
            confidence: 0.82,
            description:
              'Asymmetric cookie consent design detected: "Accept" button appears prominently styled (primary/filled button) while "Reject" is styled as a secondary/text link. EU regulators have found this to be an unfair consent mechanism.',
            url: context.url,
            pageTitle: context.pageTitle,
            element: {
              text: bannerText.slice(0, 200),
              html: bannerHtml.slice(0, 400),
              selector: '[class*=cookie],[class*=consent],[class*=cmp]',
            },
            evidence: { domSnapshot: bannerHtml.slice(0, 600) },
            regulatoryViolations:
              REGULATORY_MAP[DarkPatternCategory.DARK_CONSENT],
          }),
        )
      }
    }

    return patterns
  }

  private detectPrivacyZuckering(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, PRIVACY_ZUCKERING_PATTERNS)
    if (matches.length === 0) return []

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.PRIVACY_ZUCKERING,
        severity: 'high',
        confidence: 0.78,
        description: `Privacy zuckering detected: "${m.match}". The service discloses sharing user data with third parties or for tracking, often buried in terms or consent flows to ensure most users miss it.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.PRIVACY_ZUCKERING],
      }),
    )
  }
}
