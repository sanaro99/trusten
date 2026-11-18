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

describe('subscription traps', () => {
  test('flags an intro price that turns into a full price', async () => {
    const patterns = await analyze(
      '$1 for 4 weeks, then $19.99 every 4 weeks. Subscribe now.',
    )
    expect(patterns.some((p) => p.category === 'forced_continuity')).toBe(true)
  })
  test('flags a charge after a trial', async () => {
    const patterns = await analyze(
      'Credit card required. You will be charged $24/user/month after the trial unless you cancel.',
    )
    expect(patterns.some((p) => p.category === 'forced_continuity')).toBe(true)
  })
  test('flags cancelling only by phone', async () => {
    for (const text of [
      'Cancel anytime by calling us.',
      'To cancel, call us Monday to Friday, 9am to 11am.',
    ]) {
      const patterns = await analyze(text)
      expect(patterns.some((p) => p.category === 'hard_to_cancel')).toBe(true)
    }
  })
  test('does not flag a clear free trial with self-service cancel', async () => {
    const patterns = await analyze(
      'Try it free for 14 days, no card required. Cancel anytime from your account settings.',
    )
    expect(patterns).toHaveLength(0)
  })
})
