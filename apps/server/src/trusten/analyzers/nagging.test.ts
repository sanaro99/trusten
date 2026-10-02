import { describe, expect, test } from 'bun:test'
import type { AnalyzerContext } from '../types'
import { NaggingAnalyzer } from './nagging'

function promptContext(html: string, visibleText = ''): AnalyzerContext {
  return {
    url: 'https://example.com/',
    pageTitle: 'Example',
    domSnapshot: html,
    visibleText,
    screenshotBase64: '',
    networkRequests: [],
    cookies: [],
  }
}

async function prompts(context: AnalyzerContext) {
  return (await new NaggingAnalyzer().analyze(context)).patterns.filter(
    (pattern) => pattern.category === 'repeated_prompts',
  )
}

describe('observed intrusive prompts', () => {
  test('ignores an ordinary shipping banner with data-section-id', async () => {
    expect(
      await prompts(
        promptContext(
          '<div class="relative" style="background-color: #212121" data-section-type="global-banner" data-section-id="sections--16476871000144__global-banner" data-analytics-global-banner="" data-section-template-name="index" data-autoplay-delay="5000" data-enable-sticky-behavior="false" data-v-app="">Free shipping on orders over $100</div>',
        ),
      ),
    ).toEqual([])
  })

  test('does not label a single dismissible newsletter modal as repeated prompting', async () => {
    expect(
      await prompts(
        promptContext(
          '<div class="newsletter-modal"><p>Stay updated. Subscribe to our newsletter.</p><button>No thanks</button></div>',
        ),
      ),
    ).toEqual([])
  })

  test('does not label ordinary notification settings copy as nagging', async () => {
    expect(
      await prompts(
        promptContext(
          '<main><h1>Settings</h1><button>Enable notifications</button></main>',
        ),
      ),
    ).toEqual([])
  })

  test('does not match an overlay token inside data attributes', async () => {
    expect(
      await prompts(
        promptContext(
          '<div data-section-id="exit-modal">Wait! Before you go, subscribe.</div>',
        ),
      ),
    ).toEqual([])
  })

  test('retains an observed exit-interruption prompt with its content', async () => {
    const patterns = await prompts(
      promptContext(
        '<div class="exit-modal"><p>Wait! Before you go, subscribe for a discount.</p><button>Continue shopping</button></div>',
      ),
    )
    expect(patterns).toHaveLength(1)
    expect(patterns[0]?.element?.text).toContain('subscribe for a discount')
    expect(patterns[0]?.element?.html).toContain('Continue shopping')
    expect(patterns[0]?.description).not.toContain(
      'without a clear and easy dismiss',
    )
  })

  test('reports a notification prompt observed again after a recorded refusal', async () => {
    const context = promptContext(
      '<div role="dialog"><p>Enable notifications for deals.</p><button>Allow</button><button>No thanks</button></div>',
    )
    context.previousStepContext = promptContext(
      '<main>Notifications declined. Continue shopping.</main>',
    )
    const patterns = await prompts(context)
    expect(patterns).toHaveLength(1)
    expect(patterns[0]?.element?.text).toContain('Enable notifications')
  })

  test('ignores empty modal placeholders', async () => {
    expect(
      await prompts(promptContext('<div id="newsletter-modal"></div>')),
    ).toEqual([])
  })

  test('does not treat an unchanged modal across snapshots as a refused prompt', async () => {
    const context = promptContext(
      '<div role="dialog">Enable notifications for deals. No thanks</div>',
    )
    context.previousStepContext = promptContext(context.domSnapshot)
    expect(await prompts(context)).toEqual([])
  })

  test('does not connect refusal of an unrelated request to a notification prompt', async () => {
    const context = promptContext(
      '<div role="dialog">Enable notifications for deals.</div>',
    )
    context.previousStepContext = promptContext(
      '<main>Newsletter declined.</main>',
    )
    expect(await prompts(context)).toEqual([])
  })

  test('does not report a hidden exit modal or prompt markup inside a script', async () => {
    expect(
      await prompts(
        promptContext(
          '<div class="exit-modal" aria-hidden="true">Wait! Before you go, subscribe.</div><script><div class="exit-modal">Wait! Before you go, subscribe.</div></script>',
        ),
      ),
    ).toEqual([])
  })
})

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
