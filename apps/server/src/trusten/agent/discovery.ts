/**
 * Trusten — Agentic workflow discovery (TestSprite-style)
 *
 * Instead of only running a fixed library of workflows, explore the target site
 * (nav, buttons, forms, copy) and ask an LLM to plan the dark-pattern-prone user
 * journeys that actually exist on THIS site. Each journey becomes a ScanWorkflow
 * whose steps the existing AI navigator (navigateWithAI) executes.
 *
 * Falls back to the fixed workflow library when the LLM is unavailable or the
 * plan can't be parsed, so a Deep Scan always has something to run.
 */

import { logger } from '../../lib/logger'
import type { BrowserDriver } from '../browser/driver'
import { getTrustenLLM } from '../llm/client'
import type { ScanWorkflow, WorkflowStepDefinition } from '../types'
import {
  dismissCookieBanners,
  dismissInterferingModals,
} from '../utils/pre-scan'
import { WORKFLOW_REGISTRY } from '../workflows/definitions'

const ANALYZER_NAMES = [
  'UrgencyScarcityAnalyzer',
  'MisdirectionAnalyzer',
  'SneakingAnalyzer',
  'ObstructionAnalyzer',
  'ForcedActionAnalyzer',
  'PreselectionAnalyzer',
  'NaggingAnalyzer',
  'ComparisonPreventionAnalyzer',
  'PrivacyAnalyzer',
  'InterfaceManipulationAnalyzer',
  'VisualAnalyzer',
]
const DEFAULT_ANALYZERS = [
  'UrgencyScarcityAnalyzer',
  'MisdirectionAnalyzer',
  'SneakingAnalyzer',
  'PreselectionAnalyzer',
  'PrivacyAnalyzer',
  'VisualAnalyzer',
]

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface SiteMap {
  title: string
  links: Array<{ t: string; h: string }>
  buttons: string[]
  forms: Array<{ action: string; fields: string[] }>
  text: string
}

const GATHER_SCRIPT = `(function(){
  try {
    const links = [...document.querySelectorAll('header a, nav a, footer a, [role="navigation"] a')]
      .map(a => ({ t: (a.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40), h: a.getAttribute('href')||'' }))
      .filter(x => x.t).slice(0,60);
    const buttons = [...document.querySelectorAll('button, [role="button"], a.btn, input[type="submit"]')]
      .map(b => (b.textContent||b.value||'').replace(/\\s+/g,' ').trim()).filter(Boolean).slice(0,40);
    const forms = [...document.querySelectorAll('form')].map(f => ({
      action: f.getAttribute('action')||'',
      fields: [...f.querySelectorAll('input,select,textarea')].map(i => i.getAttribute('name')||i.getAttribute('type')||'').filter(Boolean).slice(0,12)
    })).slice(0,8);
    return JSON.stringify({ title: document.title||'', links, buttons, forms, text: (document.body?document.body.innerText:'').replace(/\\s+/g,' ').slice(0,1500) });
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
      title: v.title ?? '',
      links: Array.isArray(v.links) ? v.links : [],
      buttons: Array.isArray(v.buttons) ? v.buttons : [],
      forms: Array.isArray(v.forms) ? v.forms : [],
      text: v.text ?? '',
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
        { "aiGoal": "natural-language instruction the browser agent will follow", "analyzersToRun": ["UrgencyScarcityAnalyzer", ...], "timeout": 40 }
      ]
    }
  ]
}

Valid analyzer names: ${ANALYZER_NAMES.join(', ')}.
Rules: 1-5 steps per workflow. aiGoal must be specific to this site. Never enter real payment or
personal data. Prefer journeys the site actually supports (based on its nav/buttons/forms).`

function coerceWorkflows(raw: string): ScanWorkflow[] {
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
  for (let i = 0; i < list.length && out.length < 6; i++) {
    const w = list[i] as Record<string, unknown>
    if (!w || typeof w !== 'object') continue
    const steps = Array.isArray(w.steps) ? w.steps : []
    const wfSteps: WorkflowStepDefinition[] = []
    for (let j = 0; j < steps.length && wfSteps.length < 8; j++) {
      const s = steps[j] as Record<string, unknown>
      const aiGoal = typeof s?.aiGoal === 'string' ? s.aiGoal : ''
      if (!aiGoal) continue
      const analyzers = Array.isArray(s.analyzersToRun)
        ? (s.analyzersToRun as unknown[])
            .filter((a): a is string => typeof a === 'string')
            .filter((a) => ANALYZER_NAMES.includes(a))
        : []
      wfSteps.push({
        id: `step-${j + 1}`,
        instruction: aiGoal.slice(0, 200),
        aiGoal,
        analyzersToRun: analyzers.length > 0 ? analyzers : DEFAULT_ANALYZERS,
        timeout: typeof s.timeout === 'number' ? s.timeout : 40,
        screenshotBefore: false,
        screenshotAfter: true,
      })
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

function fixedFallback(): ScanWorkflow[] {
  return ['cookie_consent', 'signup', 'pricing', 'checkout', 'cancellation']
    .map((id) => WORKFLOW_REGISTRY[id])
    .filter((w): w is ScanWorkflow => !!w)
}

export async function discoverWorkflows(
  driver: BrowserDriver,
  url: string,
): Promise<ScanWorkflow[]> {
  let pageId: number | null = null
  try {
    pageId = await driver.newPage(url, { background: true })
    await sleep(1500)
    await dismissCookieBanners(driver, pageId).catch(() => undefined)
    await dismissInterferingModals(driver, pageId).catch(() => undefined)
    const map = await gatherSiteMap(driver, pageId)

    const userPrompt = `SITE: ${url}
TITLE: ${map.title}

NAV / FOOTER LINKS:
${map.links
  .map((l) => `- ${l.t} -> ${l.h}`)
  .join('\n')
  .slice(0, 1500)}

PRIMARY BUTTONS: ${map.buttons.join(' | ').slice(0, 600)}

FORMS:
${map.forms
  .map((f) => `- action=${f.action} fields=[${f.fields.join(', ')}]`)
  .join('\n')
  .slice(0, 600)}

PAGE TEXT (excerpt):
${map.text}

Plan the dark-pattern test workflows for this specific site.`

    const raw = await getTrustenLLM().complete({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 1800,
    })
    const workflows = coerceWorkflows(raw)
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

  logger.info('Trusten discovery: falling back to fixed workflow library')
  return fixedFallback()
}
