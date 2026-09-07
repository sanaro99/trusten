import { expect, test } from '@playwright/test'

test('the home page asks for one thing', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Website address')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Check this site' }),
  ).toBeVisible()
})

test('the full check explains what it will and will not do', async ({
  page,
}) => {
  await page.goto('/audit')

  await expect(
    page.getByRole('heading', {
      name: 'See what happens beyond the first page.',
    }),
  ).toBeVisible()
  await expect(page.getByLabel('Website address')).toBeVisible()
  await expect(page.getByText('does not place an order')).toBeVisible()
  await expect(
    page.getByText('If the website blocks part of the check'),
  ).toBeVisible()
})

test('an empty submission explains itself in a sentence', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Check this site' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('Please type')
})

test('every interactive target meets the 44px minimum', async ({ page }) => {
  await page.goto('/')
  for (const element of await page.locator('button, a, input').all()) {
    const box = await element.boundingBox()
    if (box) expect(box.height).toBeGreaterThanOrEqual(44)
  }
})
