import { expect, test } from 'bun:test'
import type { AnalyzerContext } from '../types'
import { SneakingAnalyzer } from './sneaking'

const context: AnalyzerContext = {
  url: 'https://shop.example/checkout',
  pageTitle: 'Checkout',
  domSnapshot: '',
  visibleText: 'Your cart Test shirt $20',
  screenshotBase64: '',
  networkRequests: [],
  cookies: [],
}

test('a ticked add-on with its own price is basket sneaking', async () => {
  const result = await new SneakingAnalyzer().analyze({
    ...context,
    domSnapshot:
      '<h1>Your cart</h1><label><input type="checkbox" checked>Add protection plan $14.99</label>',
  })
  expect(result.patterns.some((p) => p.category === 'basket_sneaking')).toBe(
    true,
  )
})

test('a ticked newsletter box is not an add-on because a price appears later', async () => {
  const result = await new SneakingAnalyzer().analyze({
    ...context,
    domSnapshot:
      '<h1>Your cart</h1><label><input type="checkbox" checked>Receive marketing offers</label><div></div><footer><p>Service fee $9 is added at checkout.</p></footer>',
  })
  expect(result.patterns.some((p) => p.category === 'basket_sneaking')).toBe(
    false,
  )
})
