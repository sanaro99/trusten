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
