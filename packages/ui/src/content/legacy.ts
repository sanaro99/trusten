/**
 * Legacy display maps, kept for report.ts until project 2 rebuilds it on
 * components. New code should use PATTERN_CONTENT and the CSS tokens.
 */
export const GRADE_COLOR: Record<string, string> = {
  A: '#15803d',
  B: '#4d7c0f',
  C: '#a16207',
  D: '#c2410c',
  F: '#b91c1c',
}

export const SEVERITY_COLOR: Record<string, string> = {
  critical: '#b91c1c',
  high: '#c2410c',
  medium: '#a16207',
  low: '#15803d',
}

/**
 * The report's original category labels, carried over unchanged.
 *
 * Deliberately NOT derived from PATTERN_CONTENT: spec 7.6 leaves report.ts
 * untouched this project, and deriving these would silently re-voice the PDF.
 * Project 2 decides the report's voice when it splits the consumer and
 * professional reports.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  fake_urgency: 'Fake Urgency',
  fake_scarcity: 'Fake Scarcity',
  fake_social_proof: 'Fake Social Proof',
  confirmshaming: 'Confirmshaming',
  trick_wording: 'Trick Wording',
  visual_interference: 'Visual Interference',
  basket_sneaking: 'Basket Sneaking',
  drip_pricing: 'Drip Pricing',
  bait_and_switch: 'Bait & Switch',
  roach_motel: 'Roach Motel',
  forced_continuity: 'Forced Continuity',
  hard_to_cancel: 'Hard to Cancel',
  forced_registration: 'Forced Registration',
  forced_sharing: 'Forced Sharing',
  gamification_pressure: 'Gamification Pressure',
  preselected_options: 'Preselected Options',
  hidden_defaults: 'Hidden Defaults',
  repeated_prompts: 'Repeated Prompts',
  disguised_ads: 'Disguised Ads',
  comparison_prevention: 'Comparison Prevention',
  information_hiding: 'Information Hiding',
  privacy_zuckering: 'Privacy Zuckering',
  cookie_wall: 'Cookie Wall',
  dark_consent: 'Dark Consent',
  fake_hierarchy: 'Fake Hierarchy',
}
