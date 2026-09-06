import { expect, test } from '@playwright/test'

test('dashboard surfaces use a coherent raised and inset neumorphic language', async ({ page }) => {
  await page.goto('/')

  const shell = page.locator('.min-h-screen').first()
  const auditCard = page.locator('form.card').first()
  const addressInput = page.locator('#site')

  const [shellStyles, cardStyles, inputStyles] = await Promise.all([
    shell.evaluate((element) => ({ backgroundColor: getComputedStyle(element).backgroundColor })),
    auditCard.evaluate((element) => ({
      backgroundColor: getComputedStyle(element).backgroundColor,
      boxShadow: getComputedStyle(element).boxShadow,
    })),
    addressInput.evaluate((element) => ({ boxShadow: getComputedStyle(element).boxShadow })),
  ])

  expect(cardStyles.backgroundColor).toBe(shellStyles.backgroundColor)
  expect(cardStyles.boxShadow).toContain('rgb(255, 255, 255)')
  expect(cardStyles.boxShadow).toContain('rgb(184, 185, 190)')
  expect(inputStyles.boxShadow).toContain('inset')
})

test('pointer press is communicated by inset shadow without a hard boundary', async ({ page }) => {
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

test('keyboard focus stays visible through a soft shadow rather than an outline', async ({ page }) => {
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
  expect(focused.boxShadow).toContain('12px')
  expect(focused.outlineStyle).toBe('none')
  expect(focused.outlineWidth).toBe('0px')
})
