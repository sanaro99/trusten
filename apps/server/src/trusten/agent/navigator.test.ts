import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import type { BrowserDriver } from '../browser/driver'
import { getTrustenLLM } from '../llm/client'
import { navigateWithAI } from './navigator'

const llm = getTrustenLLM()
const restores: Array<() => void> = []
afterEach(() => {
  for (const restore of restores.splice(0)) restore()
})

function responses(actions: Array<Record<string, unknown>>) {
  let index = 0
  const complete = spyOn(llm, 'complete').mockImplementation(async () =>
    JSON.stringify(
      actions[index++] ?? {
        action: 'stuck',
        reasoning: 'No more planned actions',
      },
    ),
  )
  restores.push(() => complete.mockRestore())
}

function navigationDriver(snapshot = '[1] button "Show plans"') {
  let url = 'https://example.test/'
  let content = 'Choose a plan'
  const clicks: number[] = []
  const fills: string[] = []
  const driver = {
    listPages: async () => [{ pageId: 7, url, title: 'Example' }],
    snapshot: async () => snapshot,
    click: async (_pageId: number, elementId: number) => {
      clicks.push(elementId)
      content = 'Pro plan $20'
    },
    fill: async (_pageId: number, _elementId: number, value: string) => {
      fills.push(value)
      content = 'Search results'
    },
    goto: async (_pageId: number, destination: string) => {
      url = destination
      content = 'Pro plan $20'
    },
    evaluate: async () => ({ value: `${url}|Example|Plans|${content}` }),
    waitForIdle: async () => {},
  } as unknown as BrowserDriver
  return { driver, clicks, fills }
}

describe('navigateWithAI', () => {
  test('a changed page at the action limit is progress without claiming the goal was reached', async () => {
    responses([{ action: 'click', elementId: 1, reasoning: 'Open plans' }])
    const { driver } = navigationDriver()
    const result = await navigateWithAI(
      driver,
      7,
      'Open plans and inspect all prices',
      1,
    )

    expect(result.advanced).toBe(true)
    expect(result.success).toBe(false)
    expect(result.reason).toContain('without an explicit done')
  })

  test('explicit completion after public navigation reports a reached goal', async () => {
    responses([
      { action: 'click', elementId: 1, reasoning: 'Open plans' },
      { action: 'done', reasoning: 'Prices are visible' },
    ])
    const { driver, clicks } = navigationDriver()
    const result = await navigateWithAI(driver, 7, 'Open plans', 3)

    expect(result.success).toBe(true)
    expect(result.advanced).toBe(true)
    expect(clicks).toEqual([1])
  })

  test('getting stuck after progress reports unsuccessful navigation with the evidence preserved', async () => {
    responses([
      { action: 'click', elementId: 1, reasoning: 'Open plans' },
      { action: 'stuck', reasoning: 'Login wall' },
    ])
    const { driver } = navigationDriver()
    const result = await navigateWithAI(driver, 7, 'Inspect checkout', 3)

    expect(result.success).toBe(false)
    expect(result.advanced).toBe(true)
    expect(result.actionLog).toHaveLength(2)
  })

  test('blocks account registration submission suggested by the planner', async () => {
    responses([
      { action: 'click', elementId: 1, reasoning: 'Create the account' },
    ])
    const { driver, clicks } = navigationDriver('[1] button "Create account"')
    const result = await navigateWithAI(driver, 7, 'Inspect signup defaults', 1)

    expect(clicks).toEqual([])
    expect(result.success).toBe(false)
    expect(result.reason).toContain('evidence')
  })

  test('a generic continue button cannot submit a form with personal fields', async () => {
    responses([{ action: 'click', elementId: 2, reasoning: 'Continue signup' }])
    const { driver, clicks } = navigationDriver(
      '[1] input "Email address"\n[2] button "Continue"',
    )
    const result = await navigateWithAI(driver, 7, 'Inspect signup', 1)

    expect(clicks).toEqual([])
    expect(result.reason).toContain('evidence')
  })

  test('blocks entering personal data while allowing a public search field', async () => {
    responses([{ action: 'fill', elementId: 1, value: 'alex@example.test' }])
    const privateForm = navigationDriver('[1] input "Email address"')
    await navigateWithAI(privateForm.driver, 7, 'Inspect signup', 1)
    expect(privateForm.fills).toEqual([])

    responses([
      { action: 'fill', elementId: 1, value: 'headphones' },
      { action: 'done' },
    ])
    const searchForm = navigationDriver('[1] input "Search products"')
    const result = await navigateWithAI(
      searchForm.driver,
      7,
      'Find headphones',
      2,
    )
    expect(searchForm.fills).toEqual(['headphones'])
    expect(result.success).toBe(true)
  })

  test('an expiry date field is personal payment information rather than a travel search date', async () => {
    responses([{ action: 'fill', elementId: 1, value: '12/30' }])
    const { driver, fills } = navigationDriver(
      '[1] input "Credit card expiry date"',
    )
    const result = await navigateWithAI(driver, 7, 'Inspect checkout fields', 1)

    expect(fills).toEqual([])
    expect(result.reason).toContain('evidence')
  })
})
