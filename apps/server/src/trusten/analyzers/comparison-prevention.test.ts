import { expect, test } from 'bun:test'
import type { AnalyzerContext } from '../types'
import { ComparisonPreventionAnalyzer } from './comparison-prevention'

const context: AnalyzerContext = {
  url: 'https://shop.example/',
  pageTitle: 'Product',
  domSnapshot: '',
  visibleText:
    'Product Details. Size guide. Care instructions. See full terms and conditions.',
  screenshotBase64: '',
  networkRequests: [],
  cookies: [],
}
test('ordinary product accordions and terms links are not hidden material information', async () => {
  const html = ['Product Details', 'Size guide', 'Care instructions']
    .map(
      (title) =>
        `<details class="accordion"><summary>${title}</summary>Cotton clothing.</details>`,
    )
    .join('')
  expect(
    (
      await new ComparisonPreventionAnalyzer().analyze({
        ...context,
        domSnapshot: html,
      })
    ).patterns,
  ).toHaveLength(0)
})
test('keeps a warning when automatic renewal and a cancellation fee are concealed in closed details', async () => {
  const html =
    '<details class="accordion"><summary>Billing terms</summary>Automatically renews at $49 per month. A cancellation fee applies.</details>'
  const result = await new ComparisonPreventionAnalyzer().analyze({
    ...context,
    domSnapshot: html,
    visibleText: 'Billing terms',
  })
  expect(result.patterns).toHaveLength(1)
  expect(result.patterns[0].element?.text).toContain('Automatically renews')
})
