/**
 * Trusten — Regulatory Mapping
 *
 * Maps each DarkPatternCategory to the specific regulatory provisions it violates.
 * Used by analyzers to attach legal context to every detected pattern.
 */

import type { RegulatoryViolation } from '../types'
import { DarkPatternCategory, Regulation } from '../types'

export const REGULATORY_MAP: Record<
  DarkPatternCategory,
  RegulatoryViolation[]
> = {
  // ─── Urgency & Scarcity ───

  [DarkPatternCategory.FAKE_URGENCY]: [
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a)',
      description:
        'False urgency claims (non-expiring countdown timers, fabricated deadlines) constitute deceptive acts or practices under FTC Act Section 5.',
    },
    {
      regulation: Regulation.EU_DSA,
      article: 'Art. 25(1)',
      description:
        'DSA prohibits online interfaces designed or operated to deceive or manipulate recipients, including manufactured time pressure.',
    },
    {
      regulation: Regulation.EU_UCPD,
      article: 'Annex I, Para 7',
      description:
        'UCPD blacklists falsely stating that a product will only be available for a very limited time to elicit an immediate decision.',
    },
    {
      regulation: Regulation.AUSTRALIA_ACL,
      article: 'Schedule 2, §18',
      description:
        'ACL prohibits misleading or deceptive conduct in trade or commerce, including false urgency representations.',
    },
  ],

  [DarkPatternCategory.FAKE_SCARCITY]: [
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a)',
      description:
        'Fabricated stock shortage claims or fake "X people viewing" counters are deceptive practices under FTC Act §5.',
    },
    {
      regulation: Regulation.EU_UCPD,
      article: 'Annex I, Para 5',
      description:
        'UCPD blacklists invitations to purchase products at a specified price without disclosing likely inability to supply.',
    },
    {
      regulation: Regulation.EU_DSA,
      article: 'Art. 25(1)',
      description:
        'DSA prohibits interfaces designed to exploit psychological weaknesses, including artificial scarcity.',
    },
  ],

  [DarkPatternCategory.FAKE_SOCIAL_PROOF]: [
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a)',
      description:
        'Fabricated or randomized counters ("1,247 bought today") constitute false endorsement and deceptive social proof.',
    },
    {
      regulation: Regulation.EU_UCPD,
      article: 'Art. 6(1)(b)',
      description:
        'UCPD prohibits misleading consumers about the nature or scope of market demand for a product.',
    },
  ],

  // ─── Misdirection ───

  [DarkPatternCategory.CONFIRMSHAMING]: [
    {
      regulation: Regulation.EU_DSA,
      article: 'Art. 25(1)',
      description:
        'DSA prohibits manipulation of user decision-making through emotional pressure, including guilt-based decline options.',
    },
    {
      regulation: Regulation.EU_UCPD,
      article: 'Art. 8',
      description:
        "UCPD prohibits aggressive commercial practices that impair consumers' freedom of choice through psychological harassment.",
    },
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a)',
      description:
        'Confirmshaming uses emotional manipulation to coerce consent — an unfair practice under FTC Act §5.',
    },
  ],

  [DarkPatternCategory.TRICK_WORDING]: [
    {
      regulation: Regulation.GDPR,
      article: 'Art. 7(2)',
      description:
        'Consent obtained via confusing double-negative language is not "freely given, specific, informed, and unambiguous" under GDPR Art. 7.',
    },
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a)',
      description:
        'Intentionally confusing opt-out language constitutes a deceptive act that distorts consumer understanding.',
    },
    {
      regulation: Regulation.EU_CRD,
      article: 'Art. 8(6)',
      description:
        'CRD requires that pre-ticked boxes and consent mechanisms be unambiguous — trick wording violates this standard.',
    },
  ],

  [DarkPatternCategory.VISUAL_INTERFERENCE]: [
    {
      regulation: Regulation.EU_DSA,
      article: 'Art. 25(2)',
      description:
        'DSA specifically prohibits giving more visual prominence to one choice over another to steer users.',
    },
    {
      regulation: Regulation.GDPR,
      article: 'Recital 32',
      description:
        'GDPR requires that consent be as easy to refuse as to give — visually deprioritizing the decline option violates this.',
    },
  ],

  // ─── Sneaking ───

  [DarkPatternCategory.BASKET_SNEAKING]: [
    {
      regulation: Regulation.EU_CRD,
      article: 'Art. 22',
      description:
        'CRD prohibits pre-ticking boxes or pre-selecting additional items that result in additional payment without explicit consumer consent.',
    },
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a)',
      description:
        'Adding items to a cart without explicit consent is an unfair and deceptive billing practice under FTC Act §5.',
    },
    {
      regulation: Regulation.AUSTRALIA_ACL,
      article: 'Schedule 2, §64',
      description:
        'ACL prohibits supplying goods or services not ordered — pre-added items without consent may violate this.',
    },
  ],

  [DarkPatternCategory.DRIP_PRICING]: [
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a)',
      description:
        'FTC considers drip pricing deceptive when fees are not disclosed upfront — enforceable under §5.',
    },
    {
      regulation: Regulation.EU_CRD,
      article: 'Art. 6(1)(e)',
      description:
        'CRD requires the total price including all taxes and fees to be disclosed before the contract is concluded.',
    },
    {
      regulation: Regulation.EU_UCPD,
      article: 'Annex I, Para 20',
      description:
        'UCPD blacklists describing a product as "free" or similar when the total cost is not clearly presented.',
    },
    {
      regulation: Regulation.AUSTRALIA_ACL,
      article: 'Part 3-1, Div 4',
      description:
        'ACL requires component pricing to include all mandatory fees and charges.',
    },
  ],

  [DarkPatternCategory.BAIT_AND_SWITCH]: [
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a)',
      description:
        'Advertising one product or price and delivering another is a classic bait-and-switch deceptive practice.',
    },
    {
      regulation: Regulation.EU_UCPD,
      article: 'Annex I, Para 6',
      description:
        'UCPD blacklists making an invitation to purchase at a specified price and then refusing to show the advertised item.',
    },
  ],

  // ─── Obstruction ───

  [DarkPatternCategory.ROACH_MOTEL]: [
    {
      regulation: Regulation.FTC_ACT,
      article: 'ROSCA §4',
      description:
        'ROSCA requires simple mechanisms for consumers to cancel recurring charges. Roach motel violates this.',
    },
    {
      regulation: Regulation.EU_DSA,
      article: 'Art. 25(1)',
      description:
        'DSA prohibits interfaces that make termination of subscriptions disproportionately harder than their initiation.',
    },
    {
      regulation: Regulation.UK_ONLINE_SAFETY,
      article: 'Schedule 7',
      description:
        'UK Online Safety Act requires platforms to have accessible means for users to cancel subscriptions.',
    },
  ],

  [DarkPatternCategory.FORCED_CONTINUITY]: [
    {
      regulation: Regulation.FTC_ACT,
      article: 'ROSCA §4 & §5',
      description:
        'FTC ROSCA requires clear and conspicuous disclosure of recurring charge amounts, dates, and cancellation mechanisms before obtaining billing information.',
    },
    {
      regulation: Regulation.EU_CRD,
      article: 'Art. 8(7)',
      description:
        'CRD requires explicit consumer confirmation before placing an order that incurs payment obligation.',
    },
    {
      regulation: Regulation.CCPA_CPRA,
      article: '§1798.132',
      description:
        'CPRA requires that auto-renewal terms be presented clearly and conspicuously before subscription.',
    },
  ],

  [DarkPatternCategory.HARD_TO_CANCEL]: [
    {
      regulation: Regulation.FTC_ACT,
      article: 'ROSCA §4',
      description:
        'ROSCA requires simple mechanisms for cancellation. Phone-only or multi-step cancellation processes violate this.',
    },
    {
      regulation: Regulation.EU_CRD,
      article: 'Art. 11(1)',
      description:
        'CRD requires consumers to be able to exercise their right of withdrawal through a simple, easy process.',
    },
  ],

  // ─── Forced Action ───

  [DarkPatternCategory.FORCED_REGISTRATION]: [
    {
      regulation: Regulation.GDPR,
      article: 'Art. 5(1)(c)',
      description:
        'GDPR data minimisation principle prohibits collecting personal data (account registration) when not necessary for the stated purpose.',
    },
    {
      regulation: Regulation.EU_DSA,
      article: 'Art. 25(1)',
      description:
        'DSA prohibits interfaces that make service access conditional on providing more data than needed.',
    },
  ],

  [DarkPatternCategory.FORCED_SHARING]: [
    {
      regulation: Regulation.GDPR,
      article: 'Art. 7(4)',
      description:
        'GDPR prohibits making service access conditional on consent to data processing not necessary for the service.',
    },
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a)',
      description:
        'Forcing users to share on social media to access content is an unfair commercial practice.',
    },
  ],

  [DarkPatternCategory.GAMIFICATION_PRESSURE]: [
    {
      regulation: Regulation.EU_DSA,
      article: 'Art. 25(1)',
      description:
        'DSA prohibits interfaces that exploit psychological weaknesses — including streak mechanics that create compulsive engagement.',
    },
    {
      regulation: Regulation.UK_ONLINE_SAFETY,
      article: 'Schedule 4',
      description:
        'UK Online Safety Act requires platforms to consider risks from features that encourage excessive use.',
    },
  ],

  // ─── Preselection ───

  [DarkPatternCategory.PRESELECTED_OPTIONS]: [
    {
      regulation: Regulation.GDPR,
      article: 'Art. 7 & Recital 32',
      description:
        'GDPR explicitly prohibits pre-ticked boxes as a valid form of consent — consent must be an active affirmative act.',
    },
    {
      regulation: Regulation.EU_CRD,
      article: 'Art. 22',
      description:
        'CRD prohibits pre-ticked boxes that result in additional payment obligations.',
    },
    {
      regulation: Regulation.CCPA_CPRA,
      article: '§1798.120',
      description:
        'CPRA requires opt-in (not opt-out) consent for sale of personal information — pre-selected opt-ins violate this.',
    },
  ],

  [DarkPatternCategory.HIDDEN_DEFAULTS]: [
    {
      regulation: Regulation.GDPR,
      article: 'Art. 25(2)',
      description:
        'GDPR requires privacy by default — only data necessary for each purpose is processed. Default opt-in violates this.',
    },
    {
      regulation: Regulation.EU_DSA,
      article: 'Art. 25(1)',
      description:
        'DSA prohibits defaults that are against user interest and not transparent.',
    },
  ],

  // ─── Nagging ───

  [DarkPatternCategory.REPEATED_PROMPTS]: [
    {
      regulation: Regulation.GDPR,
      article: 'Art. 7(3)',
      description:
        "Repeatedly asking for consent after refusal violates GDPR's requirement that withdrawal of consent must be respected.",
    },
    {
      regulation: Regulation.EU_DSA,
      article: 'Art. 25(1)',
      description:
        'DSA prohibits repeated prompts that coerce users into consent they have already declined.',
    },
  ],

  [DarkPatternCategory.DISGUISED_ADS]: [
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a) & Native Advertising Guidance',
      description:
        'FTC requires that sponsored content and ads be clearly and conspicuously labeled. Unlabeled native ads violate §5.',
    },
    {
      regulation: Regulation.EU_UCPD,
      article: 'Annex I, Para 11',
      description:
        'UCPD blacklists using editorial content in media to promote a product without making clear it is paid advertising.',
    },
  ],

  // ─── Comparison Prevention ───

  [DarkPatternCategory.COMPARISON_PREVENTION]: [
    {
      regulation: Regulation.EU_UCPD,
      article: 'Art. 7(1)',
      description:
        'UCPD prohibits omitting material information that the average consumer needs to make an informed decision, including pricing.',
    },
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a)',
      description:
        'Hiding pricing behind sales contact requirements is a deceptive practice when competitors display prices openly.',
    },
  ],

  [DarkPatternCategory.INFORMATION_HIDING]: [
    {
      regulation: Regulation.EU_CRD,
      article: 'Art. 6(1)',
      description:
        'CRD requires pre-contractual information to be provided in a clear and comprehensible manner — fine print and buried terms violate this.',
    },
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a)',
      description:
        'Material information hidden in fine print or collapsed sections constitutes a deceptive omission under FTC Act §5.',
    },
  ],

  // ─── Privacy ───

  [DarkPatternCategory.PRIVACY_ZUCKERING]: [
    {
      regulation: Regulation.GDPR,
      article: 'Art. 5(1)(a)',
      description:
        'GDPR requires personal data to be processed lawfully, fairly, and transparently. Tricking users into sharing more data violates this.',
    },
    {
      regulation: Regulation.CCPA_CPRA,
      article: '§1798.100',
      description:
        'CPRA requires businesses to inform consumers at or before collection of all categories of personal information collected.',
    },
    {
      regulation: Regulation.INDIA_DPDP,
      article: 'Chapter II, §6',
      description:
        'India DPDP Act requires notice of data processing to be given in clear and plain language before or at the time of collection.',
    },
  ],

  [DarkPatternCategory.COOKIE_WALL]: [
    {
      regulation: Regulation.GDPR,
      article: 'Recital 43 & Art. 7(4)',
      description:
        'GDPR requires that consent be freely given — conditioning access to a service on cookie consent is invalid under GDPR. EDPB guidelines confirm cookie walls are non-compliant.',
    },
    {
      regulation: Regulation.EU_DSA,
      article: 'Art. 25(1)',
      description:
        'DSA prohibits requiring users to consent to non-essential data processing to access a service.',
    },
  ],

  [DarkPatternCategory.DARK_CONSENT]: [
    {
      regulation: Regulation.GDPR,
      article: 'Art. 7(3)',
      description:
        'GDPR requires that withdrawal of consent be as easy as giving it. Asymmetric accept/reject design violates this requirement.',
    },
    {
      regulation: Regulation.EU_DSA,
      article: 'Art. 25(1)',
      description:
        'DSA specifically prohibits making acceptance of data processing easier than rejection.',
    },
    {
      regulation: Regulation.CCPA_CPRA,
      article: '§1798.135',
      description:
        'CPRA requires opt-out mechanisms to be at least as prominent as opt-in mechanisms.',
    },
  ],

  // ─── Interface Manipulation ───

  [DarkPatternCategory.FAKE_HIERARCHY]: [
    {
      regulation: Regulation.EU_DSA,
      article: 'Art. 25(2)',
      description:
        'DSA specifically prohibits giving more visual prominence to one choice to steer users toward it.',
    },
    {
      regulation: Regulation.EU_UCPD,
      article: 'Art. 6(1)',
      description:
        'UCPD prohibits misleading actions that cause the average consumer to take a different decision, including visual manipulation.',
    },
    {
      regulation: Regulation.FTC_ACT,
      article: '§5(a)',
      description:
        'Visually manipulating users toward higher-cost options through asymmetric design is an unfair commercial practice.',
    },
  ],
}
