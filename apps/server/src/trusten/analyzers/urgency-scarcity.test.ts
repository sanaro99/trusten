import { expect, test } from 'bun:test'
import type { AnalyzerContext } from '../types'
import { UrgencyScarcityAnalyzer } from './urgency-scarcity'

const context: AnalyzerContext = {
  url: 'https://shop.example/',
  pageTitle: 'Shop',
  domSnapshot:
    '<header>TODAY ONLY! $8 PJS (Limit 2)<div class="countdown-label">h</div></header>',
  visibleText: 'TODAY ONLY! $8 PJS (Limit 2) 05:00:00',
  screenshotBase64: '',
  networkRequests: [],
  cookies: [],
}

test('immediately flags a five-hour timer once with readable evidence', async () => {
  const result = await new UrgencyScarcityAnalyzer().analyze(context)
  const timers = result.patterns.filter((p) => p.category === 'fake_urgency')
  expect(timers).toHaveLength(1)
  expect(timers[0].element?.text).toContain('TODAY ONLY')
  expect(timers[0].element?.selector).toContain('countdown')
  expect(timers[0].description).not.toMatch(
    /proving|almost always reset|manufactured|fake deadline/i,
  )
})

test('a purchase quantity limit is not a low stock claim', async () => {
  const result = await new UrgencyScarcityAnalyzer().analyze(context)
  expect(result.patterns.some((p) => p.category === 'fake_scarcity')).toBe(
    false,
  )
})
test('an ordinary crossed-out price does not prove a fake deadline or discount', async () => {
  const result = await new UrgencyScarcityAnalyzer().analyze({
    ...context,
    domSnapshot: '<p><del>$49.99</del> $29.99</p>',
    visibleText: '$49.99 $29.99',
  })
  expect(result.patterns).toHaveLength(0)
})

test('still flags a real low stock claim independently of the timer', async () => {
  const result = await new UrgencyScarcityAnalyzer().analyze({
    ...context,
    visibleText: `${context.visibleText} Only 2 left in stock`,
  })
  expect(result.patterns.some((p) => p.category === 'fake_scarcity')).toBe(true)
  expect(result.patterns.some((p) => p.category === 'fake_urgency')).toBe(true)
})
test('an animated timer with no urgency phrase gets readable evidence rather than a digit label', async () => {
  const result = await new UrgencyScarcityAnalyzer().analyze({
    ...context,
    visibleText: '40% off everything 10 h 06 m 20 s',
  })
  expect(
    result.patterns.filter((p) => p.category === 'fake_urgency'),
  ).toHaveLength(1)
  expect(result.patterns[0].element?.text).not.toBe('h')
})

test('a countdown does not suppress a separate delivery deadline', async () => {
  const result = await new UrgencyScarcityAnalyzer().analyze({
    ...context,
    visibleText:
      'TODAY ONLY! 05:00:00 ' +
      'Product details '.repeat(20) +
      'Free delivery ends soon',
  })
  expect(result.patterns.some((p) => p.element?.text === 'ends soon')).toBe(
    true,
  )
})

test('flags a shipping countdown written with hour, minute and second units', async () => {
  const result = await new UrgencyScarcityAnalyzer().analyze({
    ...context,
    domSnapshot:
      '<div class="announcement">FREE 1-DAY SHIPPING! Get It Tomorrow! <span>00h:38m:41s</span></div>',
    visibleText:
      'FREE 1-DAY SHIPPING! On Orders Over $100! Get It Tomorrow! 00h:38m:41s Shop Now',
  })
  const timers = result.patterns.filter((p) => p.category === 'fake_urgency')
  expect(timers).toHaveLength(1)
  expect(timers[0].element?.text).toBe('00h:38m:41s')
})

test('a duration without seconds is not a running countdown', async () => {
  const result = await new UrgencyScarcityAnalyzer().analyze({
    ...context,
    domSnapshot: '<p>Delivery takes about 2h 30m</p>',
    visibleText: 'Delivery takes about 2h 30m',
  })
  expect(result.patterns).toHaveLength(0)
})
