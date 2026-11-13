/**
 * The guided demo tour: which page each step is on, what it says, and which
 * part of the page it points at.
 *
 * Steps that show a result use saved checks picked from the public library,
 * so the tour never waits on a live check in front of an audience.
 */
import type { ScanHistoryRow } from '@trusten/shared/api'

/** A fixed path, or a saved result picked when the tour starts. */
export type TourPlace = `/${string}` | 'example' | 'journey'

export interface TourStep {
  id: string
  place: TourPlace
  title: string
  body: string
  /** CSS selector for the part of the page this step points at. */
  target?: string
}

export interface TourPicks {
  /** A saved one-page check with findings. */
  example?: string
  /** A saved full check that followed a journey. */
  journey?: string
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    place: '/',
    title: 'Welcome to Trusten',
    body: 'Trusten checks websites for design tricks that rush, confuse, or pressure people: fake countdowns, fees that appear late, pre-ticked boxes. This tour follows Alex, who is about to buy sneakers online.',
    target: '.home-hero h1',
  },
  {
    id: 'quick-check',
    place: '/',
    title: '1. Alex checks the shop',
    body: 'Type any website address. Trusten opens the page in a real browser, reads its words and a screenshot, and grades it in about a minute. No account needed.',
    target: '.quick-check',
  },
  {
    id: 'tricks',
    place: '/',
    title: 'What Trusten looks for',
    body: 'Around 25 kinds of trick, explained in everyday words: pressure to decide quickly, costs shown late, a hidden way to say no, and subscriptions that are hard to cancel.',
    target: '#common-tricks',
  },
  {
    id: 'result',
    place: 'example',
    title: '2. Alex reads the result',
    body: 'Each check gets a grade from A to F and a count of concerns. When Trusten could not see everything, it says so instead of giving a grade it cannot back up.',
    target: '.report-summary',
  },
  {
    id: 'evidence',
    place: 'example',
    title: 'Every concern comes with proof',
    body: 'Open a concern to see what it means, what you can do about it, and a screenshot with the exact part of the page outlined.',
    target: '[aria-labelledby="findings-heading"]',
  },
  {
    id: 'library',
    place: '/explore',
    title: '3. Alex compares other shops',
    body: 'Public checks are saved in the evidence library. Search for a website or filter by grade to see how shops compare.',
    target: '.filter-panel',
  },
  {
    id: 'full-check',
    place: '/audit',
    title: '4. A deeper look, all the way to checkout',
    body: 'Some tricks only appear near the end, like fees added in the cart. A full check follows the pages a shopper would visit and records what it finds on each. It takes a few minutes, and you can watch it live.',
    target: '.audit-form',
  },
  {
    id: 'journey',
    place: 'journey',
    title: 'Every page of the journey',
    body: 'A full check shows each page it reached, what it found there, and where the website stopped it.',
    target: '[aria-labelledby="journey-heading"]',
  },
  {
    id: 'extension',
    place: '/extension',
    title: '5. Checking the page you are on',
    body: 'Some pages need you to be signed in, or block automated visitors. The Chrome extension checks the page in your own browser and outlines each trick right on the page.',
    target: 'a[href="/extension/download"]',
  },
  {
    id: 'practice',
    place: '/demo/shop',
    title: 'Try it on the practice shop',
    body: 'This made-up shop uses tricks on purpose. With the extension installed, click the Trusten icon, choose “Check this page”, then “Highlight these choices”.',
    target: '#sale-banner',
  },
  {
    id: 'done',
    place: '/demo',
    title: 'That is Trusten',
    body: 'You have seen quick checks, results with evidence, the library, full journey checks, and the extension. Pick any feature on this page to try it for real.',
    target: '#demo-features',
  },
]

const PRACTICE_PATH = '/demo/shop'

function isPractice(scan: ScanHistoryRow): boolean {
  try {
    return new URL(scan.url).pathname.startsWith(PRACTICE_PATH)
  } catch {
    return false
  }
}

function newestFirst(a: ScanHistoryRow, b: ScanHistoryRow): number {
  return b.completedAt.localeCompare(a.completedAt)
}

/**
 * The best saved one-page result to show: complete coverage over partial,
 * at least one finding, real websites over the practice shop, newest first.
 */
export function pickExample(
  scans: readonly ScanHistoryRow[],
): string | undefined {
  const usable = scans.filter(
    (scan) =>
      scan.coverageScope !== 'journey' &&
      scan.patternCount > 0 &&
      (scan.coverage === 'complete' || scan.coverage === 'partial'),
  )
  const rank = (scan: ScanHistoryRow) =>
    (scan.coverage === 'complete' ? 0 : 2) + (isPractice(scan) ? 1 : 0)
  return [...usable].sort((a, b) => rank(a) - rank(b) || newestFirst(a, b))[0]
    ?.id
}

/** The best saved full check: one with findings first, then the newest. */
export function pickJourney(
  scans: readonly ScanHistoryRow[],
): string | undefined {
  const journeys = scans.filter(
    (scan) =>
      scan.coverageScope === 'journey' &&
      scan.coverage !== 'missing' &&
      scan.coverage !== 'blocked',
  )
  const rank = (scan: ScanHistoryRow) => (scan.patternCount > 0 ? 0 : 1)
  return [...journeys].sort((a, b) => rank(a) - rank(b) || newestFirst(a, b))[0]
    ?.id
}

/** The steps this tour can show: a step whose saved result is missing is left out. */
export function tourSteps(picks: TourPicks): TourStep[] {
  return TOUR_STEPS.filter(
    (step) =>
      (step.place !== 'example' || picks.example) &&
      (step.place !== 'journey' || picks.journey),
  )
}

export function stepPath(step: TourStep, picks: TourPicks): string {
  if (step.place === 'example')
    return `/scan/${encodeURIComponent(picks.example ?? '')}`
  if (step.place === 'journey')
    return `/scan/${encodeURIComponent(picks.journey ?? '')}`
  return step.place
}

export function isOnStepPage(
  pathname: string,
  step: TourStep,
  picks: TourPicks,
): boolean {
  const path = stepPath(step, picks)
  return pathname === path || pathname === `${path}/`
}
