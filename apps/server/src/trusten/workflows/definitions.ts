/**
 * Trusten — Predefined Scan Workflows
 *
 * Each workflow describes a multi-step user journey to probe for dark patterns.
 *
 * Steps now have two navigation modes:
 *  - aiGoal: natural language goal for the AI navigator (preferred)
 *  - clickText / fillSearch / navigate: fallback deterministic actions
 *
 * The AI navigator (navigateWithAI) reads the accessibility tree and decides
 * what to click/fill/press — exactly like the BrowserOS chat agent does.
 * This means workflows work on any site without hardcoded selectors.
 */

import type { ScanWorkflow } from '../types'

export const CHECKOUT_WORKFLOW: ScanWorkflow = {
  id: 'checkout',
  name: 'Checkout Flow',
  description:
    'Searches for a product or service, adds it to the cart/booking, and traces the full checkout process. Looks for basket sneaking, drip pricing, preselection, and urgency tactics.',
  steps: [
    {
      id: 'find-product',
      expectsNavigation: true,
      fillSearch: 'shirt',
      instruction:
        'Find the site\'s main search or browse functionality and search for a popular product or service relevant to this site. For travel sites: search for a trip. For e-commerce: search for "shirt" or a common product. For streaming: look for a plan.',
      aiGoal:
        'Use the site\'s search or main navigation to find a specific product, flight, hotel, or service. For travel sites (Expedia, Booking, Kayak): search for a round-trip flight from Seattle to New York or a hotel in New York for 2 nights next week. For e-commerce (Amazon, Shein, eBay): search for "shirt" and open the first result. For subscription services: find the pricing or plans page. Navigate to a product detail or results page — do not stay on the homepage.',
      analyzersToRun: [
        'UrgencyScarcityAnalyzer',
        'MisdirectionAnalyzer',
        'SneakingAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 60,
      screenshotBefore: true,
      screenshotAfter: true,
    },
    {
      id: 'select-product',
      expectsNavigation: true,
      clickFirst: true,
      instruction:
        'Select the first or cheapest product/flight/hotel from the results page and open its detail page.',
      aiGoal:
        'From the search results or listing page, click on the first available option to open its detail page. For flights: select the cheapest or first flight option. For hotels: click the first property. For e-commerce: click the first product result. You should be on a product detail, flight detail, or property detail page after this step.',
      analyzersToRun: [
        'UrgencyScarcityAnalyzer',
        'MisdirectionAnalyzer',
        'SneakingAnalyzer',
        'InterfaceManipulationAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 45,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'add-to-cart',
      expectsNavigation: true,
      clickText: [
        'add to cart',
        'add to bag',
        'add to basket',
        'buy now',
        'select',
      ],
      instruction:
        'Add the product/flight/hotel to cart or initiate the booking. Note any pre-added extras, insurance, or add-ons.',
      aiGoal:
        'Click "Add to Cart", "Add to Bag", "Select", "Book", "Reserve", or the primary call-to-action button on the product/flight/hotel page. For flights: click the "Select" or "Choose" button for the flight. After clicking, you should be on a cart page, bag page, or the next step of booking. Note: do NOT fill in personal information or payment details.',
      analyzersToRun: [
        'SneakingAnalyzer',
        'PreselectionAnalyzer',
        'UrgencyScarcityAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'cart-review',
      expectsNavigation: true,
      clickText: ['cart', 'basket', 'bag', 'view cart', 'your trip'],
      instruction:
        'Navigate to the cart or order summary page and review what is present.',
      aiGoal:
        'Navigate to the shopping cart, bag, or booking summary. Look for a "Cart", "Bag", "Your trip", "Order summary" link or button and click it. You should see a list of items or flight/hotel details with prices. If you are already on a cart/summary page, mark this as done.',
      analyzersToRun: [
        'SneakingAnalyzer',
        'PreselectionAnalyzer',
        'UrgencyScarcityAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'checkout-start',
      expectsNavigation: true,
      clickText: ['proceed to checkout', 'checkout', 'continue', 'book now'],
      instruction:
        'Click Checkout or Proceed to Checkout and observe any new fees, charges, or pre-selected options that appear.',
      aiGoal:
        'Click the "Checkout", "Proceed to Checkout", "Continue", or "Book now" button from the cart or order summary. You should reach the first step of checkout (guest/email entry, login prompt, or payment page). Do NOT enter any real personal information. If a login/account creation wall appears, mark as done and note it.',
      analyzersToRun: [
        'SneakingAnalyzer',
        'ForcedActionAnalyzer',
        'PreselectionAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: true,
      screenshotAfter: true,
    },
  ],
}

export const CANCELLATION_WORKFLOW: ScanWorkflow = {
  id: 'cancellation',
  name: 'Cancellation Flow',
  description:
    'Attempts to find and navigate the account cancellation or subscription management flow. Measures friction, step count, and guilt-based retention tactics.',
  steps: [
    {
      id: 'account-settings',
      expectsNavigation: true,
      instruction: 'Navigate to the account or profile settings page.',
      aiGoal:
        'Find and click on the account settings, profile settings, or membership management area. Look for a user/account icon, avatar, "My Account", "Profile", "Account Settings", or similar in the header or navigation. Click it to open the account menu or settings page.',
      clickText: ['my account', 'account', 'profile', 'settings', 'sign in'],
      analyzersToRun: ['ObstructionAnalyzer', 'VisualAnalyzer'],
      timeout: 40,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'find-cancel',
      expectsNavigation: true,
      instruction:
        'Look for a "Cancel subscription", "Cancel membership", "Delete account", or "Manage subscription" option.',
      aiGoal:
        'Within the account settings or profile area, find any option related to canceling a subscription, ending a membership, or deleting the account. Look for "Cancel subscription", "Cancel plan", "Cancel membership", "Delete account", "Close account", "Manage subscription", or "Billing". Click the most relevant option. Note how buried or hidden this option is.',
      clickText: [
        'cancel',
        'subscription',
        'membership',
        'delete account',
        'manage',
        'billing',
      ],
      analyzersToRun: [
        'ObstructionAnalyzer',
        'MisdirectionAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 60,
      screenshotBefore: true,
      screenshotAfter: true,
    },
    {
      id: 'cancel-flow',
      expectsNavigation: true,
      instruction:
        'Begin the cancellation process and observe every retention tactic, guilt trip, and friction point.',
      aiGoal:
        'Click "Cancel subscription", "Cancel membership", "Delete account", or whatever option initiates the cancellation/deletion flow. Observe and let the flow progress through any surveys, retention offers, or confirmation dialogs. Do NOT confirm final cancellation or deletion. If you encounter a guilt-trip message ("You will lose X"), a counter-offer, or a multi-step survey before cancellation is allowed, stop and mark as done — that IS the dark pattern we are documenting.',
      clickText: [
        'cancel subscription',
        'cancel membership',
        'delete account',
        'continue',
        'proceed',
      ],
      analyzersToRun: [
        'ObstructionAnalyzer',
        'MisdirectionAnalyzer',
        'UrgencyScarcityAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 60,
      screenshotBefore: true,
      screenshotAfter: true,
    },
  ],
}

export const SIGNUP_WORKFLOW: ScanWorkflow = {
  id: 'signup',
  name: 'Signup / Registration Flow',
  description:
    'Goes through the account registration or signup process. Looks for forced registration, preselected opt-ins, dark consent patterns, and data collection overreach.',
  steps: [
    {
      id: 'find-signup',
      expectsNavigation: true,
      instruction: 'Click the Sign Up, Register, or Create Account button.',
      aiGoal:
        'Find and click the "Sign Up", "Register", "Create Account", "Join", "Join free", or "Get started" button or link. It is typically in the site header, hero section, or top navigation. After clicking, you should see a registration/signup form.',
      clickText: [
        'sign up',
        'register',
        'create account',
        'join',
        'join free',
        'get started',
      ],
      analyzersToRun: [
        'ForcedActionAnalyzer',
        'PreselectionAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'form-analysis',
      instruction:
        'Inspect the signup form carefully for pre-checked checkboxes, misleading consent language, and required vs optional field labeling.',
      aiGoal:
        'You are now on the signup/registration form. Do NOT submit the form. Scroll down slowly to see all form fields, checkboxes, and consent options. Look for: pre-checked marketing consent checkboxes, checkboxes for sharing data with third parties, misleading labels on required vs optional fields, fine print about subscriptions or marketing. After scrolling to the bottom of the form, mark as done.',
      analyzersToRun: [
        'PreselectionAnalyzer',
        'PrivacyAnalyzer',
        'MisdirectionAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 20,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'terms-review',
      instruction:
        'Find and review the terms of service and privacy policy links in the signup form.',
      aiGoal:
        'Scroll to the bottom of the signup form and find the Terms of Service, Privacy Policy, and Cookie Policy links. Note how prominently they are displayed. Click on the Privacy Policy link if visible to see what data is being collected. Mark done once you have seen the terms area or privacy policy page.',
      analyzersToRun: [
        'ComparisonPreventionAnalyzer',
        'PrivacyAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: true,
      screenshotAfter: true,
    },
  ],
}

export const COOKIE_CONSENT_WORKFLOW: ScanWorkflow = {
  id: 'cookie_consent',
  name: 'Cookie Consent Flow',
  description:
    'Analyzes the cookie consent banner or CMP. Checks for cookie walls, dark consent patterns, and asymmetric accept/reject design.',
  steps: [
    {
      id: 'banner-analysis',
      instruction:
        'Load the homepage and capture any cookie consent banner. Note the prominence of Accept vs Reject.',
      aiGoal:
        'A cookie consent banner or popup should be visible on page load. Examine it carefully: Is the "Accept All" button bright/prominent while "Reject" or "Manage" is grey/hidden/smaller? Is "Reject All" missing entirely? Note the visual hierarchy. Do NOT click accept. If you see a cookie banner, mark as done — we want to capture its current state.',
      analyzersToRun: [
        'PrivacyAnalyzer',
        'InterfaceManipulationAnalyzer',
        'MisdirectionAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 20,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'reject-path',
      expectsNavigation: true,
      instruction:
        'Click Manage Preferences, Cookie Settings, or the reject/opt-out path in the cookie banner.',
      aiGoal:
        'In the cookie consent banner or popup, find and click "Manage Preferences", "Manage Cookies", "Cookie Settings", "Customize", "More Options", or "Reject" (if available). The goal is to reach the cookie preference center. Count how many clicks it takes compared to accepting — that difference is the dark pattern.',
      clickText: [
        'manage preferences',
        'manage cookies',
        'cookie settings',
        'customize',
        'more options',
        'preferences',
        'settings',
        'reject all',
      ],
      analyzersToRun: [
        'PrivacyAnalyzer',
        'ObstructionAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: true,
      screenshotAfter: true,
    },
    {
      id: 'consent-settings',
      instruction:
        'On the cookie preferences page, check for pre-selected non-essential categories and confusing toggle labels.',
      aiGoal:
        'You are now on the cookie preferences/settings page. Examine: Are any non-essential cookie categories (Analytics, Marketing, Targeting, Advertising) pre-selected or turned ON by default? Is "Reject All" available on this page? Are the toggle labels confusing ("Allow" means consent, or "Block"?) Scroll to see all categories. Do NOT change any settings. Mark as done after reviewing.',
      analyzersToRun: [
        'PrivacyAnalyzer',
        'PreselectionAnalyzer',
        'InterfaceManipulationAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: true,
      screenshotAfter: true,
    },
  ],
}

export const PRICING_WORKFLOW: ScanWorkflow = {
  id: 'pricing',
  name: 'Pricing Comparison Flow',
  description:
    'Navigates to the pricing page and analyzes plan structures for comparison prevention, information hiding, biased highlighting, and hidden fees.',
  steps: [
    {
      id: 'find-pricing',
      expectsNavigation: true,
      instruction: 'Navigate to the pricing, plans, or upgrade page.',
      aiGoal:
        'Find and click on "Pricing", "Plans", "Upgrade", "Premium", "Subscribe", or "Membership" in the site navigation (usually in the header or footer). You should reach a page that shows different subscription tiers or pricing plans. If the site has no explicit pricing page but has a "Pro" or "Business" option, navigate there.',
      clickText: [
        'pricing',
        'plans',
        'upgrade',
        'premium',
        'subscribe',
        'membership',
      ],
      analyzersToRun: [
        'ComparisonPreventionAnalyzer',
        'InterfaceManipulationAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'plan-comparison',
      instruction:
        'Review the plan comparison table. Check for artificially highlighted "Best Value" or "Most Popular" plans and missing feature comparisons.',
      aiGoal:
        'You are on the pricing/plans page. Scroll down to see all pricing tiers. Look for: (1) Is one plan artificially highlighted as "Recommended", "Most Popular", or "Best Value" even though it costs the most? (2) Are features shown consistently across all plans or is the comparison table hard to read? (3) Are annual vs monthly prices shown in a way that makes annual seem cheaper by showing the monthly-equivalent cost? (4) Is enterprise pricing hidden behind "Contact Sales"? Scroll to the bottom and mark done.',
      analyzersToRun: [
        'ComparisonPreventionAnalyzer',
        'InterfaceManipulationAnalyzer',
        'SneakingAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'select-plan',
      expectsNavigation: true,
      clickText: [
        'get started',
        'choose',
        'select plan',
        'subscribe',
        'buy now',
        'upgrade',
      ],
      instruction:
        'Click on the most expensive plan and observe what happens — extra charges, confusing terms.',
      aiGoal:
        'Click on the most expensive or "Premium"/"Business"/"Enterprise" plan button. Observe what happens: Does the page show a checkout flow with additional fees not mentioned on the pricing page? Does clicking "Get Started" require creating an account first (forced registration)? Note any price discrepancies between the pricing page and the checkout page. Mark done after the first post-click screen.',
      analyzersToRun: [
        'ComparisonPreventionAnalyzer',
        'SneakingAnalyzer',
        'ForcedActionAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 25,
      screenshotBefore: false,
      screenshotAfter: true,
    },
  ],
}

/**
 * Comprehensive workflow: full end-to-end audit that handles cookie banners,
 * clears interfering modals, registers with fake credentials, then traces
 * the complete shopping journey from search through checkout.
 *
 * aiGoal strings may contain {{placeholder}} variables (firstName, lastName,
 * email, password, phone, address, city, state, zip) that the engine resolves
 * at runtime using a generated fake profile.
 */
export const COMPREHENSIVE_WORKFLOW: ScanWorkflow = {
  id: 'comprehensive',
  name: 'Comprehensive Dark Pattern Audit',
  description:
    'Full end-to-end audit: documents cookie consent design, clears interfering popups, registers with fake credentials, then traces the complete shopping journey (search → product → cart → checkout). Captures dark patterns at every stage.',
  steps: [
    {
      id: 'cookie-banner',
      instruction:
        'Observe and document the cookie consent banner design before dismissal — note Accept vs Reject prominence.',
      aiGoal:
        'A cookie consent banner may be visible. Examine it: Is "Accept All" prominently styled while "Reject All" or "Manage" is greyed out, small, or missing entirely? Is there a cookie wall requiring acceptance to proceed? If the banner is already dismissed, scroll the page to confirm the main content is accessible. Mark done after observing.',
      analyzersToRun: [
        'PrivacyAnalyzer',
        'InterfaceManipulationAnalyzer',
        'MisdirectionAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 15,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'modal-clearance',
      instruction:
        'Identify and close any remaining popups, newsletter prompts, location requests, or overlay interruptions.',
      aiGoal:
        'Look for modal dialogs, popups, or overlays that are NOT cookie banners — such as newsletter signup prompts, location permission requests, age verification gates, push notification prompts, or welcome messages. If any are visible, click the close (×) button or "No thanks" / "Not now" option. If nothing is blocking the page, mark as done.',
      analyzersToRun: [
        'NaggingAnalyzer',
        'ForcedActionAnalyzer',
        'ObstructionAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 20,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'signup-form',
      expectsNavigation: true,
      instruction:
        'Find the signup or registration page and fill in the form using generated fake test credentials.',
      aiGoal:
        'Find and click "Sign Up", "Register", "Create Account", "Join", or "Get started". On the registration form, fill in required fields using these test credentials — First name: {{firstName}}, Last name: {{lastName}}, Email: {{email}}, Password: {{password}}, Phone (if asked): {{phone}}. For any other required fields (date of birth, username, address), use realistic fake values. Do NOT check any marketing consent checkboxes — leave them unchecked. After filling all required fields, submit the form by clicking "Create Account", "Sign Up", or equivalent. If a CAPTCHA, SMS verification, or email confirmation gate appears, stop and mark done — that is the friction point we are documenting.',
      analyzersToRun: [
        'ForcedActionAnalyzer',
        'PreselectionAnalyzer',
        'PrivacyAnalyzer',
        'MisdirectionAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 60,
      screenshotBefore: true,
      screenshotAfter: true,
    },
    {
      id: 'post-signup',
      instruction:
        'Handle post-registration screens — onboarding flows, email prompts, upsell offers, or forced app installs.',
      aiGoal:
        'After signup you may land on: an onboarding wizard (skip optional steps), a "verify your email" screen (mark done — note as friction), an upsell or upgrade prompt (note it as a dark pattern if it is the very first post-signup screen), or the main dashboard. Skip any optional onboarding steps. If an upgrade/premium prompt blocks the page, note it and mark done.',
      analyzersToRun: [
        'NaggingAnalyzer',
        'ForcedActionAnalyzer',
        'SneakingAnalyzer',
        'UrgencyScarcityAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'search-product',
      expectsNavigation: true,
      fillSearch: 'shirt',
      instruction:
        "Use the site's main search or browse to find a relevant product or service.",
      aiGoal:
        'Use the site\'s search or main navigation to find a product, service, flight, or hotel. For travel sites: search for a round-trip flight from Seattle to New York or a hotel in New York for 2 nights next week. For e-commerce: search for "shirt" or a popular product. Navigate to a product results or detail page — do not stay on the homepage.',
      analyzersToRun: [
        'UrgencyScarcityAnalyzer',
        'MisdirectionAnalyzer',
        'SneakingAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 45,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'select-product',
      expectsNavigation: true,
      clickFirst: true,
      instruction:
        'Select the first or cheapest result and open its detail page.',
      aiGoal:
        'From the search results or listing page, click the first or cheapest available option to open its detail page. For flights: select the cheapest flight. For hotels: click the first property. For e-commerce: click the first product result.',
      analyzersToRun: [
        'UrgencyScarcityAnalyzer',
        'MisdirectionAnalyzer',
        'SneakingAnalyzer',
        'InterfaceManipulationAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'add-to-cart',
      expectsNavigation: true,
      clickText: [
        'add to cart',
        'add to bag',
        'add to basket',
        'buy now',
        'select',
      ],
      instruction:
        'Add the product to the cart and document any pre-added extras, insurance, or automatic add-ons.',
      aiGoal:
        'Click "Add to Cart", "Add to Bag", "Book", "Reserve", or the primary call-to-action button on the product page. Note any pre-selected add-ons, insurance, or extras that appear. After clicking you should be on a cart page or the next booking step.',
      analyzersToRun: [
        'SneakingAnalyzer',
        'PreselectionAnalyzer',
        'UrgencyScarcityAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'cart-review',
      expectsNavigation: true,
      clickText: ['cart', 'basket', 'bag', 'view cart', 'your trip'],
      instruction:
        'Review the cart or order summary for unexpected items, hidden fees, or price changes from the product page.',
      aiGoal:
        'Navigate to the cart, bag, or booking summary. Look for unexpected items, pre-added insurance or extras, or price increases compared to the product page. If already on a cart or summary page, mark done.',
      analyzersToRun: [
        'SneakingAnalyzer',
        'PreselectionAnalyzer',
        'UrgencyScarcityAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: false,
      screenshotAfter: true,
    },
    {
      id: 'checkout',
      expectsNavigation: true,
      clickText: ['proceed to checkout', 'checkout', 'continue', 'book now'],
      instruction:
        'Proceed to checkout and observe all new fees, pre-selected charges, and friction points.',
      aiGoal:
        'Click "Checkout", "Proceed to Checkout", "Continue", or "Book now" from the cart or summary. Observe any hidden fees, pre-selected optional charges, or forced account creation walls that appear. Do NOT enter real personal information or payment details. If you reach a payment entry page or a mandatory login wall, mark done.',
      analyzersToRun: [
        'SneakingAnalyzer',
        'ForcedActionAnalyzer',
        'PreselectionAnalyzer',
        'MisdirectionAnalyzer',
        'VisualAnalyzer',
      ],
      timeout: 30,
      screenshotBefore: true,
      screenshotAfter: true,
    },
  ],
}

// Registry for lookup by workflow ID
export const WORKFLOW_REGISTRY: Record<string, ScanWorkflow> = {
  checkout: CHECKOUT_WORKFLOW,
  cancellation: CANCELLATION_WORKFLOW,
  signup: SIGNUP_WORKFLOW,
  cookie_consent: COOKIE_CONSENT_WORKFLOW,
  pricing: PRICING_WORKFLOW,
  comprehensive: COMPREHENSIVE_WORKFLOW,
}
