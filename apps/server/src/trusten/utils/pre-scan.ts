/**
 * Trusten Pre-Scan Utilities
 *
 * Runs before every deep scan workflow:
 *   1. Cookie consent banner detection and dismissal
 *   2. Interfering modal/popup detection and dismissal
 *   3. Fake user profile generation + aiGoal template resolution
 */

import { logger } from '../../lib/logger'
import type { BrowserDriver } from '../browser/driver'

export interface FakeProfile {
  firstName: string
  lastName: string
  fullName: string
  email: string
  password: string
  phone: string
  birthYear: number
  address: string
  city: string
  state: string
  zip: string
  country: string
}

const FAKE_NAMES = [
  ['Alex', 'Morgan'],
  ['Jordan', 'Rivera'],
  ['Taylor', 'Chen'],
  ['Casey', 'Patel'],
  ['Sam', 'Williams'],
] as const

/** Generate a consistent fake user profile for signup automation. */
export function generateFakeProfile(): FakeProfile {
  const ts = Date.now()
  const [firstName, lastName] = FAKE_NAMES[ts % FAKE_NAMES.length]
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email: `trusten.test.${ts}@mailinator.com`,
    password: 'TrustenTest@2024!',
    phone: '555-0155',
    birthYear: 1990,
    address: '123 Test Street',
    city: 'San Francisco',
    state: 'CA',
    zip: '94102',
    country: 'US',
  }
}

/**
 * Resolve {{placeholder}} variables in an aiGoal string using a fake profile.
 * Used by the comprehensive workflow to inject fake credentials into signup steps.
 */
export function resolveGoalTemplate(
  goal: string,
  profile: FakeProfile,
): string {
  return goal
    .replace(/\{\{firstName\}\}/g, profile.firstName)
    .replace(/\{\{lastName\}\}/g, profile.lastName)
    .replace(/\{\{fullName\}\}/g, profile.fullName)
    .replace(/\{\{email\}\}/g, profile.email)
    .replace(/\{\{password\}\}/g, profile.password)
    .replace(/\{\{phone\}\}/g, profile.phone)
    .replace(/\{\{address\}\}/g, profile.address)
    .replace(/\{\{city\}\}/g, profile.city)
    .replace(/\{\{state\}\}/g, profile.state)
    .replace(/\{\{zip\}\}/g, profile.zip)
}

/**
 * Attempt to dismiss cookie consent banners.
 * Prefers "Reject All" so we avoid giving blanket consent; falls back to
 * "Accept All" or "Close" if no reject path is available.
 *
 * Returns a status string: 'no-banner' | 'rejected' | 'accepted' | 'closed' | 'found-but-no-button' | 'error'
 */
export async function dismissCookieBanners(
  browser: BrowserDriver,
  pageId: number,
): Promise<string> {
  const script = `(function() {
    const rejectTexts = [
      'reject all', 'reject cookies', 'decline all', 'decline cookies',
      'no thanks', 'deny all', 'deny', 'refuse all', 'disagree',
      'nur notwendige', 'ablehnen', 'tout refuser', 'refuser',
    ];
    const acceptTexts = [
      'accept all', 'accept all cookies', 'allow all', 'allow cookies',
      'i accept', 'got it', 'ok', 'agree', 'i agree', 'okay',
      'alle akzeptieren', 'tout accepter',
    ];
    const closeTexts = ['close', '×', '✕', '✖', 'x', 'dismiss'];

    const bannerSelectors = [
      '[id*="cookie" i]', '[id*="consent" i]', '[id*="gdpr" i]',
      '[id*="cmp" i]', '[id*="onetrust" i]', '[id*="cookielaw" i]',
      '[class*="cookie-banner" i]', '[class*="cookie-consent" i]',
      '[class*="consent-banner" i]', '[class*="gdpr-banner" i]',
      '[class*="cmp" i]', '[class*="onetrust" i]', '[class*="cookielaw" i]',
      '[class*="cc-window" i]', '#cookie-notice', '#consent-notice',
      '#cookie-law-info-bar', '#cookiebanner', '#CookieConsent',
    ];

    function isVisible(el) {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    function findBtn(texts) {
      const candidates = [...document.querySelectorAll(
        'button, a[role="button"], [role="button"], input[type="button"], input[type="submit"]'
      )].filter(isVisible);
      for (const text of texts) {
        const match = candidates.find(el =>
          el.textContent?.trim().toLowerCase().includes(text)
        );
        if (match) return match;
      }
      return null;
    }

    let bannerFound = false;
    for (const sel of bannerSelectors) {
      try {
        if ([...document.querySelectorAll(sel)].some(isVisible)) {
          bannerFound = true;
          break;
        }
      } catch {}
    }

    if (!bannerFound) {
      bannerFound = [...document.querySelectorAll('*')].some(el => {
        if (!isVisible(el)) return false;
        const s = window.getComputedStyle(el);
        return (s.position === 'fixed' || s.position === 'sticky') &&
               /cookie|consent|gdpr|privacy/i.test(el.textContent || '');
      });
    }

    if (!bannerFound) return 'no-banner';

    const reject = findBtn(rejectTexts);
    if (reject) { reject.click(); return 'rejected'; }

    const accept = findBtn(acceptTexts);
    if (accept) { accept.click(); return 'accepted'; }

    const close = findBtn(closeTexts);
    if (close) { close.click(); return 'closed'; }

    return 'found-but-no-button';
  })()`

  try {
    const res = await browser.evaluate(pageId, script)
    const status = String(res.value ?? 'error')
    logger.info('Trusten pre-scan: cookie banner', { status })
    return status
  } catch (err) {
    logger.warn('Trusten pre-scan: cookie banner check failed', {
      error: String(err),
    })
    return 'error'
  }
}

/**
 * Attempt to dismiss non-cookie interfering modals: newsletter prompts,
 * push notification requests, age gates, welcome overlays, etc.
 *
 * First presses Escape (handles most dialogs), then tries close buttons.
 * Returns the number of modals dismissed.
 */
export async function dismissInterferingModals(
  browser: BrowserDriver,
  pageId: number,
): Promise<number> {
  try {
    await browser.pressKey(pageId, 'Escape')
    await new Promise<void>((r) => setTimeout(r, 400))
  } catch {}

  const script = `(function() {
    const closeTexts = [
      '×', '✕', '✖', 'close', 'dismiss', 'no thanks', 'not now',
      'skip', 'later', 'maybe later', 'no, thanks', 'skip for now',
      'continue without', 'no thank you',
    ];
    const modalSelectors = [
      '[role="dialog"]',
      '[role="alertdialog"]',
      '[class*="modal" i]:not([class*="cookie" i]):not([class*="consent" i])',
      '[id*="modal" i]:not([id*="cookie" i]):not([id*="consent" i])',
      '[class*="popup" i]:not([class*="cookie" i]):not([class*="consent" i])',
      '[class*="overlay" i]:not([class*="cookie" i]):not([class*="consent" i])',
      '[class*="lightbox" i]',
      '[class*="newsletter" i]',
      '[class*="interstitial" i]',
    ];

    function isVisible(el) {
      const r = el.getBoundingClientRect();
      return r.width > 10 && r.height > 10;
    }

    let dismissed = 0;
    for (const sel of modalSelectors) {
      try {
        for (const modal of [...document.querySelectorAll(sel)].filter(isVisible)) {
          const btns = [...modal.querySelectorAll('button, [role="button"], a')].filter(isVisible);
          for (const text of closeTexts) {
            const btn = btns.find(b =>
              b.textContent?.trim().toLowerCase().includes(text) ||
              b.getAttribute('aria-label')?.toLowerCase().includes(text)
            );
            if (btn) { btn.click(); dismissed++; break; }
          }
          const aria = modal.querySelector('[aria-label="close" i], [aria-label="dismiss" i], [title="close" i]');
          if (aria && isVisible(aria)) { (aria as HTMLElement).click(); dismissed++; }
        }
      } catch {}
    }
    return dismissed;
  })()`

  try {
    const res = await browser.evaluate(pageId, script)
    const count = typeof res.value === 'number' ? res.value : 0
    if (count > 0) logger.info('Trusten pre-scan: dismissed modals', { count })
    return count
  } catch (err) {
    logger.warn('Trusten pre-scan: modal dismissal failed', {
      error: String(err),
    })
    return 0
  }
}
