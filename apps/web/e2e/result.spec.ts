import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('a result page reads plainly and is accessible', async ({ page }) => {
  const response = await page.request.get(
    'http://localhost:9200/trusten/api/history?limit=1',
  )
  expect(
    response.ok(),
    'The Trusten API must be running on port 9200 for result-page tests',
  ).toBe(true)

  const { scans } = (await response.json()) as { scans: Array<{ id: string }> }
  test.skip(scans.length === 0, 'no scans in the database to render')

  await page.goto(`/scan/${scans[0].id}`)

  const body = await page.textContent('body')
  expect(body).not.toMatch(/confidence/i)
  expect(body).not.toMatch(/\b0\.\d\d\b/)
  expect(body).not.toMatch(/roach motel|zuckering|confirmshaming/i)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(results.violations).toEqual([])
})

test('body text is at least 18px', async ({ page }) => {
  await page.goto('/')
  const size = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.body).fontSize),
  )
  expect(size).toBeGreaterThanOrEqual(18)
})
