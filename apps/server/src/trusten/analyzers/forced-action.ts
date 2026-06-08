/**
 * Analyzer 5 — Forced Action
 *
 * Detects patterns that compel users to take unwanted actions:
 * FORCED_REGISTRATION:   Must create account for basic actions
 * FORCED_SHARING:        Must share to access content
 * GAMIFICATION_PRESSURE: Streaks, FOMO mechanics, daily rewards
 */

import { REGULATORY_MAP } from '../regulatory/mapping'
import type { AnalyzerContext, AnalyzerResult, DetectedPattern } from '../types'
import { DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

const FORCED_REG_PATTERNS = [
  /\b(?:sign\s+(?:up|in)|create\s+(?:an?\s+)?account|log\s+(?:in|into))\s+to\s+(?:view|access|see|continue|read|download|get|purchase)\b/i,
  /\bregist(?:er|ration)\s+required\b/i,
  /\bmust\s+(?:be\s+)?(?:logged?\s+in|signed?\s+(?:in|up))\b/i,
  /\bguest\s+checkout\s+(?:not\s+)?available\b/i,
  /\byou\s+need\s+(?:an?\s+)?account\s+to\b/i,
  /\bplease\s+(?:log|sign)\s+in\s+(?:first|before|to)\b/i,
]

const FORCED_SHARING_PATTERNS = [
  /\bshare\s+(?:to|for|and)\s+(?:unlock|access|download|get|continue)\b/i,
  /\bshare\s+with\s+\d+\s+friends?\s+to\b/i,
  /\binvite\s+friends?\s+to\s+(?:unlock|get|access)\b/i,
  /\b(?:tweet|post|share)\s+to\s+(?:reveal|show|unlock|access)\b/i,
  /\bfollow\s+us\s+(?:on|to)\s+(?:get|access|unlock)\b/i,
  /\blike\s+(?:our\s+page|us|this)\s+to\s+(?:get|access|unlock)\b/i,
]

const GAMIFICATION_PATTERNS = [
  /\b(?:daily\s+)?streak\b/i,
  /\bdon'?t\s+(?:break|lose)\s+(?:your\s+)?streak\b/i,
  /\bcome\s+back\s+(?:tomorrow|daily)\s+(?:to|for)\b/i,
  /\bdaily\s+(?:reward|bonus|login\s+bonus|check[\s-]in)\b/i,
  /\blose\s+(?:your\s+)?(?:progress|streak|rewards?|points?)\s+if\s+you\s+(?:cancel|stop|quit|leave)\b/i,
  /\b(?:limited|exclusive)\s+(?:daily|timed)\s+(?:reward|offer|bonus)\b/i,
  /\bfomo\b/i,
  /\byou'?ve\s+(?:earned|unlocked)\s+(?:a\s+)?(?:badge|achievement|reward)\b/i,
]

export class ForcedActionAnalyzer extends BaseAnalyzer {
  name = 'ForcedActionAnalyzer'
  categories = [
    DarkPatternCategory.FORCED_REGISTRATION,
    DarkPatternCategory.FORCED_SHARING,
    DarkPatternCategory.GAMIFICATION_PRESSURE,
  ]

  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    const patterns: DetectedPattern[] = []
    const text =
      context.visibleText || this.extractVisibleText(context.domSnapshot)

    patterns.push(
      ...this.detectForcedRegistration(text, context),
      ...this.detectForcedSharing(text, context),
      ...this.detectGamificationPressure(text, context),
    )

    return {
      patterns: this.filterByConfidence(this.deduplicatePatterns(patterns)),
    }
  }

  private detectForcedRegistration(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, FORCED_REG_PATTERNS)
    if (matches.length === 0) return []

    // Check if guest checkout is mentioned (mitigating factor)
    const hasGuestOption = /\bguest\s+checkout\b/i.test(text)

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.FORCED_REGISTRATION,
        severity: hasGuestOption ? 'low' : 'high',
        confidence: hasGuestOption ? 0.55 : 0.82,
        description: `Forced registration detected: "${m.match}". ${
          hasGuestOption
            ? 'Account creation is promoted, but guest checkout may be available.'
            : 'Users are required to create an account to complete a basic action. This creates unnecessary friction and harvests personal data without necessity.'
        }`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.FORCED_REGISTRATION],
      }),
    )
  }

  private detectForcedSharing(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, FORCED_SHARING_PATTERNS)
    if (matches.length === 0) return []

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.FORCED_SHARING,
        severity: 'high',
        confidence: 0.88,
        description: `Forced sharing detected: "${m.match}". Users are required to share, post, or follow social accounts to access content — weaponizing users as involuntary marketers.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.FORCED_SHARING],
      }),
    )
  }

  private detectGamificationPressure(
    text: string,
    context: AnalyzerContext,
  ): DetectedPattern[] {
    const matches = this.findKeywordMatches(text, GAMIFICATION_PATTERNS)
    if (matches.length === 0) return []

    return matches.slice(0, 2).map((m) =>
      this.buildPattern({
        category: DarkPatternCategory.GAMIFICATION_PRESSURE,
        severity: 'medium',
        confidence: 0.75,
        description: `Gamification pressure detected: "${m.match}". Streak mechanics, FOMO rewards, or loss-aversion framing is used to manipulate users into compulsive re-engagement beyond their original intent.`,
        url: context.url,
        pageTitle: context.pageTitle,
        element: { text: m.context, html: '', selector: '' },
        evidence: { domSnapshot: m.context },
        regulatoryViolations:
          REGULATORY_MAP[DarkPatternCategory.GAMIFICATION_PRESSURE],
      }),
    )
  }
}
