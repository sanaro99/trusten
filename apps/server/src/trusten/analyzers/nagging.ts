/**
 * Analyzer 7 — Nagging
 *
 * Detects persistent, intrusive prompts and disguised advertising:
 * REPEATED_PROMPTS: Pop-up patterns, permission spam, notification requests
 * DISGUISED_ADS:    Ads that look like content, navigation, or system messages
 */

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

// Match advertising tokens, not substrings such as "ad" inside "header".
const AD_CONTAINER_TOKEN =
  /(?:^|[\s_-])(?:ads?|advert|advertisement|advertising|adsense|sponsored|dfp|adslot|adunit)(?=$|[\s_-])/i

function advertisingContainers(
  html: string,
): Array<{ html: string; selector: string }> {
  const source = html.replace(
    /<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    '',
  )
  const containers: Array<{ html: string; selector: string }> = []
  let coveredUntil = 0
  for (const opening of source.matchAll(
    /<(div|article|section|aside)\b[^>]*>/gi,
  )) {
    if (opening.index < coveredUntil) continue
    const attribute = [
      ...opening[0].matchAll(/\s(class|id)\s*=\s*(["'])(.*?)\2/gi),
    ].find((match) => AD_CONTAINER_TOKEN.test(match[3]))
    if (!attribute) continue
    const tags = new RegExp(`<(/?)${opening[1]}\\b[^>]*>`, 'gi')
    tags.lastIndex = opening.index + opening[0].length
    let depth = 1
    let closing: RegExpExecArray | null
    while ((closing = tags.exec(source))) {
      depth += closing[1] ? -1 : 1
      if (depth !== 0) continue
      // A disclosure belongs to the complete ad unit, including its children.
      coveredUntil = tags.lastIndex
      containers.push({
        html: source.slice(opening.index, tags.lastIndex),
        selector: `[${attribute[1]}=${JSON.stringify(attribute[3])}]`,
      })
      break
    }
  }
  return containers
}

// Only real class/id tokens or dialog roles identify a prompt container.
// A banner, toast, or data-section-id is not evidence of an interruption.
const PROMPT_CONTAINER_TOKEN =
  /(?:^|[\s_-])(?:popup|modal|overlay|interstitial|lightbox)(?=$|[\s_-])/i
const EXIT_INTERRUPTION =
  /\bare\s+you\s+sure\s+you\s+want\s+to\s+leave\b|\bwait[,!]\s+(?:before\s+you\s+go|don'?t\s+leave)\b|\bbefore\s+you\s+(?:leave|go|close)\b/i
const RECORDED_REFUSAL =
  /\b(?:notifications?|newsletter|subscription|prompts?)\s+(?:(?:was|were)\s+)?(?:declined|dismissed|blocked|refused)\b|\b(?:declined|dismissed|blocked|refused)\s+(?:the\s+)?(?:notifications?|newsletter|subscription|prompts?)\b/i

function promptContainers(
  html: string,
): Array<{ html: string; selector: string }> {
  const source = html.replace(
    /<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    '',
  )
  const containers: Array<{ html: string; selector: string }> = []
  let coveredUntil = 0
  for (const opening of source.matchAll(
    /<(div|section|aside|dialog)\b[^>]*>/gi,
  )) {
    if (opening.index < coveredUntil) continue
    if (
      /\shidden(?:\s|=|>)|\saria-hidden\s*=\s*["']true["']|\sstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(
        opening[0],
      )
    )
      continue
    const attribute = [
      ...opening[0].matchAll(/\s(class|id|role)\s*=\s*(["'])(.*?)\2/gi),
    ].find((match) =>
      match[1].toLowerCase() === 'role'
        ? /^(?:alertdialog|dialog)$/i.test(match[3])
        : PROMPT_CONTAINER_TOKEN.test(match[3]),
    )
    if (!attribute && opening[1].toLowerCase() !== 'dialog') continue
    const tags = new RegExp(`<(/?)${opening[1]}\\b[^>]*>`, 'gi')
    tags.lastIndex = opening.index + opening[0].length
    let depth = 1
    let closing: RegExpExecArray | null
    while ((closing = tags.exec(source))) {
      depth += closing[1] ? -1 : 1
      if (depth !== 0) continue
      coveredUntil = tags.lastIndex
      containers.push({
        html: source.slice(opening.index, tags.lastIndex),
        selector: attribute
          ? `[${attribute[1]}=${JSON.stringify(attribute[3])}]`
          : 'dialog',
      })
      break
    }
  }
  return containers
}

export class NaggingAnalyzer extends BaseAnalyzer {
  name = 'NaggingAnalyzer'
  categories = [
    DarkPatternCategory.REPEATED_PROMPTS,
    DarkPatternCategory.DISGUISED_ADS,
  ]

  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    const patterns: DetectedPattern[] = []
    patterns.push(
      ...this.detectNagging(context.domSnapshot, context),
      ...this.detectDisguisedAds(context.domSnapshot, context),
      ...this.detectTinyFontSponsored(context.domSnapshot, context),
    )

    return {
      patterns: this.filterByConfidence(this.deduplicatePatterns(patterns)),
    }
  }

  private detectNagging(
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = []

    const previous = context.previousStepContext
    const previousText = previous
      ? previous.visibleText || this.extractVisibleText(previous.domSnapshot)
      : ''
    for (const container of promptContainers(html)) {
      const popupText = this.extractVisibleText(container.html)
      if (!popupText) continue
      const promptMatches = this.findKeywordMatches(
        popupText,
        NAGGING_TEXT_PATTERNS,
      )
      if (promptMatches.length === 0) continue
      const interruptsExit = EXIT_INTERRUPTION.test(popupText)
      const previousRefusal = previousText.match(RECORDED_REFUSAL)?.[0]
      const refusedRequest = previousRefusal
        ?.match(/\b(?:notifications?|newsletter|subscription|prompts?)\b/i)?.[0]
        .replace(/s$/i, '')
      // Refusal must concern the same request; a newsletter refusal does not
      // establish that an unrelated notification request is repeated.
      const afterRefusal =
        !!refusedRequest &&
        new RegExp(`\\b${this.escapeRegex(refusedRequest)}s?\\b`, 'i').test(
          popupText,
        )
      if (!interruptsExit && !afterRefusal) continue
      patterns.push(
        this.buildPattern({
          category: DarkPatternCategory.REPEATED_PROMPTS,
          severity: 'medium',
          confidence: afterRefusal ? 0.85 : 0.75,
          description: afterRefusal
            ? `Possible repeated prompt: "${popupText.slice(0, 150)}". A prompt requests an action declined in the previous captured step.`
            : `Possible intrusive exit prompt: "${popupText.slice(0, 150)}". A captured overlay asks the user to reconsider leaving. This snapshot alone does not establish repetition or whether dismissal is difficult.`,
          url: context.url,
          pageTitle: context.pageTitle,
          element: {
            text: popupText.slice(0, 150),
            html: container.html.slice(0, 500),
            selector: container.selector,
          },
          evidence: {
            domSnapshot: afterRefusal
              ? `${previousRefusal}\n${container.html.slice(0, 500)}`
              : container.html.slice(0, 500),
          },
        }),
      )
      if (patterns.length >= 2) break
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
          }),
        ]
      }
    }

    return []
  }

  private detectDisguisedAds(
    html: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = []

    // Look for ad containers with labels
    const adContainers = advertisingContainers(html)

    if (adContainers.length > 0) {
      for (const container of adContainers) {
        const containerText = this.extractVisibleText(container.html)
        if (!containerText && !/<(?:img|iframe|video)\b/i.test(container.html))
          continue
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
              description: `Possible unlabeled advertising: a populated advertising container has no clear "Ad", "Sponsored", or "Advertisement" disclosure in its content.`,
              url: context.url,
              pageTitle: context.pageTitle,
              element: {
                text: containerText.slice(0, 150),
                html: container.html.slice(0, 300),
                selector: container.selector,
              },
              evidence: { domSnapshot: container.html.slice(0, 500) },
            }),
          )
          if (patterns.length >= 2) break
        }
      }
    }

    return patterns
  }
}
