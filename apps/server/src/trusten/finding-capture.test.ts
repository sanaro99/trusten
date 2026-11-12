import { describe, expect, test } from 'bun:test'
import {
  buildMeasureScript,
  captureDirectory,
  captureFileName,
  isValidCapture,
  quotedPhrases,
  searchText,
} from './finding-capture'

describe('finding screenshots', () => {
  test('accept only screenshot files inside a scan folder', () => {
    expect(isValidCapture({ scanId: 'scan-1-ab', file: 'step-2.jpg' })).toBe(
      true,
    )
    expect(
      isValidCapture({ scanId: 'scan-1-ab', file: 'step-2-view-3.jpg' }),
    ).toBe(true)
    expect(isValidCapture({ scanId: '..', file: 'step-1.jpg' })).toBe(false)
    expect(isValidCapture({ scanId: 'scan-1', file: '../../secret.jpg' })).toBe(
      false,
    )
    expect(isValidCapture({ scanId: 'scan-1', file: 'report.pdf' })).toBe(false)
  })

  test('name the step screenshot and its extra views', () => {
    expect(captureFileName(3, 0)).toBe('step-3.jpg')
    expect(captureFileName(3, 2)).toBe('step-3-view-2.jpg')
  })

  test('find the folder from the scan’s own saved steps', () => {
    expect(
      captureDirectory(
        'scan-1',
        [
          {
            screenshotPath: String.raw`C:\reports\screenshots\scan-1\step-1.jpg`,
          },
        ],
        '/fallback',
      ),
    ).toBe('C:/reports/screenshots/scan-1')
    expect(captureDirectory('scan-2', [], '/reports')).toBe(
      '/reports/screenshots/scan-2',
    )
  })

  test('search for the quote with normal spacing, cut at a word', () => {
    expect(searchText('  Only\n2   left ')).toBe('Only 2 left')
    const long = searchText(`${'word '.repeat(30)}end`)
    expect(long.length).toBeLessThanOrEqual(80)
    expect(long.endsWith('word')).toBe(true)
  })

  test('pull the page’s own words out of an AI description', () => {
    expect(
      quotedPhrases(
        "Cookie dialog buttons: 'Accept All Cookies' (black filled button), 'Accept only essential cookies' as plain text",
      ),
    ).toEqual(['Accept All Cookies', 'Accept only essential cookies'])
    expect(quotedPhrases('The “Hurry, 2 left” badge')).toEqual([
      'Hurry, 2 left',
    ])
    // Apostrophes inside words are not quotes.
    expect(quotedPhrases("Don't miss the shop's sale")).toEqual([])
  })
})

describe.skipIf(process.env.TRUSTEN_BROWSER_TESTS !== '1')(
  'finding the element in Chromium',
  () => {
    test('outline an AI finding through the phrase it quotes', async () => {
      const puppeteer = (await import('puppeteer')).default
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox'],
      })
      try {
        const page = await browser.newPage()
        await page.setViewport({ width: 1000, height: 800 })
        await page.setContent(
          '<div style="padding:40px"><button style="width:200px;height:40px">Accept All Cookies</button> <span>Accept only essential cookies</span></div>',
        )
        const description =
          "Cookie dialog buttons: 'Accept All Cookies' (black filled button)"
        const raw = await page.evaluate(
          buildMeasureScript(
            [
              {
                selector: '',
                text: searchText(description),
                quotes: quotedPhrases(description),
              },
              { selector: '', text: 'Nothing like this is on the page' },
            ],
            null,
          ),
        )
        const { boxes } = JSON.parse(String(raw)) as {
          boxes: ({ width: number; height: number } | null)[]
        }
        expect(boxes[0]?.width).toBeCloseTo(0.2, 1)
        expect(boxes[0]?.height).toBeCloseTo(0.05, 1)
        expect(boxes[1]).toBeNull()
      } finally {
        await browser.close()
      }
    }, 30_000)
  },
)
