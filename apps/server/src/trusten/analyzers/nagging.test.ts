import { describe, expect, test } from 'bun:test'
import type { AnalyzerContext } from '../types'
import { NaggingAnalyzer } from './nagging'

async function ads(html: string, visibleText = '') {
  const context: AnalyzerContext = {
    url: 'https://example.com/',
    pageTitle: 'Example',
    domSnapshot: html,
    visibleText,
    screenshotBase64: '',
    networkRequests: [],
    cookies: [],
  }
  return (await new NaggingAnalyzer().analyze(context)).patterns.filter(
    (pattern) => pattern.category === 'disguised_ads',
  )
}

describe('advertising evidence', () => {
  test('does not mistake page-header, downloads, shadow or a normal banner for ads', async () => {
    expect(
      await ads(
        '<div class="page-header action"><h1>All products</h1></div><section class="downloads shadow"><a>Download guide</a></section><aside class="hero-banner">Welcome to our store</aside><article data-id="ad-42">Ordinary product</article>',
      ),
    ).toEqual([])
  })

  test('does not report a clearly labeled advertising container, including nested content', async () => {
    expect(
      await ads(
        '<div class="ad-container"><div class="ad-content"><h2>Partner product</h2></div><span class="ad-label" style="font-size:16px">Sponsored</span></div>',
      ),
    ).toEqual([])
  })

  test('does not turn ordinary mentions of ads into a deceptive advertising finding', async () => {
    expect(await ads('<main><p>This page has no ads.</p></main>')).toEqual([])
  })

  test('ignores empty advertising placeholders', async () => {
    expect(await ads('<div id="ad-slot"></div>')).toEqual([])
  })

  test('retains populated advertising containers without a disclosure as possible concerns', async () => {
    const patterns = await ads(
      "<div id='ad-slot-1'></div><div id='ad-slot-2'></div><article class='native ad-container'><h2>Recommended partner product</h2><a href='/offer'>Learn more</a></article>",
    )
    expect(patterns).toHaveLength(1)
    expect(patterns[0]?.element?.text ?? '').toContain(
      'Recommended partner product',
    )
    expect(patterns[0]?.element?.html ?? '').toContain('Learn more')
  })

  test('retains direct evidence of a tiny advertising disclosure', async () => {
    const patterns = await ads(
      '<article class="ad-container"><span style="font-size:9px">Sponsored</span><h2>Partner product</h2></article>',
    )
    expect(
      patterns.some((pattern) => pattern.description.includes('Tiny-font')),
    ).toBe(true)
  })
})
