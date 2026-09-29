import { expect, test } from '@playwright/test'

test('explore stays available when scan history is unavailable', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.route('**/trusten/api/history?limit=200', (route) =>
    route.fulfill({ status: 503, json: { error: 'History unavailable' } }),
  )
  await page.locator('a[href="/explore"]').first().click()

  await expect(page).toHaveURL(/\/explore$/)
  await expect(
    page.getByRole('heading', { name: 'See how websites shape your choices' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'The evidence library is taking a break',
    }),
  ).toBeVisible()
})
