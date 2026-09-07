import { expect, test } from '@playwright/test'

test('explore stays available when scan history is unavailable', async ({
  page,
}) => {
  const response = await page.goto('/explore')

  expect(response?.status()).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'See how websites shape your choices' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'The evidence library is taking a break',
    }),
  ).toBeVisible()
})
