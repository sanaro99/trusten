import { expect, test } from 'bun:test'
import { getTrustenLLM } from '../llm/client'
import { type AnalyzerContext, DarkPatternCategory } from '../types'
import { BaseAnalyzer } from './base-analyzer'

class FixtureAnalyzer extends BaseAnalyzer {
  name = 'Fixture'
  categories = [DarkPatternCategory.FAKE_HIERARCHY]
  analyze(context: AnalyzerContext) {
    return this.runLLMAnalysis({
      analysisType: 'hierarchy',
      context,
      text: context.visibleText,
      defaultCategory: DarkPatternCategory.FAKE_HIERARCHY,
    }).then((patterns) => ({ patterns }))
  }
}
test('a single-category model response cannot relabel urgency as choice hierarchy', async () => {
  const client = getTrustenLLM()
  const original = client.analyzeForPatterns
  client.analyzeForPatterns = async () =>
    JSON.stringify({
      patterns: [
        {
          category: 'fake_urgency',
          severity: 'high',
          confidence: 0.9,
          description: 'Limited time deal creates urgency',
          evidence_text: 'Limited time deal',
        },
      ],
    })
  try {
    expect(
      (
        await new FixtureAnalyzer().analyze({
          url: 'https://shop.example/',
          pageTitle: 'Shop',
          domSnapshot: '<body>Limited time deal</body>',
          visibleText: 'Limited time deal',
          screenshotBase64: '',
          networkRequests: [],
          cookies: [],
        })
      ).patterns,
    ).toHaveLength(0)
  } finally {
    client.analyzeForPatterns = original
  }
})

class QuoteAnalyzer extends FixtureAnalyzer {
  quote(text: string, pattern: RegExp) {
    return this.findKeywordMatches(text, [pattern])[0]?.context
  }
  shorten(text: string, max: number) {
    return this.clip(text, max)
  }
}

test('quotes the whole sentence around a match instead of cutting words', () => {
  const analyzer = new QuoteAnalyzer()
  const text =
    'Free delivery on orders over $35. In-store pricing may vary from online prices. Only 2 left in stock!'
  expect(analyzer.quote(text, /only \d+ left/i)).toBe('Only 2 left in stock!')
  expect(analyzer.quote(text, /pricing may vary/i)).toBe(
    'In-store pricing may vary from online prices.',
  )
})

test('shortens long quotes at a word boundary', () => {
  const analyzer = new QuoteAnalyzer()
  const short = analyzer.shorten(
    'Receive marketing offers from our partners every week',
    30,
  )
  expect(short).toBe('Receive marketing offers from…')
  expect(analyzer.shorten('  Two\n words ', 30)).toBe('Two words')
})
