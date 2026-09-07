import type { WorkflowStep } from '@trusten/shared/api'

export interface JourneyStepContent {
  title: string
  description: string
  status: 'complete' | 'blocked' | 'pending'
  statusLabel: string
  outcome: string
  pageLabel: string
}

const ACTIONS: Array<[RegExp, string, string]> = [
  [
    /cookie.*(banner|consent)/i,
    'Review cookie choices',
    'Checked whether accepting and refusing were equally easy.',
  ],
  [
    /(manage preferences|cookie settings|reject|opt-out)/i,
    'Find the refuse option',
    'Tried to reach the controls for refusing optional cookies.',
  ],
  [
    /cookie preferences|consent settings/i,
    'Review cookie settings',
    'Checked which optional cookies were already switched on.',
  ],
  [
    /(search|browse).*(product|service|trip)|find.*(product|service)/i,
    'Search the website',
    'Looked for an item, service, or plan to inspect.',
  ],
  [
    /(select|open).*(product|result|flight|hotel)/i,
    'Open an option',
    'Opened one result to see the details shown before choosing.',
  ],
  [
    /(add).*(cart|bag|basket)|initiate.*booking/i,
    'Add an option',
    'Added an option to see whether anything extra appeared.',
  ],
  [
    /(cart|basket|bag|order summary).*(review|present)|review.*(cart|order summary)/i,
    'Review the basket',
    'Compared the basket with the choice made earlier.',
  ],
  [
    /(checkout|proceed).*(fee|charge|option)|proceed to checkout/i,
    'Start checkout',
    'Checked the first checkout screen without buying anything.',
  ],
  [
    /account or profile settings|account settings/i,
    'Open account settings',
    'Looked for the place where an account can be managed.',
  ],
  [
    /(cancel subscription|cancel membership|delete account|manage subscription)/i,
    'Find the way to leave',
    'Looked for a cancellation or account deletion option.',
  ],
  [
    /begin the cancellation/i,
    'Start cancellation',
    'Checked for pressure or needless steps, without confirming cancellation.',
  ],
  [
    /(sign up|register|create account)/i,
    'Open sign-up',
    'Opened the account form without using real personal information.',
  ],
  [
    /inspect the signup form/i,
    'Review the sign-up form',
    'Checked what information and choices the form asked for.',
  ],
  [
    /terms of service|privacy policy/i,
    'Find the terms and privacy details',
    'Checked whether important terms were easy to find.',
  ],
  [
    /(pricing|plans|upgrade) page/i,
    'Open pricing',
    'Looked for the website’s prices and plans.',
  ],
  [
    /plan comparison/i,
    'Compare the plans',
    'Checked whether the plans could be compared fairly.',
  ],
  [
    /most expensive plan/i,
    'Open a plan',
    'Checked what appeared after choosing a plan, without paying.',
  ],
  [
    /close any remaining popups|modal|overlay/i,
    'Clear interruptions',
    'Checked whether pop-ups made the website harder to use.',
  ],
  [
    /post-registration|post-signup|onboarding/i,
    'Review what follows sign-up',
    'Checked for pressure immediately after creating a test account.',
  ],
]

function friendlyAction(
  action: string,
): Pick<JourneyStepContent, 'title' | 'description'> {
  const match = ACTIONS.find(([pattern]) => pattern.test(action))
  if (match) return { title: match[1], description: match[2] }
  return {
    title: 'Review this part of the website',
    description:
      'Checked this page for choices that could be unfair or confusing.',
  }
}

function pageLabel(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    const part = url.pathname.split('/').filter(Boolean).at(-1)
    return part
      ? `${url.hostname} · ${decodeURIComponent(part).replace(/[-_]+/g, ' ')}`
      : url.hostname
  } catch {
    return 'Website page'
  }
}

export function getJourneyStepContent(step: WorkflowStep): JourneyStepContent {
  const action = friendlyAction(step.action)
  const successful =
    step.status === 'reached' ||
    step.status === 'observed' ||
    step.status === undefined
  if (successful) {
    return {
      ...action,
      status: 'complete',
      statusLabel: step.status === 'observed' ? 'Checked here' : 'Completed',
      outcome:
        step.status === 'observed'
          ? 'Trusten checked the current page. Moving to another page was not needed.'
          : 'Trusten reached this part of the website and checked what appeared.',
      pageLabel: pageLabel(step.url),
    }
  }
  if (step.status === 'skipped') {
    return {
      ...action,
      status: 'pending',
      statusLabel: 'Not attempted',
      outcome:
        'An earlier step could not be completed, so Trusten did not try this step.',
      pageLabel: pageLabel(step.url),
    }
  }
  return {
    ...action,
    status: 'blocked',
    statusLabel: 'Couldn’t continue',
    outcome:
      'The website did not let Trusten reach the next part of the journey.',
    pageLabel: pageLabel(step.url),
  }
}

export function completedJourneySteps(steps: WorkflowStep[]): number {
  return steps.filter(
    (step) => getJourneyStepContent(step).status === 'complete',
  ).length
}
