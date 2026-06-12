/**
 * Trusten AI Navigator
 *
 * Uses BrowserOS's accessibility tree + LLM to navigate websites intelligently.
 * This is the same fundamental loop the BrowserOS chat agent uses — snapshot the
 * page, ask the LLM what action to take, execute it, repeat.
 *
 * Why this instead of hardcoded clicks:
 *   - Expedia's flight search is a complex React form, not a plain <input>
 *   - "Add to cart" varies: "Add to bag", "Book now", "Reserve", "Get it"
 *   - Checkout flows differ by site: login walls, address forms, payment gates
 *   - The AI reads what's actually on the page and adapts
 */

import { logger } from '../../lib/logger'
import type { BrowserDriver } from '../browser/driver'
import { getTrustenLLM } from '../llm/client'

export interface NavigationAction {
  reasoning: string
  action: 'click' | 'fill' | 'press' | 'navigate' | 'scroll' | 'done' | 'stuck'
  elementId?: number
  value?: string // fill value, URL for navigate, key for press, direction for scroll
  amount?: number // scroll pixels
  done: boolean
  stuck: boolean
}

export interface NavigationResult {
  success: boolean
  /** The page URL or DOM structure materially changed during this step. */
  advanced: boolean
  stepsExecuted: number
  startUrl: string
  finalUrl: string
  reason: string
  /** Human-readable action summaries, used to give later steps journey context. */
  actionLog: string[]
}

const SYSTEM_PROMPT = `You are a web navigation agent. Your job is to navigate a web page step by step to accomplish a goal.

You receive:
1. The GOAL — what you are trying to accomplish
2. The current URL
3. An accessibility tree snapshot showing interactive elements as [id] type "label"
4. Recent actions you've already taken (to avoid loops)

You must return a SINGLE action as JSON. Choose the most direct action toward the goal.

Action types:
- click: click an element by its ID from the snapshot
- fill: type text into an input element (click first is implicit)
- press: send a keyboard key (Enter, Tab, Escape, ArrowDown, ArrowUp)
- navigate: go directly to a URL (use when you can see a clear link or know the URL pattern)
- scroll: scroll the page (value: "down" or "up", amount: pixels)
- done: the goal is accomplished — the page shows what was requested
- stuck: you cannot make progress (modal blocking, login wall, no relevant elements)

Rules:
- Only use element IDs from the current snapshot
- For date pickers, prefer typing dates over clicking calendar widgets
- If a field shows an autocomplete dropdown, use ArrowDown + Enter to select
- If you see a modal/dialog blocking progress, try pressing Escape or clicking a close button
- Mark done when you reach the target page/state, not when you've just started
- Mark stuck if you've taken 3+ actions and haven't progressed toward the goal

Return ONLY valid JSON, no explanation outside it:
{
  "reasoning": "one sentence explaining what you see and why you chose this action",
  "action": "click|fill|press|navigate|scroll|done|stuck",
  "elementId": 123,
  "value": "text or URL or key or scroll direction",
  "amount": 300,
  "done": false,
  "stuck": false
}`

/** Per-call LLM timeout for navigation — sequential & critical-path, so longer
 * than the parallel analyzers' default. */
const NAV_LLM_TIMEOUT_MS = Number(
  process.env.TRUSTEN_NAV_LLM_TIMEOUT_MS ?? 20_000,
)

/**
 * Cheap page fingerprint used to decide whether an action actually moved the
 * page. Combines the URL, title, first heading, and a coarse text-length
 * bucket so a real navigation (homepage → results/product/cart) registers a
 * change while incidental re-renders do not.
 */
async function pageSignature(
  browser: BrowserDriver,
  pageId: number,
): Promise<{ url: string; sig: string }> {
  const pages = await browser.listPages()
  const url = pages.find((p) => p.pageId === pageId)?.url ?? ''
  let sig = url
  try {
    const r = await browser.evaluate(
      pageId,
      `(function(){
        var t=(document.title||'');
        var h1=(document.querySelector('h1,h2')?document.querySelector('h1,h2').textContent:'').trim().slice(0,80);
        var len=document.body?document.body.innerText.length:0;
        return location.href+'|'+t+'|'+h1+'|'+Math.round(len/300);
      })()`,
    )
    if (typeof r.value === 'string' && r.value) sig = r.value
  } catch {
    /* keep url-only signature */
  }
  return { url, sig }
}

/** One LLM hiccup must not abort a whole step — retry a couple of times. */
async function completeWithRetry(
  goal: string,
  userPrompt: string,
  attempts = 2,
): Promise<string> {
  const llm = getTrustenLLM()
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await llm.complete({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        maxTokens: 256,
        timeoutMs: NAV_LLM_TIMEOUT_MS,
      })
    } catch (err) {
      lastErr = err
      logger.warn('Trusten AI navigator: LLM attempt failed', {
        attempt: i + 1,
        goal: goal.slice(0, 60),
        error: String(err),
      })
      await sleep(500)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * Execute a natural language navigation goal using the accessibility tree + LLM.
 *
 * @param browser       The Browser driver
 * @param pageId        Page to navigate
 * @param goal          Natural language goal e.g. "Search for flights Seattle to Delhi"
 * @param maxSteps      Max LLM iterations before giving up
 * @param priorContext  Action summaries from earlier steps, for journey continuity
 */
export async function navigateWithAI(
  browser: BrowserDriver,
  pageId: number,
  goal: string,
  maxSteps = 10,
  priorContext: string[] = [],
): Promise<NavigationResult> {
  const actionHistory: string[] = []
  let stepsExecuted = 0

  const start = await pageSignature(browser, pageId)
  let lastSig = start.sig
  let noChangeCount = 0

  logger.info('Trusten AI navigator starting', {
    goal: goal.slice(0, 80),
    maxSteps,
    startUrl: start.url,
  })

  const result = (
    reason: string,
    success: boolean,
    end: { url: string; sig: string },
  ): NavigationResult => ({
    success,
    advanced: end.sig !== start.sig,
    stepsExecuted,
    startUrl: start.url,
    finalUrl: end.url,
    reason,
    actionLog: actionHistory,
  })

  for (let step = 0; step < maxSteps; step++) {
    const pages = await browser.listPages()
    const currentUrl = pages.find((p) => p.pageId === pageId)?.url ?? ''

    // Get accessibility tree (what the agent sees)
    let accessibilityTree = ''
    try {
      accessibilityTree = truncateSnapshot(await browser.snapshot(pageId), 3500)
    } catch (err) {
      logger.warn('Trusten AI navigator: snapshot failed', {
        error: String(err),
      })
      try {
        accessibilityTree = (
          await browser.contentAsMarkdown(pageId, {
            viewportOnly: true,
            includeLinks: true,
            includeImages: false,
          })
        ).slice(0, 3500)
      } catch {
        return result('Page snapshot unavailable', false, start)
      }
    }

    if (!accessibilityTree.trim()) {
      logger.warn('Trusten AI navigator: empty snapshot', { step })
      await sleep(1000)
      continue
    }

    const userPrompt = `GOAL: ${goal}

CURRENT URL: ${currentUrl}
${priorContext.length ? `\nEARLIER IN THIS JOURNEY:\n${priorContext.slice(-6).join('\n')}\n` : ''}
RECENT ACTIONS (avoid repeating):
${actionHistory.slice(-4).join('\n') || '(none yet)'}

ACCESSIBILITY TREE:
${accessibilityTree}

What single action should you take next to accomplish the goal?`

    let action: NavigationAction
    try {
      action = parseAction(await completeWithRetry(goal, userPrompt))
    } catch (err) {
      logger.warn('Trusten AI navigator: LLM unavailable for step', {
        step,
        error: String(err),
      })
      return result(`LLM unavailable: ${String(err).slice(0, 80)}`, false, {
        url: currentUrl,
        sig: lastSig,
      })
    }

    stepsExecuted++
    const actionSummary = `${action.action}${action.elementId ? ` [${action.elementId}]` : ''}${action.value ? ` "${action.value.slice(0, 40)}"` : ''} — ${action.reasoning.slice(0, 80)}`
    actionHistory.push(actionSummary)

    logger.info('Trusten AI navigator action', {
      step: step + 1,
      action: action.action,
      elementId: action.elementId,
      value: action.value?.slice(0, 60),
      reasoning: action.reasoning.slice(0, 100),
    })

    if (action.done || action.action === 'done') {
      return result(
        `Goal accomplished: ${action.reasoning}`,
        true,
        await pageSignature(browser, pageId),
      )
    }

    if (action.stuck || action.action === 'stuck') {
      logger.warn('Trusten AI navigator: stuck', {
        goal: goal.slice(0, 60),
        step,
      })
      return result(
        `Stuck: ${action.reasoning}`,
        false,
        await pageSignature(browser, pageId),
      )
    }

    // Execute the action
    try {
      await executeAction(browser, pageId, action)
      // Let SPA route changes / XHR settle before re-observing.
      if (browser.waitForIdle) {
        await browser
          .waitForIdle(pageId, { timeout: 6000 })
          .catch(() => undefined)
      }
      await sleep(700)
    } catch (err) {
      logger.warn('Trusten AI navigator: action execution failed', {
        action: action.action,
        elementId: action.elementId,
        error: String(err),
      })
      // Don't abort — try the next step anyway
    }

    // No-progress detection: if several actions in a row change nothing, bail
    // rather than burning the whole step budget on a dead end.
    const sig = (await pageSignature(browser, pageId)).sig
    if (sig === lastSig) {
      noChangeCount++
      if (noChangeCount >= 3) {
        return result(
          'No progress after repeated actions',
          false,
          await pageSignature(browser, pageId),
        )
      }
    } else {
      noChangeCount = 0
      lastSig = sig
    }
  }

  const end = await pageSignature(browser, pageId)
  return result(
    `Reached max steps (${maxSteps}) without an explicit done`,
    end.sig !== start.sig,
    end,
  )
}

async function executeAction(
  browser: BrowserDriver,
  pageId: number,
  action: NavigationAction,
): Promise<void> {
  switch (action.action) {
    case 'click': {
      if (!action.elementId) throw new Error('click requires elementId')
      await browser.click(pageId, action.elementId)
      break
    }

    case 'fill': {
      if (!action.elementId) throw new Error('fill requires elementId')
      if (action.value === undefined) throw new Error('fill requires value')
      await browser.fill(pageId, action.elementId, action.value, true)
      // Brief pause for autocomplete dropdowns to appear
      await sleep(400)
      break
    }

    case 'press': {
      const key = action.value ?? 'Enter'
      await browser.pressKey(pageId, key)
      break
    }

    case 'navigate': {
      if (!action.value) throw new Error('navigate requires value (URL)')
      await browser.goto(pageId, action.value)
      await sleep(2000)
      break
    }

    case 'scroll': {
      const direction = action.value === 'up' ? 'up' : 'down'
      const amount = action.amount ?? 400
      // Use evaluate for scroll — simpler and works on all pages
      await browser.evaluate(
        pageId,
        `window.scrollBy(0, ${direction === 'down' ? amount : -amount})`,
      )
      break
    }

    default:
      break
  }
}

function parseAction(raw: string): NavigationAction {
  // Extract JSON from the response (LLM may add extra text)
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      reasoning: 'Failed to parse LLM response',
      action: 'stuck',
      done: false,
      stuck: true,
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<NavigationAction>
    return {
      reasoning: parsed.reasoning ?? 'No reasoning provided',
      action: validateActionType(parsed.action),
      elementId:
        typeof parsed.elementId === 'number' ? parsed.elementId : undefined,
      value: typeof parsed.value === 'string' ? parsed.value : undefined,
      amount: typeof parsed.amount === 'number' ? parsed.amount : undefined,
      done: parsed.done === true || parsed.action === 'done',
      stuck: parsed.stuck === true || parsed.action === 'stuck',
    }
  } catch {
    return {
      reasoning: 'JSON parse error',
      action: 'stuck',
      done: false,
      stuck: true,
    }
  }
}

function validateActionType(a: unknown): NavigationAction['action'] {
  const valid = [
    'click',
    'fill',
    'press',
    'navigate',
    'scroll',
    'done',
    'stuck',
  ] as const
  return valid.includes(a as NavigationAction['action'])
    ? (a as NavigationAction['action'])
    : 'stuck'
}

/**
 * Truncate the accessibility snapshot to fit within the LLM token budget.
 * Prioritizes interactive elements (buttons, inputs, links) over static text.
 */
function truncateSnapshot(snapshot: string, maxChars: number): string {
  if (snapshot.length <= maxChars) return snapshot

  const lines = snapshot.split('\n')

  // Priority 1: interactive elements (have [id] prefix)
  const interactive = lines.filter((l) => /^\[\d+\]/.test(l))
  // Priority 2: headings and other structure
  const structural = lines.filter(
    (l) => !/^\[\d+\]/.test(l) && l.trim().length > 0,
  )

  // Build output starting with interactive
  let output = interactive.join('\n')
  if (output.length < maxChars * 0.8) {
    const remaining = maxChars - output.length - 100
    output += `\n\n# Other content:\n${structural.join('\n').slice(0, remaining)}`
  }

  return output.slice(0, maxChars)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
