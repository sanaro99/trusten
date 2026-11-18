import { expect, test } from 'bun:test'
import type { AnalyzerContext } from '../types'
import { MisdirectionAnalyzer } from './misdirection'

function context(text: string): AnalyzerContext {
  return {
    url: 'https://shop.example/',
    pageTitle: 'Shop',
    domSnapshot: `<button>${text}</button>`,
    visibleText: text,
    screenshotBase64: '',
    networkRequests: [],
    cookies: [],
  }
}

test('flags guilt-trip refusals, including curly apostrophes', async () => {
  for (const text of [
    "No thanks, I don't like being informed",
    'No thanks, I don’t want to save money',
  ]) {
    const result = await new MisdirectionAnalyzer().analyze(context(text))
    expect(result.patterns.some((p) => p.category === 'confirmshaming')).toBe(
      true,
    )
  }
})

test('does not flag a plain refusal', async () => {
  const result = await new MisdirectionAnalyzer().analyze(context('No thanks'))
  expect(result.patterns.some((p) => p.category === 'confirmshaming')).toBe(
    false,
  )
})
