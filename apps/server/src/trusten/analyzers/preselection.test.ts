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

test('quotes only the checkbox label, before or after the box', async () => {
  const after = await new PreselectionAnalyzer().analyze({
    ...context,
    domSnapshot:
      '<main><label><input type="checkbox" checked>Receive marketing emails</label><div style="height:3000px"></div><footer><p>Service fee $9 is added at checkout.</p></footer></main>',
  })
  expect(after.patterns[0]?.element?.text).toBe('Receive marketing emails')
  const before = await new PreselectionAnalyzer().analyze({
    ...context,
    domSnapshot:
      '<p>Your details</p><label>Receive marketing emails <input type="checkbox" checked></label><p>Continue to payment</p>',
  })
  expect(before.patterns[0]?.element?.text).toBe('Receive marketing emails')
})

test('ignores pre-ticked conveniences and locked boxes', async () => {
  for (const label of [
    'Remember me',
    'Keep me signed in',
    'Billing address same as shipping',
    'Save this card for faster checkout',
    'In stock only',
  ]) {
    const result = await new PreselectionAnalyzer().analyze({
      ...context,
      visibleText: label,
      domSnapshot: `<label><input type="checkbox" checked> ${label}</label>`,
    })
    expect(result.patterns).toHaveLength(0)
  }
  const locked = await new PreselectionAnalyzer().analyze({
    ...context,
    visibleText: 'Strictly necessary (always active)',
    domSnapshot:
      '<label><input type="checkbox" checked disabled> Strictly necessary (always active)</label>',
  })
  expect(locked.patterns).toHaveLength(0)
})

test('treats a pre-ticked terms agreement as worth knowing, not serious', async () => {
  const result = await new PreselectionAnalyzer().analyze({
    ...context,
    visibleText: 'I agree to the Terms',
    domSnapshot:
      '<label><input type="checkbox" checked> I agree to the Terms</label>',
  })
  expect(result.patterns.map((p) => p.severity)).toEqual(['medium'])
})

test('finds a paid extra after identical pre-ticked filter boxes', async () => {
  const result = await new PreselectionAnalyzer().analyze({
    ...context,
    visibleText: 'In stock only Free delivery Add gift wrap ($4.99)',
    domSnapshot:
      '<label><input type="checkbox" checked> In stock only</label><label><input type="checkbox" checked> Free delivery</label><label><input type="checkbox" checked> Add gift wrap ($4.99)</label>',
  })
  expect(result.patterns).toHaveLength(1)
  expect(result.patterns[0].element?.text).toContain('gift wrap')
})
