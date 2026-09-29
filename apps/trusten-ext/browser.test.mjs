import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { extensionEntries } from './package.ts'

const require = createRequire(
  new URL('../server/package.json', import.meta.url),
)
const puppeteer = require('puppeteer')
const directory = path.dirname(fileURLToPath(import.meta.url))
let browser
let profile

before(async () => {
  profile = await mkdtemp(path.join(tmpdir(), 'trusten-extension-test-'))
  browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    userDataDir: profile,
    enableExtensions: [directory],
    args: ['--no-sandbox'],
  })
})
after(async () => {
  await browser?.close()
  await rm(profile, { recursive: true, force: true })
})

test('manifest icons decode at their declared sizes in Chrome', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'manifest.json'), 'utf8'),
  )
  const page = await browser.newPage()
  try {
    for (const [size, icon] of Object.entries(manifest.icons)) {
      const bytes = await readFile(path.join(directory, icon))
      assert.equal(
        bytes.subarray(0, 8).toString('hex'),
        '89504e470d0a1a0a',
        'Chrome manifest icons require a supported raster image',
      )
      const dimensions = await page.evaluate(
        async (src) => {
          const image = new Image()
          image.src = src
          await image.decode()
          return [image.naturalWidth, image.naturalHeight]
        },
        `data:image/png;base64,${bytes.toString('base64')}`,
      )
      assert.deepEqual(dimensions, [Number(size), Number(size)])
    }
  } finally {
    await page.close()
  }
})

test('overlay closes on CSP pages and restores existing website highlighting', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(
      '<meta http-equiv="Content-Security-Policy" content="script-src \'none\'"><button id="buy" style="outline: 1px dashed blue !important; outline-offset: 4px; box-shadow: 0 0 2px red">Buy now</button>',
    )
    const original = await page.$eval('#buy', (el) =>
      ['outline', 'outline-offset', 'box-shadow'].map((name) => [
        name,
        el.style.getPropertyValue(name),
        el.style.getPropertyPriority(name),
      ]),
    )
    const source = await readFile(path.join(directory, 'popup.js'), 'utf8')
    const fnStart = source.indexOf('function __trustenInjectOverlay(')
    const fnEnd = source.indexOf('\n//', fnStart)
    await page.evaluate(
      `${source.slice(fnStart, fnEnd)}\n__trustenInjectOverlay([{severity:'high',category:'fake_urgency',description:'Buy now',element:{selector:'#buy'}}], 'C', 'scan-1', 'https://trusten.example')`,
    )
    assert.equal(
      await page.$eval('#__trusten_live__ a', (el) => el.href),
      'https://trusten.example/scan/scan-1',
    )
    await page.$eval('#buy', (el) => {
      el.style.marginLeft = '8px'
    })
    await page.click('[aria-label="Close Trusten highlights"]')
    assert.equal(await page.$('#__trusten_live__'), null)
    assert.deepEqual(
      await page.$eval('#buy', (el) =>
        ['outline', 'outline-offset', 'box-shadow'].map((name) => [
          name,
          el.style.getPropertyValue(name),
          el.style.getPropertyPriority(name),
        ]),
      ),
      original,
    )
    assert.equal(await page.$eval('#buy', (el) => el.style.marginLeft), '8px')
  } finally {
    await page.close()
  }
})

test('unpacked extension captures live page, renders server result and opens current report URL', async () => {
  let captured
  const server = createServer((request, response) => {
    if (request.url === '/trusten/api/analyze-page') {
      let body = ''
      request.on('data', (chunk) => {
        body += chunk
      })
      request.on('end', () => {
        captured = JSON.parse(body)
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({
            scanId: 'chrome-scan',
            domain: 'localhost',
            grade: 'C',
            patterns: [
              {
                severity: 'high',
                category: 'fake_urgency',
                description: 'Buy now',
                element: { selector: '#buy' },
              },
            ],
          }),
        )
      })
    } else {
      response.setHeader('content-type', 'text/html')
      response.end(
        '<html><head><title>Live shop</title></head><body><button id="buy">Only today — buy now</button></body></html>',
      )
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://localhost:${server.address().port}`
  const bundle = await mkdtemp(path.join(tmpdir(), 'trusten-extension-bundle-'))
  for (const [name, bytes] of await extensionEntries(origin)) {
    const destination = path.join(bundle, name)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, bytes)
  }
  const packagedBrowser = await puppeteer.launch({
    headless: true,
    pipe: true,
    enableExtensions: [bundle],
    args: ['--no-sandbox'],
  })
  const manager = await packagedBrowser.newPage()
  const fixture = await packagedBrowser.newPage()
  const popup = await packagedBrowser.newPage()
  try {
    await manager.goto('chrome://extensions')
    const id = await manager.evaluate(
      () =>
        document
          .querySelector('extensions-manager')
          .shadowRoot.querySelector('extensions-item-list')
          .shadowRoot.querySelector('extensions-item').id,
    )
    await fixture.goto(`${origin}/shop`)
    await popup.goto(`chrome-extension://${id}/popup.html`)
    await popup.evaluate(async (origin) => {
      await chrome.storage.local.set({
        serverOrigin: origin,
        dashboardOrigin: origin,
      })
    }, origin)
    await popup.reload()
    await popup.waitForFunction(
      () => document.getElementById('urlText').textContent !== 'Loading…',
    )
    await fixture.bringToFront()
    await popup.evaluate(async (origin) => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      currentTab = { id: tab.id, url: `${origin}/shop` }
      await runScan()
    }, origin)
    assert.equal(
      await popup.$eval('#stateResults', (el) => el.style.display),
      'block',
      await popup.$eval('#errorMsg', (el) => el.textContent),
    )
    assert.equal(captured.pageTitle, 'Live shop')
    assert.match(captured.text, /Only today/)
    assert.equal(
      await popup.$eval('#btnFullReport', (el) => el.href),
      `${origin}/scan/chrome-scan`,
    )
    await popup.evaluate(() => toggleOverlay())
    assert.ok(await fixture.$('#__trusten_live__'))
    await fixture.click('[aria-label="Close Trusten highlights"]')
    assert.equal(await fixture.$('#__trusten_live__'), null)
  } finally {
    await Promise.all([manager.close(), fixture.close(), popup.close()])
    await packagedBrowser.close()
    await rm(bundle, { recursive: true, force: true })
    await new Promise((resolve) => server.close(resolve))
  }
})
