/**
 * Trusten — Shared display tokens
 *
 * Single source of truth for the purple-theme colors and human-readable
 * category labels used by the server-rendered dashboard (ui.ts) and the
 * standalone HTML/PDF report (report.ts). Keeping these here prevents the two
 * renderers from drifting apart.
 */

export const GRADE_COLOR: Record<string, string> = {
  A: '#15a05a',
  B: '#7d9b1f',
  C: '#cf8a00',
  D: '#e0651b',
  F: '#d23b34',
}

export const SEVERITY_COLOR: Record<string, string> = {
  critical: '#d23b34',
  high: '#e0651b',
  medium: '#cf8a00',
  low: '#15a05a',
}

export const SEVERITY_BG: Record<string, string> = {
  critical: '#fbeceb',
  high: '#fbefe6',
  medium: '#fbf3e0',
  low: '#e9f6ef',
}

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
