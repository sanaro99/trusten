import { DarkPatternCategory } from '@trusten/shared/domain'

/** One immediate, low-risk action a reader can take after seeing a finding. */
export const PATTERN_ADVICE: Record<DarkPatternCategory, string> = {
  [DarkPatternCategory.FAKE_URGENCY]:
    'Pause and reload the page. If the timer starts again, ignore the deadline and compare your options.',
  [DarkPatternCategory.FAKE_SCARCITY]:
    'Do not rush. Check the same item later or on another website before deciding.',
  [DarkPatternCategory.FAKE_SOCIAL_PROOF]:
    'Treat the popularity claim as advertising. Look for reviews from an independent source.',
  [DarkPatternCategory.CONFIRMSHAMING]:
    'Choose the option that suits you. The wording is meant to make saying no feel uncomfortable.',
  [DarkPatternCategory.TRICK_WORDING]:
    'Read the choice once more and look for words such as “not” or “unless” before you click.',
  [DarkPatternCategory.VISUAL_INTERFERENCE]:
    'Zoom in and read the faint or small text before you agree or pay.',
  [DarkPatternCategory.BASKET_SNEAKING]:
    'Remove anything you did not choose and check the final list again before paying.',
  [DarkPatternCategory.DRIP_PRICING]:
    'Compare the final total, not the first price. Leave if the added fees change the value of the offer.',
  [DarkPatternCategory.BAIT_AND_SWITCH]:
    'Go back and check what the button promised. Do not continue if the result is different.',
  [DarkPatternCategory.ROACH_MOTEL]:
    'Find the cancellation steps before paying. Consider a payment method that lets you stop future charges.',
  [DarkPatternCategory.FORCED_CONTINUITY]:
    'Set a reminder before the trial ends and save the cancellation instructions.',
  [DarkPatternCategory.HARD_TO_CANCEL]:
    'Save screenshots and confirmation messages. Ask your payment provider for help if charges continue.',
  [DarkPatternCategory.FORCED_REGISTRATION]:
    'Consider whether the service truly needs an account. Use guest access when it is offered.',
  [DarkPatternCategory.FORCED_SHARING]:
    'Do not share contacts or connect a social account unless the service genuinely needs it.',
  [DarkPatternCategory.GAMIFICATION_PRESSURE]:
    'Ignore the streak or points for a moment and decide whether returning still helps you.',
  [DarkPatternCategory.PRESELECTED_OPTIONS]:
    'Untick extras and marketing choices you did not actively choose.',
  [DarkPatternCategory.HIDDEN_DEFAULTS]:
    'Review privacy, payment, and notification settings after joining.',
  [DarkPatternCategory.REPEATED_PROMPTS]:
    'Keep your original choice. Look in settings for a permanent way to stop the prompts.',
  [DarkPatternCategory.DISGUISED_ADS]:
    'Treat the item as an advert and check an independent source before acting on it.',
  [DarkPatternCategory.COMPARISON_PREVENTION]:
    'Convert prices to the same time period and list the features that matter to you.',
  [DarkPatternCategory.INFORMATION_HIDING]:
    'Open the details and terms before deciding. Search the page for fees, renewal, cancellation, and sharing.',
  [DarkPatternCategory.PRIVACY_ZUCKERING]:
    'Open the privacy settings and limit sharing that is not needed for the service.',
  [DarkPatternCategory.COOKIE_WALL]:
    'Look for “reject,” “continue without accepting,” or browser privacy controls before agreeing.',
  [DarkPatternCategory.DARK_CONSENT]:
    'Open the settings and switch off optional tracking instead of choosing “accept all.”',
  [DarkPatternCategory.FAKE_HIERARCHY]:
    'Read every option, including faint links. Choose based on the words, not the button size.',
}

export function getPatternAdvice(category: DarkPatternCategory): string {
  return PATTERN_ADVICE[category]
}
