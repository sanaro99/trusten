import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const popupSource = readFileSync(new URL('./popup.js', import.meta.url), 'utf8')
const configUrl = new URL('./config.js', import.meta.url)

async function popup({
  url = 'https://shop.example/product',
  settings = {},
  response = {
    scanId: 'scan-1',
    domain: 'shop.example',
    grade: 'C',
    patterns: [],
    coverage: { status: 'complete' },
  },
  status = 200,
  changeTabDuringCapture = false,
  unreadable = false,
}: {
  url?: string
  settings?: Record<string, string>
  response?: object
  status?: number
  changeTabDuringCapture?: boolean
  unreadable?: boolean
} = {}) {
  const elements = new Map<string, any>()
  function element(id: string) {
    if (!elements.has(id))
      elements.set(id, {
        style: {},
        textContent: '',
        innerHTML: '',
        href: '',
        addEventListener() {},
        appendChild() {},
        classList: { add() {}, remove() {} },
      })
    return elements.get(id)
  }
  const requests: { url: string; body?: any }[] = []
  let captures = 0
  let screenshots = 0
  const context = vm.createContext({
    URL,
    console,
    TypeError,
    document: { getElementById: element, createElement: () => element('row') },
    chrome: {
      tabs: {
        query: async () => [
          {
            id: 7,
            windowId: 2,
            url:
              screenshots && changeTabDuringCapture
                ? 'https://another.example/'
                : url,
          },
        ],
        captureVisibleTab: async () => {
          screenshots++
          return 'data:image/jpeg;base64,/9j/4AAQ/9k='
        },
      },
      storage: { local: { get: async () => settings } },
      runtime: { openOptionsPage() {} },
      scripting: {
        executeScript: async () => {
          captures++
          if (unreadable) throw new Error('Cannot access contents of the page')
          return [
            {
              result: {
                url,
                html: '<html><body>Sale</body></html>',
                text: 'Sale',
                pageTitle: 'Shop',
              },
            },
          ]
        },
      },
    },
    fetch: async (url: string, init: any) => {
      requests.push({ url, body: init?.body && JSON.parse(init.body) })
      return new Response(JSON.stringify(response), { status })
    },
  })
  vm.runInContext(readFileSync(configUrl, 'utf8'), context)
  vm.runInContext(popupSource, context)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { context, element, requests, captures: () => captures }
}

describe('extension popup', () => {
  test('uses saved API origin and current dashboard report routes', async () => {
    const app = await popup({
      settings: {
        serverOrigin: 'https://api.trusten.example',
        dashboardOrigin: 'https://trusten.example',
      },
    })
    await vm.runInContext('runScan()', app.context)
    expect(app.requests[0]?.url).toBe(
      'https://api.trusten.example/trusten/api/analyze-page',
    )
    expect(app.requests[0]?.body.screenshotBase64).toBe('/9j/4AAQ/9k=')
    expect(app.element('dashboardLink').href).toBe('https://trusten.example/')
    expect(app.element('btnFullReport').href).toBe(
      'https://trusten.example/scan/scan-1',
    )
    expect(app.element('stateResults').style.display).toBe('block')
  })

  test('does not submit Chrome internal pages to the scanner', async () => {
    const app = await popup({ url: 'chrome://extensions/' })
    await vm.runInContext('runScan()', app.context)
    expect(app.requests).toHaveLength(0)
    expect(app.captures()).toBe(0)
    expect(app.element('stateError').style.display).toBe('block')
    expect(app.element('errorMsg').textContent).toMatch(/website|http/i)
  })

  test('explains a page Chrome will not let it read, without a server check', async () => {
    const app = await popup({ unreadable: true })
    await vm.runInContext('runScan()', app.context)
    expect(app.requests).toHaveLength(0)
    expect(app.element('stateError').style.display).toBe('block')
    expect(app.element('errorTitle').textContent).toBe(
      'Trusten cannot read this page',
    )
  })

  test('explains server rejection instead of hiding its reason', async () => {
    const app = await popup({
      response: { error: 'Rate limit: try again shortly' },
      status: 429,
    })
    await vm.runInContext('runScan()', app.context)
    expect(app.element('stateError').style.display).toBe('block')
    expect(app.element('errorMsg').textContent).toContain(
      'Rate limit: try again shortly',
    )
    expect(app.requests).toHaveLength(1)
  })

  test('never calls a page mostly fair while showing serious concerns', async () => {
    const app = await popup({
      response: {
        scanId: 'scan-1',
        domain: 'shop.example',
        grade: 'A',
        coverage: { status: 'complete' },
        patterns: [
          {
            severity: 'high',
            category: 'fake_urgency',
            description: 'Time pressure',
          },
        ],
      },
    })
    await vm.runInContext('runScan()', app.context)
    expect(app.element('resultSummary').textContent).not.toMatch(
      /no clear concerns|mostly fair/i,
    )
    expect(app.element('resultSummary').textContent).toMatch(
      /important|concern|closer look/i,
    )
  })

  test('withholds the grade and explains incomplete visual coverage', async () => {
    const app = await popup({
      response: {
        scanId: 'scan-1',
        domain: 'shop.example',
        grade: 'A',
        coverage: { status: 'partial', missingVisual: true },
        patterns: [],
      },
    })
    await vm.runInContext('runScan()', app.context)
    expect(app.element('gradeLetter').textContent).not.toBe('A')
    expect(app.element('coverageNote').textContent).toMatch(
      /visual|incomplete|limited/i,
    )
    expect(app.element('resultSummary').textContent).not.toMatch(/mostly fair/i)
  })
  test('does not attach a screenshot taken after the target page navigates', async () => {
    const app = await popup({ changeTabDuringCapture: true })
    await vm.runInContext('runScan()', app.context)
    expect(app.requests[0].body.screenshotBase64).toBeUndefined()
    expect(app.requests[0].body.html).toContain('Sale')
  })
})
