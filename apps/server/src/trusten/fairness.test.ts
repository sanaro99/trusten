import { afterAll, beforeAll, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { consolidateFindings } from '@trusten/shared/domain'
import { ALL_ANALYZERS } from './analyzers/registry'
import {
  type FairnessPage,
  HONEST_PAGES,
  MANIPULATIVE_PAGES,
} from './fixtures/fairness-pages'
import { getTrustenLLM } from './llm/client'
import { calculateScore } from './scoring/engine'
import type {
  AnalyzerContext,
  DarkPatternScore,
  DetectedPattern,
} from './types'

// Deterministic mode: verdicts must hold without any model.
const llm = getTrustenLLM()
const original = {
  analyze: llm.analyzeForPatterns,
  configured: llm.isConfigured,
  images: llm.supportsImages,
}
beforeAll(() => {
  llm.analyzeForPatterns = async () => '{"patterns":[]}'
  llm.isConfigured = () => false
  llm.supportsImages = () => false
})
afterAll(() => {
  llm.analyzeForPatterns = original.analyze
  llm.isConfigured = original.configured
  llm.supportsImages = original.images
})

const visibleText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

async function scan(
  page: FairnessPage & { text?: string; title?: string },
): Promise<{ patterns: DetectedPattern[]; score: DarkPatternScore }> {
  const context: AnalyzerContext = {
    url: page.url,
    pageTitle: page.title ?? page.name,
    domSnapshot: page.html,
    visibleText: page.text ?? visibleText(page.html),
    screenshotBase64: '',
    networkRequests: [],
    cookies: [],
  }
  const found = await Promise.all(
    ALL_ANALYZERS.map((analyzer) =>
      analyzer.analyze(context).then((result) => result.patterns),
    ),
  )
  const patterns = consolidateFindings(found.flat())
  return { patterns, score: calculateScore(patterns) }
}

const isSerious = (p: DetectedPattern) =>
  p.severity === 'critical' || p.severity === 'high'

// Optional local corpus of real captured pages: TRUSTEN_FAIRNESS_PAGES=<dir of {url,title,html,text}.json>
const realHonestDir = process.env.TRUSTEN_FAIRNESS_PAGES
const realHonest: Array<FairnessPage & { text: string; title: string }> =
  realHonestDir
    ? readdirSync(realHonestDir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => ({
          name: file,
          ...JSON.parse(readFileSync(`${realHonestDir}/${file}`, 'utf8')),
        }))
    : []

const report = async () => {
  for (const [kind, pages] of [
    ['honest', [...HONEST_PAGES, ...realHonest]],
    ['manipulative', MANIPULATIVE_PAGES],
  ] as const) {
    for (const page of pages) {
      const { patterns, score } = await scan(page)
      console.log(`[${kind}] ${page.name}: ${score.grade} ${score.numeric}`)
      for (const p of patterns)
        console.log(
          `   ${p.severity.padEnd(8)} ${p.confidence.toFixed(2)} ${p.category.padEnd(22)} | ${(p.element?.text ?? '').replace(/\s+/g, ' ').slice(0, 70)}`,
        )
    }
  }
}
if (process.env.TRUSTEN_FAIRNESS_REPORT) test('fairness report', report)

for (const page of HONEST_PAGES) {
  test(`an honest ${page.name} gets no serious concern and an A`, async () => {
    const { patterns, score } = await scan(page)
    expect(
      patterns
        .filter(isSerious)
        .map((p) => `${p.category}: ${p.element?.text}`),
    ).toEqual([])
    expect(score.grade).toBe('A')
  })
}

for (const page of realHonest) {
  test(`real page ${page.name} gets no serious concern`, async () => {
    const { patterns } = await scan(page)
    expect(
      patterns
        .filter(isSerious)
        .map((p) => `${p.category}: ${p.element?.text}`),
    ).toEqual([])
  })
}

test('every manipulative page grades below every honest page', async () => {
  const honest = await Promise.all(HONEST_PAGES.map(scan))
  const manipulative = await Promise.all(MANIPULATIVE_PAGES.map(scan))
  const worstHonest = Math.min(...honest.map((r) => r.score.numeric))
  for (const result of manipulative) {
    expect(result.score.numeric).toBeLessThan(worstHonest)
    expect(['A', 'B']).not.toContain(result.score.grade)
  }
})

test('overlapping wording on the same claim counts once', async () => {
  const { patterns } = await scan(MANIPULATIVE_PAGES[0])
  const scarcity = patterns.filter((p) => p.category === 'fake_scarcity')
  expect(scarcity.map((p) => p.element?.text)).not.toContain('2 left in stock')
})

test('still catches a disclosed sharing of personal information', async () => {
  const { patterns } = await scan(MANIPULATIVE_PAGES[3])
  expect(patterns.some((p) => p.category === 'privacy_zuckering')).toBe(true)
})

test('still catches a "Most popular" badge steering a paid plan', async () => {
  const { patterns } = await scan(MANIPULATIVE_PAGES[1])
  expect(patterns.some((p) => p.category === 'fake_hierarchy')).toBe(true)
})

test('a countdown element with deadline wording stays a serious concern', async () => {
  const { patterns } = await scan(MANIPULATIVE_PAGES[0])
  expect(
    patterns.some((p) => p.category === 'fake_urgency' && isSerious(p)),
  ).toBe(true)
})

test('a countdown with an unhelpful class name is still serious', async () => {
  const { patterns } = await scan(MANIPULATIVE_PAGES[2])
  expect(
    patterns.some((p) => p.category === 'fake_urgency' && isSerious(p)),
  ).toBe(true)
})
