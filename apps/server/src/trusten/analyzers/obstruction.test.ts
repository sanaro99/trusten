import { describe, expect, test } from 'bun:test'
import type { AnalyzerContext } from '../types'
import { ObstructionAnalyzer } from './obstruction'

async function analyze(text: string) {
  const context: AnalyzerContext = {
    url: 'https://example.com/',
    pageTitle: 'Example',
    domSnapshot: `<main>${text}</main>`,
    visibleText: text,
    screenshotBase64: '',
    networkRequests: [],
    cookies: [],
  }
  return (await new ObstructionAnalyzer().analyze(context)).patterns
}

describe('observed subscription obstruction', () => {
  test('does not infer a paid subscription from a newsletter invitation', async () => {
    expect(
      await analyze(
        'Shop shoes. Sign up and subscribe to our newsletter for updates.',
      ),
    ).toEqual([])
  })

  test('does not infer cancellation difficulty from absent homepage copy', async () => {
    expect(
      await analyze(
        'Join our monthly subscription for $10 per month. Sign up now.',
      ),
    ).toEqual([])
  })

  test('does not treat reassuring cancellation copy as recurring billing evidence', async () => {
    expect(
      await analyze('Join our newsletter. No commitment. Cancel any time.'),
    ).toEqual([])
  })

  test('retains observed phone cancellation friction for a paid subscription', async () => {
    const patterns = await analyze(
      'Sign up for a monthly subscription for $10 per month. Call us to cancel.',
    )
    expect(patterns.some((p) => p.category === 'hard_to_cancel')).toBe(true)
    expect(patterns.some((p) => p.category === 'roach_motel')).toBe(true)
  })

  test('does not infer phone-only friction when self-service cancellation is offered', async () => {
    expect(
      await analyze(
        'Sign up for our monthly subscription. Cancel online or call us to cancel.',
      ),
    ).toEqual([])
  })

  test('retains cancellation friction when online cancellation is explicitly unavailable', async () => {
    const patterns = await analyze(
      'Sign up for our monthly subscription. You cannot cancel online. Call us to cancel.',
    )
    expect(patterns.some((p) => p.category === 'hard_to_cancel')).toBe(true)
    expect(patterns.some((p) => p.category === 'roach_motel')).toBe(true)
  })

  test('retains recurring billing without clear cancellation instructions', async () => {
    const patterns = await analyze(
      'Start your free trial. Your subscription will auto-renew. You will be automatically charged $20 every month.',
    )
    expect(patterns.some((p) => p.category === 'forced_continuity')).toBe(true)
  })
})
