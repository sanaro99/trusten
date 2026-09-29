import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import type { Browser, Page } from 'puppeteer'
import { PuppeteerDriver } from './puppeteer-driver'

const enabled = process.env.TRUSTEN_BROWSER_TESTS === '1'

describe.skipIf(!enabled)('Puppeteer driver browser lifecycle', () => {
  let fixture: ReturnType<typeof Bun.serve>
  let driver: PuppeteerDriver
  let baseUrl: string
  let forbiddenRequests = 0
  const browsers = new Set<Browser>()

  beforeAll(() => {
    fixture = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/redirect')
          return Response.redirect(`${baseUrl}/forbidden`)
        if (url.pathname === '/forbidden') forbiddenRequests++
        const status = Number(url.searchParams.get('status')) || 200
        return new Response(
          `<!doctype html><html><head><title>${url.pathname}</title></head><body><h1>Browser fixture</h1></body></html>`,
          { status, headers: { 'content-type': 'text/html' } },
        )
      },
    })
    baseUrl = `http://127.0.0.1:${fixture.port}`
  })

  beforeEach(() => {
    driver = new PuppeteerDriver()
    forbiddenRequests = 0
    browsers.clear()
  })

  afterEach(async () => {
    await driver.close()
    for (const browser of browsers) await browser.close().catch(() => undefined)
  })

  afterAll(() => fixture.stop(true))

  // Fault injection belongs in the test: the public driver deliberately does
  // not expose Chrome processes or lifecycle methods used only by tests.
  function browserFor(pageId: number): Browser {
    const entries = (
      driver as unknown as { pages: Map<number, { page: Page }> }
    ).pages
    const browser = entries.get(pageId)!.page.browser()
    browsers.add(browser)
    return browser
  }

  test('opens a usable page after Chromium crashes and discards dead pages', async () => {
    const oldPageId = await driver.newPage(`${baseUrl}/first`)
    const browser = browserFor(oldPageId)
    const disconnected = new Promise<void>((resolve) =>
      browser.once('disconnected', resolve),
    )
    const process = browser.process()!
    expect(process.kill('SIGKILL')).toBe(true)
    await disconnected

    const newPageId = await driver.newPage(`${baseUrl}/second`)
    browserFor(newPageId)
    expect(await driver.evaluate(newPageId, 'document.title')).toEqual({
      value: '/second',
    })
    expect((await driver.listPages()).map((page) => page.pageId)).toEqual([
      newPageId,
    ])
  }, 30_000)

  test('opens a usable page after the browser connection drops', async () => {
    const oldPageId = await driver.newPage(`${baseUrl}/first`)
    const browser = browserFor(oldPageId)
    await browser.disconnect()

    const newPageId = await driver.newPage(`${baseUrl}/second`)
    browserFor(newPageId)
    expect(await driver.evaluate(newPageId, 'document.title')).toEqual({
      value: '/second',
    })
    await expect(driver.click(oldPageId, 1)).rejects.toThrow('Unknown page')
  }, 30_000)

  test('concurrent first pages share one browser with isolated contexts', async () => {
    const pageIds = await Promise.all([
      driver.newPage(`${baseUrl}/first`),
      driver.newPage(`${baseUrl}/second`),
      driver.newPage(`${baseUrl}/third`),
    ])
    const pageBrowsers = pageIds.map(browserFor)
    expect(
      new Set(pageBrowsers.map((browser) => browser.wsEndpoint())).size,
    ).toBe(1)
    expect(pageBrowsers[0].browserContexts()).toHaveLength(4)
    expect(
      await Promise.all(
        pageIds.map((pageId) => driver.evaluate(pageId, 'document.title')),
      ),
    ).toEqual([{ value: '/first' }, { value: '/second' }, { value: '/third' }])
  }, 30_000)

  test('closing during the first browser launch does not leave a running page', async () => {
    const creatingPage = driver.newPage(`${baseUrl}/first`)
    const [creation] = await Promise.allSettled([creatingPage, driver.close()])
    if (creation.status === 'fulfilled') browserFor(creation.value)
    expect(await driver.listPages()).toEqual([])
  }, 30_000)

  test('still blocks unauthorized redirects after replacing a disconnected browser', async () => {
    driver = new PuppeteerDriver(async (url) => {
      if (new URL(url).pathname === '/forbidden')
        throw new Error('Fixture target blocked')
      return { url, hostname: 'fixture.example', addresses: ['93.184.216.34'] }
    })
    const oldPageId = await driver.newPage(`${baseUrl}/first`)
    const browser = browserFor(oldPageId)
    await browser.disconnect()

    await expect(driver.newPage(`${baseUrl}/redirect`)).rejects.toThrow(
      'Fixture target blocked',
    )
    expect(forbiddenRequests).toBe(0)
    expect(await driver.listPages()).toEqual([])
  }, 30_000)

  test.each([
    [401, 'SITE_BLOCKED'],
    [403, 'SITE_BLOCKED'],
    [429, 'SITE_BLOCKED'],
    [404, 'PAGE_LOAD_FAILED'],
    [500, 'PAGE_LOAD_FAILED'],
  ])(
    'classifies initial HTTP %i as %s',
    async (status, code) => {
      let failure: unknown
      try {
        await driver.newPage(`${baseUrl}/error?status=${status}`)
      } catch (error) {
        failure = error
      }
      expect(failure).toMatchObject({ code })
      expect(await driver.listPages()).toEqual([])
    },
    15_000,
  )

  test('classifies a failed initial navigation as PAGE_LOAD_FAILED', async () => {
    let failure: unknown
    try {
      await driver.newPage('http://127.0.0.1:1/')
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: 'PAGE_LOAD_FAILED' })
    expect(await driver.listPages()).toEqual([])
  }, 15_000)
})
