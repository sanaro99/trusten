/**
 * Trusten — what each finding means, in plain words.
 *
 * The scanner names findings using the Brignull/Mathur research taxonomy
 * ("roach motel", "confirmshaming"). Those names are correct and useless to
 * the people this product is for. This file is the translation layer, and it
 * is content: review it as writing, not as code.
 *
 * Fields, each with a job:
 *   name      what to call it
 *   what      what the site did
 *   why       why that is unfair to you
 *   watchFor  how to spot it yourself next time
 *   lawPlain  the legal position, one sentence, no citation
 *
 * House rules for anyone editing this file: blame the site, never the
 * reader; no numbers the reader has to interpret; short sentences, plain
 * words, active voice. Entries follow the order of DarkPatternCategory.
 */
import { DarkPatternCategory } from '@trusten/shared/domain'

export interface PatternContent {
  name: string
  what: string
  why: string
  watchFor: string
  lawPlain: string
  /**
   * True when the legal position is genuinely unsettled — regulators have
   * started to push back, but nothing yet settles it either way.
   *
   * Renderers (dashboard, PDF, extension popup) must introduce this entry's
   * regulatoryViolations as rules regulators have pointed to, never as
   * established breaches. Without that framing the citation list contradicts
   * the lawPlain sitting directly above it, and the reader concludes we do
   * not know what we are talking about. Absent means the law is settled.
   */
  contested?: boolean
}

export const PATTERN_CONTENT: Record<DarkPatternCategory, PatternContent> = {
  [DarkPatternCategory.FAKE_URGENCY]: {
    name: 'A fake deadline',
    what: 'This shop used a countdown or a "hurry" message to rush you.',
    why: 'The deadline often is not real. It is there to stop you comparing prices or thinking it over.',
    watchFor: 'Timers that start again when you reload the page.',
    lawPlain:
      'In the EU and the US, inventing a fake deadline to hurry a shopper is against the law.',
  },

  [DarkPatternCategory.FAKE_SCARCITY]: {
    name: "Pretending it's nearly sold out",
    what: 'This shop said only a few items were left.',
    why: 'Shops often show this whether it is true or not, so you buy before checking elsewhere.',
    watchFor: 'A "only 2 left" message that says the same thing days later.',
    lawPlain:
      'Claiming something is nearly gone when it is not is illegal in the EU, the UK and the US.',
  },

  [DarkPatternCategory.FAKE_SOCIAL_PROOF]: {
    name: 'Pretending to be popular',
    what: 'This site showed reviews or shopper counts that may not be real.',
    why: 'Seeing other people buy something makes it feel like a safe choice. Sites know that, so some of them make the numbers up.',
    watchFor:
      'Shopper counts that change every time you reload, and pages of glowing reviews all written in the same week.',
    lawPlain:
      'Inventing reviews or shopper numbers to look popular is illegal in the EU, the UK and the US.',
  },

  [DarkPatternCategory.CONFIRMSHAMING]: {
    name: 'Guilt-tripping you for saying no',
    what: 'The button to say no was worded to make you feel bad.',
    why: 'Wording like "No thanks, I don\'t like saving money" is designed to embarrass you into agreeing.',
    watchFor: 'A "no" option that sounds like an insult to yourself.',
    lawPlain:
      'EU rules ban website designs that pressure or manipulate people into choices.',
  },

  [DarkPatternCategory.TRICK_WORDING]: {
    name: 'Wording designed to confuse you',
    what: 'This site worded the choice so that agreeing and refusing look almost the same.',
    why: 'A clear question gets a clear answer. Muddled wording gets the answer the site wanted.',
    watchFor:
      'Two negatives in one sentence, such as "untick this box to stop us not emailing you".',
    lawPlain:
      'The EU, the UK and the US all require offers and choices to be put in clear language.',
  },

  [DarkPatternCategory.VISUAL_INTERFERENCE]: {
    name: 'Important words made hard to see',
    what: 'The site printed the part that matters in tiny or faint text.',
    why: 'The words are there, so the site can say it told you. They are simply made easy to miss.',
    watchFor:
      'Pale grey writing sitting next to bold black writing, or terms set much smaller than everything around them.',
    lawPlain:
      'Terms have to be presented so that people can actually notice and read them, in the EU, the UK and the US.',
  },

  [DarkPatternCategory.BASKET_SNEAKING]: {
    name: "Something added to your basket you didn't pick",
    what: 'An extra item or charge turned up in your basket that you never chose.',
    why: 'It is slipped in quietly and then counted as your decision. Most people pay for it without noticing.',
    watchFor:
      'Count the lines on the final bill against the things you actually chose, before you pay.',
    lawPlain:
      'In the EU, the UK and the US, a shop cannot charge you for anything you did not actively agree to buy.',
  },

  [DarkPatternCategory.DRIP_PRICING]: {
    name: 'Extra costs added at the last step',
    what: 'The price went up with fees that were not shown at the start.',
    why: 'By the time the real price appears you have already spent time and are more likely to accept it.',
    watchFor:
      'Fees with vague names like "service fee" or "processing fee" that only appear on the very last screen.',
    lawPlain:
      'The EU and the US require the full price, including unavoidable fees, to be shown up front.',
  },

  [DarkPatternCategory.BAIT_AND_SWITCH]: {
    name: 'Offering one thing, then giving another',
    what: 'You clicked for one thing and the site did something else instead.',
    why: 'The offer was the whole reason you clicked. Swapping it afterwards takes the decision away from you.',
    watchFor: 'A button whose words do not match the page it opens.',
    lawPlain:
      'Advertising one thing and delivering another is illegal in the EU, the UK and the US.',
  },

  [DarkPatternCategory.ROACH_MOTEL]: {
    name: 'Easy to join, hard to leave',
    what: 'Signing up took moments, but leaving is buried or missing.',
    why: 'Making the exit hard to find keeps you paying for longer than you meant to.',
    watchFor: 'No "cancel" link anywhere in your account settings.',
    lawPlain:
      'EU law says cancelling must be as easy as signing up was. US regulators want the same rule, but it is still being fought over in court.',
    contested: true,
  },

  [DarkPatternCategory.FORCED_CONTINUITY]: {
    name: 'A free trial that quietly starts charging',
    what: 'This site takes your card for a free trial and starts charging when the trial ends.',
    why: 'No reminder is sent. Often the first sign is a payment on your bank statement.',
    watchFor: 'A trial that never states a clear end date when you sign up.',
    lawPlain:
      'In the EU and the US, a site has to tell you clearly when a free trial turns into a paid one.',
  },

  [DarkPatternCategory.HARD_TO_CANCEL]: {
    name: 'Making it hard to cancel',
    what: 'Cancelling needs a phone call, an email, or several extra steps.',
    why: 'Every extra step is there hoping you give up and keep paying.',
    watchFor: 'Being told to ring a number when you signed up in one click.',
    lawPlain:
      'US regulators have tried to require a simple way to cancel anything you signed up for online, but the rule keeps getting challenged in court.',
    contested: true,
  },

  [DarkPatternCategory.FORCED_REGISTRATION]: {
    name: 'Made to create an account for no good reason',
    what: 'You cannot get any further here until you hand over an email address and make an account.',
    why: 'The account is not there to help you. It is there so the site can keep your details and contact you later.',
    watchFor:
      'A sign-up step in front of something that plainly does not need one, like reading an article or seeing a price.',
    lawPlain:
      'EU and UK privacy law says a site cannot demand personal details it does not genuinely need.',
  },

  [DarkPatternCategory.FORCED_SHARING]: {
    name: 'Made to share your contacts or profile',
    what: 'The site asked for your contacts, your address book, or a social account before letting you carry on.',
    why: "That hands over other people's details as well as your own, and none of them agreed to it.",
    watchFor:
      'An "invite your friends" step, or a "continue with Facebook" button that is the only way in.',
    lawPlain:
      'Under EU and UK privacy law, getting into a service cannot depend on giving up information it does not need.',
  },

  [DarkPatternCategory.GAMIFICATION_PRESSURE]: {
    name: 'Streaks and rewards used to keep you coming back',
    what: 'This site gives you streaks, points, or badges that you lose if you stop.',
    why: 'The reward is worth nothing outside the site. It exists to make leaving feel like a loss.',
    watchFor: 'A count of days in a row that the site warns you not to break.',
    lawPlain:
      'This one is a grey area. Regulators have started to challenge designs like this, but it is not clearly against the law.',
    contested: true,
  },

  [DarkPatternCategory.PRESELECTED_OPTIONS]: {
    name: 'Boxes already ticked for you',
    what: 'This site ticked boxes on your behalf before you chose anything.',
    why: 'Most people never untick them, so the site gets an agreement you never actually gave.',
    watchFor: 'Ticked boxes for extras, insurance, or marketing emails.',
    lawPlain:
      'EU law says agreement must be an active choice, so pre-ticked boxes do not count as consent.',
  },

  [DarkPatternCategory.HIDDEN_DEFAULTS]: {
    name: 'Settings quietly chosen for you',
    what: 'The site made your choices for you and put them somewhere you would not think to look.',
    why: 'They are set the way the site prefers, which is rarely the way you would have set them.',
    watchFor:
      'Open your settings after you join and read what is already switched on.',
    lawPlain:
      'EU privacy law says the private setting should be the one you start with, not the one you have to hunt for.',
  },

  [DarkPatternCategory.REPEATED_PROMPTS]: {
    name: 'Asked again and again until you agree',
    what: 'The site keeps asking for the same thing after you have already said no.',
    why: 'Saying no once should settle it. Asking over and over wears people down until they give in.',
    watchFor:
      'The same box coming back on every page, with no way to turn it off for good.',
    lawPlain:
      'EU rules treat pestering someone who has already refused as pressure, and do not allow it.',
  },

  [DarkPatternCategory.DISGUISED_ADS]: {
    name: 'Adverts made to look like normal content',
    what: 'Something on this page is a paid advert dressed up as ordinary content.',
    why: 'A recommendation means less once you know someone paid for it. That is why the site hides the label.',
    watchFor:
      'A faint little word like "sponsored", "promoted" or "ad" tucked into a corner of the box.',
    lawPlain:
      'Adverts must be clearly marked as adverts in the EU, the UK and the US.',
  },

  [DarkPatternCategory.COMPARISON_PREVENTION]: {
    name: 'Made hard to compare with other options',
    what: 'This site makes its options awkward to line up side by side.',
    why: 'Comparing is how you find the better deal. A site that is not the better deal has a reason to stop you looking.',
    watchFor:
      'Prices given by the week on one option and by the year on another, or features listed in a different order each time.',
    lawPlain:
      'EU and UK rules require prices to be given in a form that lets shoppers compare them.',
  },

  [DarkPatternCategory.INFORMATION_HIDING]: {
    name: 'Important details kept out of sight',
    what: 'Something you would want to know before deciding is buried behind a link or far down a long page.',
    why: 'The detail is there if you go digging. Keeping it out of reach means most people decide without it.',
    watchFor:
      'Facts that appear only after you click "more", or only inside a document you have to download.',
    lawPlain:
      'The facts you need in order to decide have to be given up front in the EU, the UK and the US.',
  },

  [DarkPatternCategory.PRIVACY_ZUCKERING]: {
    name: 'Sharing your details without telling you clearly',
    what: 'This site passes your personal information to other companies.',
    why: 'It is mentioned somewhere in the small print, where almost nobody reads it.',
    watchFor: 'Long terms pages that mention "partners" or "third parties".',
    lawPlain:
      'EU privacy law requires sites to tell you clearly who gets your information and why.',
  },

  [DarkPatternCategory.COOKIE_WALL]: {
    name: 'No entry unless you accept tracking',
    what: 'This site blocks the page until you agree to be followed around the web.',
    why: 'An agreement you are not allowed to refuse is not really an agreement.',
    watchFor:
      'A banner with a big "accept" button and no refuse button of the same size beside it.',
    lawPlain:
      'Under EU privacy law your agreement has to be freely given, so refusing must be a real option.',
  },

  [DarkPatternCategory.DARK_CONSENT]: {
    name: 'An agreement box designed to be confusing',
    what: 'The box asking permission to use your information is worded and laid out to be hard to follow.',
    why: 'Agreeing takes one click. Refusing takes several, through menus that are harder to read.',
    watchFor:
      'A bold "accept all" button next to a small grey "manage settings" link.',
    lawPlain: 'EU privacy law says refusing must be as easy as agreeing.',
  },

  [DarkPatternCategory.FAKE_HIERARCHY]: {
    name: "The 'no' button made hard to find",
    what: 'The button this site wants you to press is big and bright. The other one is faint or tucked away.',
    why: 'Both answers should be equally easy to find. Hiding one of them steers you towards the answer the site prefers.',
    watchFor:
      'A small, grey or underlined "no thanks" sitting beside a large coloured button.',
    lawPlain:
      'EU rules ban making one choice stand out over another in order to steer people.',
  },
}

export function getPatternContent(
  category: DarkPatternCategory,
): PatternContent {
  return PATTERN_CONTENT[category]
}
