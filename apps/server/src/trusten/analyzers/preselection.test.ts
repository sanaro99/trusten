import { expect, test } from 'bun:test'
import type { AnalyzerContext } from '../types'
import { PreselectionAnalyzer } from './preselection'

const context: AnalyzerContext = {
  url: 'https://shop.example/',
  pageTitle: 'Shop',
  domSnapshot: '',
  visibleText: 'Receive marketing emails',
  screenshotBase64: '',
  networkRequests: [],
  cookies: [],
}
test('a current selection does not prove that consent was selected by default', async () => {
  const result = await new PreselectionAnalyzer().analyze({
    ...context,
    domSnapshot:
      '<label><input type="checkbox" data-trusten-current-checked="true">Receive marketing emails</label>',
  })
  expect(result.patterns).toHaveLength(0)
})
test('preserves separate site-default consent checkboxes', async () => {
  const result = await new PreselectionAnalyzer().analyze({
    ...context,
    domSnapshot:
      '<label><input id="one" type="checkbox" checked>Receive marketing emails</label><label><input id="two" type="checkbox" checked>Receive marketing emails</label>',
  })
  expect(result.patterns).toHaveLength(2)
  expect(result.patterns[0].element?.selector).not.toBe(
    result.patterns[1].element?.selector,
  )
})

test('keeps separately identified checked add-ons on short pages', async () => {
  const result = await new PreselectionAnalyzer().analyze({
    ...context,
    visibleText: 'Insurance Donate',
    domSnapshot:
      '<label><input id="insurance" type="checkbox" checked>Insurance</label><label><input id="donation" type="checkbox" checked>Donate</label>',
  })
  expect(result.patterns).toHaveLength(2)
})
