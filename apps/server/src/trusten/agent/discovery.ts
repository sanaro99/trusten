/**
 * Trusten — Agentic workflow discovery (TestSprite-style)
 *
 * Instead of only running a fixed library of workflows, explore the target site
 * (nav, buttons, forms, copy) and ask an LLM to plan the dark-pattern-prone user
 * journeys that actually exist on THIS site. Each journey becomes a ScanWorkflow
 * whose steps the existing AI navigator (navigateWithAI) executes.
 *
 * Falls back to safe destinations observed on this site when the LLM is
 * unavailable, so a Deep Scan remains relevant without a configured model.
 */

import { logger } from '../../lib/logger'
import { ANALYZER_NAMES } from '../analyzers/registry'
import type { BrowserDriver } from '../browser/driver'
import { getTrustenLLM } from '../llm/client'
import type { ScanWorkflow, WorkflowStepDefinition } from '../types'
import { sleep } from '../utils/delay'
import {
  dismissCookieBanners,
  dismissInterferingModals,
} from '../utils/pre-scan'
import {
  CHECKOUT_WORKFLOW,
  COOKIE_CONSENT_WORKFLOW,
} from '../workflows/definitions'

const DEFAULT_ANALYZERS = [
  'UrgencyScarcityAnalyzer',
  'MisdirectionAnalyzer',
  'SneakingAnalyzer',
  'PreselectionAnalyzer',
  'PrivacyAnalyzer',
  'VisualAnalyzer',
]

interface SiteMap {
  url?: string
  title: string
  links: Array<{ t: string; h: string }>
  buttons: string[]
  forms: Array<{ action: string; method: string; fields: string[] }>
  consentControls?: string[]
  text: string
}

const GATHER_SCRIPT = `(function(){
  try {
    const links = [...document.querySelectorAll('a[href]')]
      .filter(a => a.getClientRects().length > 0)
      .map(a => ({ t: (a.textContent||a.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim().slice(0,80), h: a.getAttribute('href')||'' }))
      .filter(x => x.t).slice(0,120);
    const buttons = [...document.querySelectorAll('button, [role="button"], a.btn, input[type="submit"]')]
      .map(b => (b.textContent||b.value||'').replace(/\\s+/g,' ').trim()).filter(Boolean).slice(0,40);
    const forms = [...document.querySelectorAll('form')].map(f => ({
      action: f.getAttribute('action')||'',
      method: (f.getAttribute('method')||'get').toLowerCase(),
      fields: [...f.querySelectorAll('input,select,textarea')].map(i => i.getAttribute('name')||i.getAttribute('type')||'').filter(Boolean).slice(0,12)
    })).slice(0,8);
    const consentControls = [...document.querySelectorAll('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i]')]
      .filter(b => b.getClientRects().length > 0 && /cookie|consent|privacy/i.test(b.textContent||''))
      .flatMap(b => [...b.querySelectorAll('button, a, [role="button"]')])
      .filter(b => b.getClientRects().length > 0)
      .map(b => (b.textContent||b.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim()).filter(Boolean).slice(0,20);
    return JSON.stringify({ url: location.href, title: document.title||'', links, buttons, forms, consentControls, text: (document.body?document.body.innerText:'').replace(/\\s+/g,' ').slice(0,1500) });
  } catch(e){ return '{}'; }
})()`

async function gatherSiteMap(
  driver: BrowserDriver,
  pageId: number,
): Promise<SiteMap> {
  const res = await driver.evaluate(pageId, GATHER_SCRIPT)
  try {
    const v = typeof res.value === 'string' ? JSON.parse(res.value) : {}
    return {
      url: typeof v.url === 'string' ? v.url : undefined,
      title: typeof v.title === 'string' ? v.title : '',
      links: Array.isArray(v.links)
        ? v.links.filter(
            (l: SiteMap['links'][number]) =>
              l && typeof l.t === 'string' && typeof l.h === 'string',
          )
        : [],
      buttons: Array.isArray(v.buttons)
        ? v.buttons.filter((b: unknown) => typeof b === 'string')
        : [],
      forms: Array.isArray(v.forms)
        ? v.forms
            .filter(
              (f: SiteMap['forms'][number]) =>
                f && typeof f.action === 'string' && Array.isArray(f.fields),
            )
            .map((f: SiteMap['forms'][number]) => ({
              ...f,
              method:
                typeof f.method === 'string' ? f.method.toLowerCase() : 'get',
              fields: f.fields.filter((field) => typeof field === 'string'),
            }))
        : [],
      consentControls: Array.isArray(v.consentControls)
        ? v.consentControls.filter(
            (value: unknown) => typeof value === 'string',
          )
        : [],
      text: typeof v.text === 'string' ? v.text : '',
    }
  } catch {
    return { title: '', links: [], buttons: [], forms: [], text: '' }
  }
}

const SYSTEM_PROMPT = `You are a consumer-protection QA planner (like TestSprite, but for dark patterns).
Given a website's site map, identify the 3-5 most relevant user journeys where manipulative
"dark patterns" are likely, and output a concrete test plan for each.

Dark-pattern families to probe: fake urgency/scarcity/social-proof, confirmshaming, trick wording,
basket sneaking, drip pricing, bait & switch, roach motel / hard-to-cancel / forced continuity,
forced registration/sharing, preselected opt-ins, nagging, comparison prevention, information hiding,
privacy zuckering / cookie walls / dark consent, fake visual hierarchy.

Return ONLY valid JSON of this shape (no prose):
{
  "workflows": [
    {
      "id": "kebab-case-id",
      "name": "Short title",
      "description": "what this journey probes",
      "steps": [
        { "aiGoal": "natural-language instruction the browser agent will follow", "expectsNavigation": true, "navigate": "/actual-observed-link", "analyzersToRun": ["UrgencyScarcityAnalyzer", ...], "timeout": 40 }
      ]
    }
  ]
}

Valid analyzer names: ${ANALYZER_NAMES.join(', ')}.
Rules: 1-5 steps per workflow. aiGoal must be specific to this site.
Set expectsNavigation=true when a step must open a page, click a control, or change the page state.
Set expectsNavigation=false ONLY when inspecting evidence already visible on the current page.
For a linked destination, include navigate with its actual observed URL; omit it for other interactions.
Never invent URLs. Prefer journeys supported by the site's links/buttons/forms.
Collect evidence only: never submit registration, cancellation, purchases, payment, personal data,
or changes to an account. Inspect those forms and stop before submitting. Use only public browsing
and safe search queries; do not log in or create accounts.`

function coerceStep(
  raw: unknown,
  stepNumber: number,
  url: string,
  observedUrls: Set<string>,
): WorkflowStepDefinition | null {
  if (!raw || typeof raw !== 'object') return null
  const step = raw as Record<string, unknown>
  const aiGoal = typeof step.aiGoal === 'string' ? step.aiGoal.trim() : ''
  if (!aiGoal) return null
  const expectsNavigation = step.expectsNavigation !== false
  const destination =
    typeof step.navigate === 'string'
      ? safeDestination(step.navigate, url)
      : null
  const analyzers = Array.isArray(step.analyzersToRun)
    ? step.analyzersToRun.filter(
        (a): a is string => typeof a === 'string' && ANALYZER_NAMES.includes(a),
      )
    : []
  return {
    id: `step-${stepNumber}`,
    instruction: aiGoal.slice(0, 200),
    aiGoal,
    expectsNavigation,
    ...(expectsNavigation && destination && observedUrls.has(destination)
      ? { navigate: destination }
      : {}),
    analyzersToRun: analyzers.length > 0 ? analyzers : DEFAULT_ANALYZERS,
    timeout:
      typeof step.timeout === 'number' && Number.isFinite(step.timeout)
        ? Math.min(90, Math.max(10, step.timeout))
        : 40,
    screenshotBefore: false,
    screenshotAfter: true,
  }
}

function coerceWorkflows(
  raw: string,
  url: string,
  map: SiteMap,
): ScanWorkflow[] {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return []
  }
  const list = (parsed as { workflows?: unknown[] })?.workflows
  if (!Array.isArray(list)) return []

  const out: ScanWorkflow[] = []
  const baseUrl = map.url || url
  const observedUrls = new Set(siteDestinations(url, map).map((d) => d.url))
  for (let i = 0; i < list.length && out.length < 6; i++) {
    const w = list[i] as Record<string, unknown>
    if (!w || typeof w !== 'object') continue
    const steps = Array.isArray(w.steps) ? w.steps : []
    const wfSteps: WorkflowStepDefinition[] = []
    for (let j = 0; j < steps.length && wfSteps.length < 8; j++) {
      const step = coerceStep(steps[j], j + 1, baseUrl, observedUrls)
      if (step) wfSteps.push(step)
    }
    if (wfSteps.length === 0) continue
    const id =
      typeof w.id === 'string' && w.id
        ? w.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
        : `discovered-${out.length + 1}`
    out.push({
      id,
      name: typeof w.name === 'string' ? w.name : id,
      description: typeof w.description === 'string' ? w.description : '',
      steps: wfSteps,
    })
  }
  return out
}

/** Public page visits only: reject protocols, other sites, and action endpoints. */
function safeDestination(href: string, baseUrl: string): string | null {
  if (!href.trim() || (href.startsWith('#') && !/^#!?\//.test(href)))
    return null
  try {
    const base = new URL(baseUrl)
    const target = new URL(href, base)
    if (
      !['http:', 'https:'].includes(target.protocol) ||
      target.origin !== base.origin ||
      target.username ||
      target.password
    )
      return null
    if (
      target.pathname === base.pathname &&
      target.search === base.search &&
      target.hash &&
      !/^#!?\//.test(target.hash)
    )
      return null
    const path = decodeURIComponent(
      `${target.pathname}${target.hash}`,
    ).toLowerCase()
    if (
      /(?:^|[/#_-])(?:logout|signout|log-out|sign-out|delete|remove|unsubscribe|cancel|cancel-subscription|confirm|submit|place-order|complete-order|payment)(?:$|[/#_-])/.test(
        path,
      )
    )
      return null
    for (const [key, value] of target.searchParams) {
      if (
        /^(?:delete|remove|cancel|logout|unsubscribe|submit|confirm|pay|purchase)$/i.test(
          key,
        )
      )
        return null
      if (
        /^(?:action|do|command|operation)$/i.test(key) &&
        /delete|remove|cancel|logout|unsubscribe|submit|pay|purchase/i.test(
          value,
        )
      )
        return null
    }
    if (target.href === base.href) return null
    return target.href
  } catch {
    return null
  }
}

function siteDestinations(
  url: string,
  map: SiteMap,
): Array<{ label: string; url: string }> {
  const destinations: Array<{ label: string; url: string }> = []
  const baseUrl = map.url || url
  const seen = new Set<string>()
  for (const link of map.links) {
    const destination = safeDestination(link.h, baseUrl)
    if (destination && !seen.has(destination)) {
      seen.add(destination)
      destinations.push({ label: link.t, url: destination })
    }
  }
  for (const form of map.forms) {
    if (form.method !== 'get') continue
    const field = form.fields.find((name) =>
      /^(q|query|search|keyword|term)$/i.test(name),
    )
    if (!field) continue
    // Only a search form's GET query is submitted; never account or payment forms.
    try {
      const searchUrl = new URL(form.action || baseUrl, baseUrl)
      if (
        /register|signup|login|checkout|account|payment/i.test(
          searchUrl.pathname,
        )
      )
        continue
      searchUrl.searchParams.set(field, 'test')
      const target = safeDestination(searchUrl.href, baseUrl)
      if (target && !seen.has(target)) {
        seen.add(target)
        destinations.push({ label: 'Search results', url: target })
      }
    } catch {
      // A malformed form action must not discard other observed destinations.
    }
  }
  return destinations
}

function retailJourney(
  destinations: Array<{ label: string; url: string }>,
  map: SiteMap,
): ScanWorkflow | null {
  const pageSignals = [
    ...map.links.map((link) => `${link.t} ${link.h}`),
    ...map.buttons,
  ].join(' ')
  if (!/\b(?:cart|basket|bag|shop|store)\b/i.test(pageSignals)) return null
  const detail = destinations.find((destination) =>
    /\/(?:products?|item|p|dp)\/[^/?#]+|\/(?:product|item)(?:[?#]|$)/i.test(
      new URL(destination.url).pathname,
    ),
  )
  const catalog = destinations.find((destination) =>
    /\b(?:shop|catalog|products|collection|category)\b/i.test(
      `${destination.label} ${new URL(destination.url).pathname}`,
    ),
  )
  const entry =
    detail ||
    catalog ||
    destinations.find((destination) => destination.label === 'Search results')
  if (!entry) return null
  const cart = destinations.find((destination) =>
    /\b(?:cart|basket|bag)\b/i.test(
      `${destination.label} ${new URL(destination.url).pathname}`,
    ),
  )
  const checkout = destinations.find((destination) =>
    /\bcheckout\b/i.test(
      `${destination.label} ${new URL(destination.url).pathname}`,
    ),
  )
  const steps = CHECKOUT_WORKFLOW.steps
    .filter((step) => !(detail && step.id === 'select-product'))
    .map((step) => {
      if (step.id === 'find-product')
        return {
          ...step,
          navigate: entry.url,
          fillSearch: undefined,
          aiGoal: undefined,
          instruction: `Open the observed ${entry.label} page.`,
          expectsNavigation: true,
        }
      if (step.id === 'add-to-cart')
        return {
          ...step,
          clickText: ['add to cart', 'add to bag', 'add to basket'],
          aiGoal:
            'Add this product to the cart using Add to Cart, Add to Bag, or Add to Basket. Do not purchase, book, reserve, submit personal data, or confirm an order.',
        }
      if (step.id === 'cart-review' && cart)
        return { ...step, navigate: cart.url }
      if (step.id === 'checkout-start')
        return {
          ...step,
          ...(checkout ? { navigate: checkout.url } : {}),
          clickText: ['proceed to checkout', 'checkout'],
          aiGoal:
            'Open the first checkout page from the cart to inspect fees and defaults. Stop at account, personal information, or payment forms. Do not fill or submit them, place an order, or book anything.',
        }
      return { ...step }
    })
  return {
    ...CHECKOUT_WORKFLOW,
    description:
      'Follow an observed product or catalog through cart and the first checkout page, stopping before account or payment submission.',
    steps,
  }
}

function consentJourney(map: SiteMap): ScanWorkflow | null {
  const controls = [...new Set(map.consentControls || [])].filter((label) =>
    /manage (?:preferences|cookies)|cookie settings|customize|more options/i.test(
      label,
    ),
  )
  if (controls.length === 0) return null
  return {
    ...COOKIE_CONSENT_WORKFLOW,
    steps: COOKIE_CONSENT_WORKFLOW.steps.map((step) =>
      step.id === 'reject-path'
        ? { ...step, clickText: controls }
        : { ...step },
    ),
  }
}

function siteFallback(url: string, map: SiteMap): ScanWorkflow[] {
  const workflows: ScanWorkflow[] = [
    {
      id: 'site-overview',
      name: 'Page and consent review',
      description:
        'Inspect visible offers, wording, consent, and defaults on the starting page.',
      steps: [
        {
          id: 'observe',
          instruction:
            'Inspect the current page for manipulative design and defaults.',
          expectsNavigation: false,
          analyzersToRun: DEFAULT_ANALYZERS,
          timeout: 40,
          screenshotBefore: false,
          screenshotAfter: true,
        },
      ],
    },
  ]
  const priority = (destination: { label: string; url: string }) =>
    /pricing|plans?|product|shop|cart|checkout|signup|sign.up|register|privacy|terms|cancel|help|search/i.test(
      `${destination.label} ${destination.url}`,
    )
      ? 0
      : 1
  const destinations = siteDestinations(url, map).sort(
    (a, b) => priority(a) - priority(b),
  )
  const consent = consentJourney(map)
  const retail = retailJourney(destinations, map)
  if (consent) workflows.push(consent)
  if (retail) workflows.push(retail)
  const journeyDestinations = new Set(
    retail?.steps.map((step) => step.navigate).filter(Boolean),
  )
  for (const [index, destination] of destinations
    .filter((destination) => !journeyDestinations.has(destination.url))
    .entries()) {
    if (workflows.length >= 6) break
    workflows.push({
      id: `site-destination-${index + 1}`,
      name: `Review ${destination.label}`,
      description:
        'Visit an observed public destination and collect evidence without submitting account or payment forms.',
      steps: [
        {
          id: 'visit',
          instruction: `Open ${destination.label} and inspect the page.`,
          navigate: destination.url,
          expectsNavigation: true,
          analyzersToRun: DEFAULT_ANALYZERS,
          timeout: 40,
          screenshotBefore: false,
          screenshotAfter: true,
        },
      ],
    })
  }
  return workflows
}

export async function discoverWorkflows(
  driver: BrowserDriver,
  url: string,
): Promise<ScanWorkflow[]> {
  let pageId: number | null = null
  let map: SiteMap = { title: '', links: [], buttons: [], forms: [], text: '' }
  try {
    pageId = await driver.newPage(url, { background: true })
    await sleep(1500)
    const initialMap = await gatherSiteMap(driver, pageId)
    await dismissCookieBanners(driver, pageId).catch(() => undefined)
    await dismissInterferingModals(driver, pageId).catch(() => undefined)
    const afterDismissal = await gatherSiteMap(driver, pageId)
    map = {
      ...afterDismissal,
      links: [...afterDismissal.links, ...initialMap.links],
      buttons: [...afterDismissal.buttons, ...initialMap.buttons],
      forms: [...afterDismissal.forms, ...initialMap.forms],
      consentControls: initialMap.consentControls,
    }
    const llm = getTrustenLLM()
    if (!llm.isConfigured()) return siteFallback(url, map)

    const userPrompt = `SITE: ${url}
CURRENT PAGE: ${map.url || url}
TITLE: ${map.title}

OBSERVED PAGE LINKS:
${map.links
  .map((l) => `- ${l.t} -> ${l.h}`)
  .join('\n')
  .slice(0, 1500)}

PRIMARY BUTTONS: ${map.buttons.join(' | ').slice(0, 600)}

FORMS:
${map.forms
  .map(
    (f) =>
      `- method=${f.method} action=${f.action} fields=[${f.fields.join(', ')}]`,
  )
  .join('\n')
  .slice(0, 600)}

PAGE TEXT (excerpt):
${map.text}

Plan the dark-pattern test workflows for this specific site.`

    const raw = await llm.complete({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 1800,
    })
    const workflows = coerceWorkflows(raw, url, map)
    if (workflows.length > 0) {
      logger.info('Trusten discovery: planned workflows', {
        url,
        count: workflows.length,
        ids: workflows.map((w) => w.id),
      })
      return workflows
    }
    logger.warn('Trusten discovery: LLM returned no usable workflows')
  } catch (err) {
    logger.warn('Trusten discovery failed', { error: String(err) })
  } finally {
    if (pageId !== null) await driver.closePage(pageId).catch(() => undefined)
  }

  logger.info('Trusten discovery: falling back to observed site destinations')
  return siteFallback(url, map)
}
