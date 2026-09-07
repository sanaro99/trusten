import { expect, test } from '@playwright/test'

test('landing surfaces use a coherent lavender raised and inset language', async ({
  page,
}) => {
  await page.goto('/')

  const auditCard = page.locator('form.card').first()
  const addressInput = page.locator('#site')

  const [cardStyles, inputStyles] = await Promise.all([
    auditCard.evaluate((element) => ({
      backgroundColor: getComputedStyle(element).backgroundColor,
      boxShadow: getComputedStyle(element).boxShadow,
    })),
    addressInput.evaluate((element) => ({
      boxShadow: getComputedStyle(element).boxShadow,
    })),
  ])

  expect(cardStyles.backgroundColor).toBe('rgb(244, 241, 249)')
  expect(cardStyles.boxShadow).toContain('rgb(255, 255, 255)')
  expect(cardStyles.boxShadow).toContain('rgba(160, 150, 181')
  expect(inputStyles.boxShadow).toContain('inset')
})

test('pointer press is communicated by inset shadow without a hard boundary', async ({
  page,
}) => {
  await page.goto('/')

  const button = page.getByRole('button', { name: 'Check this site' })
  const before = await button.evaluate((element) => ({
    borderColor: getComputedStyle(element).borderColor,
  }))
  const box = await button.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  const pressed = await button.evaluate((element) => ({
    borderColor: getComputedStyle(element).borderColor,
    boxShadow: getComputedStyle(element).boxShadow,
    outlineStyle: getComputedStyle(element).outlineStyle,
    outlineWidth: getComputedStyle(element).outlineWidth,
  }))
  await page.mouse.up()

  expect.soft(pressed.boxShadow).toContain('inset')
  expect.soft(pressed.borderColor).toBe(before.borderColor)
  expect.soft(pressed.outlineStyle).toBe('none')
  expect.soft(pressed.outlineWidth).toBe('0px')
})

test('keyboard focus stays visible through a high-contrast soft ring', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  const button = page.getByRole('button', { name: 'Check this site' })
  await page.locator('#site').focus()
  await page.keyboard.press('Tab')
  await expect(button).toBeFocused()
  const focused = await button.evaluate((element) => ({
    boxShadow: getComputedStyle(element).boxShadow,
    outlineStyle: getComputedStyle(element).outlineStyle,
    outlineWidth: getComputedStyle(element).outlineWidth,
  }))

  expect(focused.boxShadow).not.toBe('none')
  expect(focused.boxShadow).toContain('6px')
  expect(focused.outlineStyle).toBe('none')
  expect(focused.outlineWidth).toBe('0px')
})

test('landing page explains common pressure tactics in plain language', async ({
  page,
}) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Know when a website is pushing you.' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Everyday website tricks' }),
  ).toBeVisible()
  await expect(page.getByText('A timer that starts again')).toBeVisible()
  await expect(page.getByText('Fees that appear late')).toBeVisible()
})

test('mobile navigation exposes every main destination', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  const navigation = page.getByRole('list', { name: 'Mobile navigation' })
  await expect(navigation.getByRole('link', { name: 'Home' })).toBeVisible()
  await expect(
    navigation.getByRole('link', { name: 'Explore results' }),
  ).toBeVisible()
  await expect(
    navigation.getByRole('link', { name: 'Common tricks' }),
  ).toBeVisible()
  await expect(
    navigation.getByRole('link', { name: 'How it works' }),
  ).toBeVisible()
})
