import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import type { BrowserDriver } from '../browser/driver'
import { getTrustenLLM } from '../llm/client'
import { discoverWorkflows } from './discovery'

const llm = getTrustenLLM()
const restores: Array<() => void> = []

afterEach(() => {
  for (const restore of restores.splice(0)) restore()
})

function planner(raw: string | Error, configured = true) {
  const configuredSpy = spyOn(llm, 'isConfigured').mockReturnValue(configured)
  const completeSpy = spyOn(llm, 'complete').mockImplementation(async () => {
    if (raw instanceof Error) throw raw
    return raw
  })
  restores.push(
    () => configuredSpy.mockRestore(),
    () => completeSpy.mockRestore(),
  )
  return completeSpy
}

function siteDriver(map: Record<string, unknown> = {}) {
  const closed: number[] = []
  const driver = {
    newPage: async () => 7,
    closePage: async (pageId: number) => {
      closed.push(pageId)
    },
    pressKey: async () => {},
    evaluate: async (_pageId: number, expression: string) => ({
      value: expression.includes('JSON.stringify')
        ? JSON.stringify({
            title: 'Example',
            links: [],
            buttons: [],
            forms: [],
            text: '',
            ...map,
          })
        : expression.includes('rejectTexts')
          ? 'no-banner'
          : 0,
    }),
  } as unknown as BrowserDriver
  return { driver, closed }
}

describe('discoverWorkflows', () => {
  test('keeps navigation intent and explicit in-place observations from the planner', async () => {
    planner(
      JSON.stringify({
        workflows: [
          {
            id: 'pricing',
            steps: [
              {
                aiGoal: 'Open pricing',
                expectsNavigation: true,
                navigate: '/pricing',
                timeout: 45,
              },
              {
                aiGoal: 'Inspect the prices already visible',
                expectsNavigation: false,
              },
            ],
          },
        ],
      }),
    )
    const { driver, closed } = siteDriver({
      links: [{ t: 'Pricing', h: '/pricing' }],
    })
    const workflows = await discoverWorkflows(driver, 'https://example.test/')

    expect(workflows[0]?.steps.map((step) => step.expectsNavigation)).toEqual([
      true,
      false,
    ])
    expect(workflows[0]?.steps[0]?.navigate).toBe(
      'https://example.test/pricing',
    )
    expect(closed).toEqual([7])
  })

  test('older goals still request navigation and malformed timeouts are bounded', async () => {
    planner(
      JSON.stringify({
        workflows: [
          {
            steps: [
              { aiGoal: 'Open the product', timeout: -1 },
              { aiGoal: 'Open pricing', timeout: 10000 },
            ],
          },
        ],
      }),
    )
    const { driver } = siteDriver()
    const workflows = await discoverWorkflows(driver, 'https://example.test/')

    expect(workflows[0]?.steps.map((step) => step.expectsNavigation)).toEqual([
      true,
      true,
    ])
    expect(workflows[0]?.steps.map((step) => step.timeout)).toEqual([10, 90])
  })

  test('unconfigured discovery uses actual links and a GET search without contacting the LLM', async () => {
    const complete = planner(
      new Error('must not contact an unconfigured provider'),
      false,
    )
    const { driver } = siteDriver({
      links: [
        { t: 'Pricing', h: '/pricing' },
        { t: 'Product', h: '/products/widget' },
        { t: 'Privacy', h: '/privacy' },
        { t: 'Sign up', h: '/signup' },
        { t: 'Cancel subscription', h: '/account/cancel-subscription' },
        { t: 'Logout', h: '/logout' },
        { t: 'Email', h: 'mailto:support@example.test' },
        { t: 'External', h: 'https://outside.test/checkout' },
      ],
      forms: [
        { action: '/search', method: 'get', fields: ['q'] },
        { action: '/register', method: 'post', fields: ['email', 'password'] },
      ],
    })
    const workflows = await discoverWorkflows(driver, 'https://example.test/')
    const destinations = workflows.flatMap((workflow) =>
      workflow.steps.map((step) => step.navigate).filter(Boolean),
    )

    expect(destinations.sort()).toEqual(
      [
        'https://example.test/pricing',
        'https://example.test/privacy',
        'https://example.test/products/widget',
        'https://example.test/search?q=test',
        'https://example.test/signup',
      ].sort(),
    )
    expect(
      workflows
        .flatMap((workflow) => workflow.steps)
        .filter((step) => step.navigate)
        .every((step) => step.expectsNavigation),
    ).toBe(true)
    expect(workflows[0]?.steps[0]?.expectsNavigation).toBe(false)
    expect(complete).not.toHaveBeenCalled()
  })

  test('a planner outage still discovers SPA destinations from this site', async () => {
    planner(new Error('provider unavailable'))
    const { driver } = siteDriver({
      links: [
        { t: 'Pricing', h: '#/pricing' },
        { t: 'Jump', h: '#details' },
        { t: 'Jump absolute', h: 'https://example.test/#details' },
      ],
    })
    const workflows = await discoverWorkflows(driver, 'https://example.test/')

    expect(
      workflows
        .flatMap((workflow) => workflow.steps)
        .map((step) => step.navigate)
        .filter(Boolean),
    ).toEqual(['https://example.test/#/pricing'])
  })

  test('a site with no safe destinations gets observation evidence without invented funnels', async () => {
    planner('{}', false)
    const { driver } = siteDriver({
      forms: [{ action: '/pay', method: 'post', fields: ['card'] }],
    })
    const workflows = await discoverWorkflows(driver, 'https://example.test/')

    expect(workflows).toHaveLength(1)
    expect(workflows[0]?.steps).toHaveLength(1)
    expect(workflows[0]?.steps[0]?.expectsNavigation).toBe(false)
    expect(workflows[0]?.steps[0]?.navigate).toBeUndefined()
  })

  test('rejects invented or mutating deterministic destinations from the planner', async () => {
    planner(
      JSON.stringify({
        workflows: [
          {
            steps: [
              {
                aiGoal: 'Inspect account options without submitting',
                navigate: '/account/delete',
              },
              { aiGoal: 'Inspect pricing', navigate: '/invented-price-page' },
            ],
          },
        ],
      }),
    )
    const { driver } = siteDriver({
      links: [{ t: 'Delete', h: '/account/delete' }],
    })
    const workflows = await discoverWorkflows(driver, 'https://example.test/')

    expect(workflows[0]?.steps.map((step) => step.navigate)).toEqual([
      undefined,
      undefined,
    ])
  })

  test('ignores malformed and action-like form destinations without losing safe page evidence', async () => {
    planner('{}', false)
    const { driver } = siteDriver({
      links: [
        { t: 'Checkout', h: '/checkout?submit=1' },
        { t: 'Pricing', h: '/pricing' },
      ],
      forms: [
        { action: 'https://[', method: 'get', fields: ['q'] },
        { action: '/account/delete', method: 'get', fields: ['q'] },
        { action: '/search', method: 'post', fields: ['q'] },
      ],
    })
    const workflows = await discoverWorkflows(driver, 'https://example.test/')

    expect(
      workflows
        .flatMap((workflow) => workflow.steps)
        .map((step) => step.navigate)
        .filter(Boolean),
    ).toEqual(['https://example.test/pricing'])
  })

  test('resolves observed destinations against the page actually reached after a redirect', async () => {
    planner('{}', false)
    const { driver } = siteDriver({
      url: 'https://www.example.test/store/',
      links: [
        { t: 'Pricing', h: '/pricing' },
        { t: 'Product', h: 'https://www.example.test/products/widget' },
      ],
    })
    const workflows = await discoverWorkflows(driver, 'https://example.test/')

    expect(
      workflows
        .flatMap((workflow) => workflow.steps)
        .map((step) => step.navigate)
        .filter(Boolean),
    ).toEqual([
      'https://www.example.test/pricing',
      'https://www.example.test/products/widget',
    ])
  })

  test('retail discovery connects an actual product to cart and checkout without a guessed search', async () => {
    planner('{}', false)
    const { driver } = siteDriver({
      links: [
        { t: 'Widget', h: '/products/widget' },
        { t: 'Cart', h: '/cart' },
        { t: 'Checkout', h: '/checkout' },
      ],
    })
    const workflows = await discoverWorkflows(driver, 'https://example.test/')
    const checkout = workflows.find((workflow) => workflow.id === 'checkout')

    expect(checkout?.steps.map((step) => step.id)).toEqual([
      'find-product',
      'add-to-cart',
      'cart-review',
      'checkout-start',
    ])
    expect(checkout?.steps[0]?.navigate).toBe(
      'https://example.test/products/widget',
    )
    expect(checkout?.steps[0]?.fillSearch).toBeUndefined()
    expect(
      checkout?.steps.find((step) => step.id === 'cart-review')?.navigate,
    ).toBe('https://example.test/cart')
    expect(
      checkout?.steps.find((step) => step.id === 'checkout-start')?.navigate,
    ).toBe('https://example.test/checkout')
    expect(
      checkout?.steps.find((step) => step.id === 'add-to-cart')?.clickText,
    ).not.toContain('buy now')
    expect(workflows.length).toBeLessThanOrEqual(6)
  })

  test('an observed catalog retains product selection while content sites do not invent checkout', async () => {
    planner('{}', false)
    const retail = siteDriver({
      links: [
        { t: 'Shop', h: '/catalog' },
        { t: 'Basket', h: '/basket' },
      ],
    })
    const retailWorkflows = await discoverWorkflows(
      retail.driver,
      'https://example.test/',
    )
    const checkout = retailWorkflows.find(
      (workflow) => workflow.id === 'checkout',
    )
    expect(checkout?.steps[0]?.navigate).toBe('https://example.test/catalog')
    expect(checkout?.steps.map((step) => step.id)).toContain('select-product')

    const content = siteDriver({
      links: [
        { t: 'Read article', h: '/articles/news' },
        { t: 'About', h: '/about' },
      ],
    })
    const contentWorkflows = await discoverWorkflows(
      content.driver,
      'https://example.test/',
    )
    expect(contentWorkflows.map((workflow) => workflow.id)).not.toContain(
      'checkout',
    )
  })

  test('consent discovery preserves actual banner controls and opens their preferences path', async () => {
    planner('{}', false)
    const { driver } = siteDriver({
      consentControls: ['Accept all', 'Cookie settings'],
    })
    const workflows = await discoverWorkflows(driver, 'https://example.test/')
    const consent = workflows.find(
      (workflow) => workflow.id === 'cookie_consent',
    )

    expect(consent?.steps.map((step) => step.id)).toEqual([
      'banner-analysis',
      'reject-path',
      'consent-settings',
    ])
    expect(
      consent?.steps.find((step) => step.id === 'reject-path')?.clickText,
    ).toEqual(['Cookie settings'])
  })
})
