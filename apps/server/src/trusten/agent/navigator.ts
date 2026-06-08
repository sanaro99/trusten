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
  stepsExecuted: number
  finalUrl: string
  reason: string
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

/**
 * Execute a natural language navigation goal using BrowserOS + LLM.
 *
 * @param browser  The Browser instance
 * @param pageId   Page to navigate
 * @param goal     Natural language goal e.g. "Search for flights Seattle to Delhi"
 * @param maxSteps Max LLM iterations before giving up
 */
export async function navigateWithAI(
  browser: BrowserDriver,
  pageId: number,
  goal: string,
  maxSteps = 10,
): Promise<NavigationResult> {
  const llm = getTrustenLLM()
  const actionHistory: string[] = []
  let stepsExecuted = 0

  logger.info('Trusten AI navigator starting', {
    goal: goal.slice(0, 80),
    maxSteps,
  })

  for (let step = 0; step < maxSteps; step++) {
    // Get current page state
    const pages = await browser.listPages()
    const pageInfo = pages.find((p) => p.pageId === pageId)
    const currentUrl = pageInfo?.url ?? ''

    // Get accessibility tree (what the agent sees)
    let accessibilityTree = ''
    try {
      accessibilityTree = await browser.snapshot(pageId)
      // Truncate to keep within token budget — keep the most interactive elements
      accessibilityTree = truncateSnapshot(accessibilityTree, 3000)
    } catch (err) {
      logger.warn('Trusten AI navigator: snapshot failed', {
        error: String(err),
      })
      // Fall back to markdown if snapshot fails
      try {
        accessibilityTree = await browser.contentAsMarkdown(pageId, {
          viewportOnly: true,
          includeLinks: true,
          includeImages: false,
        })
        accessibilityTree = accessibilityTree.slice(0, 3000)
      } catch {
        break
      }
    }

    if (!accessibilityTree.trim()) {
      logger.warn('Trusten AI navigator: empty snapshot', { step })
      await sleep(1000)
      continue
    }

    const userPrompt = `GOAL: ${goal}

CURRENT URL: ${currentUrl}

RECENT ACTIONS (avoid repeating):
${actionHistory.slice(-4).join('\n') || '(none yet)'}

ACCESSIBILITY TREE:
${accessibilityTree}

What single action should you take next to accomplish the goal?`

    let action: NavigationAction
    try {
      const raw = await llm.complete({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        maxTokens: 256,
      })

      action = parseAction(raw)
    } catch (err) {
      logger.warn('Trusten AI navigator: LLM call failed', {
        step,
        error: String(err),
      })
      break
    }

    stepsExecuted++
    const actionSummary = `Step ${step + 1}: ${action.action}${action.elementId ? ` [${action.elementId}]` : ''}${action.value ? ` "${action.value.slice(0, 40)}"` : ''} — ${action.reasoning.slice(0, 80)}`
    actionHistory.push(actionSummary)

    logger.info('Trusten AI navigator action', {
      step: step + 1,
      action: action.action,
      elementId: action.elementId,
      value: action.value?.slice(0, 60),
      reasoning: action.reasoning.slice(0, 100),
    })

    if (action.done || action.action === 'done') {
      return {
        success: true,
        stepsExecuted,
        finalUrl: currentUrl,
        reason: `Goal accomplished: ${action.reasoning}`,
      }
    }

    if (action.stuck || action.action === 'stuck') {
      logger.warn('Trusten AI navigator: stuck', {
        goal: goal.slice(0, 60),
        step,
      })
      return {
        success: false,
        stepsExecuted,
        finalUrl: currentUrl,
        reason: `Stuck: ${action.reasoning}`,
      }
    }

    // Execute the action
    try {
      await executeAction(browser, pageId, action)
      // Wait for the page to react
      await sleep(1200)
    } catch (err) {
      logger.warn('Trusten AI navigator: action execution failed', {
        action: action.action,
        elementId: action.elementId,
        error: String(err),
      })
      // Don't abort — try the next step anyway
    }
  }

  const pages = await browser.listPages()
  const finalUrl = pages.find((p) => p.pageId === pageId)?.url ?? ''

  return {
    success: false,
    stepsExecuted,
    finalUrl,
    reason: `Reached max steps (${maxSteps}) without completing goal`,
  }
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
