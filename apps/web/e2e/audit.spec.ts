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

test('the full check keeps polling without live video and explains an expired job', async ({
  page,
}) => {
  await page.route('**/trusten/api/audit', (route) =>
    route.fulfill({
      json: {
        jobId: 'expired-job',
        domain: 'example.com',
        capabilityToken: 'test-capability',
        capabilityExpiresAt: Date.now() + 60_000,
      },
    }),
  )
  await page.route('**/trusten/api/audit/expired-job/live-ticket', (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: 'SERVICE_UNAVAILABLE',
        error: 'The checking service is temporarily unavailable.',
      },
    }),
  )
  let polls = 0
  await page.route('**/trusten/api/audit/expired-job', (route) => {
    polls++
    if (polls > 1)
      return route.fulfill({ status: 404, json: { error: 'Not authorized' } })
    return route.fulfill({
      json: {
        jobId: 'expired-job',
        status: 'running',
        domain: 'example.com',
        workflows: [],
        completedWorkflows: [],
        currentStep: 'Checking choices',
        scanIds: [],
        error: null,
        plan: [],
        createdAt: '2026-09-28T00:00:00Z',
        completedAt: null,
      },
    })
  })

  await page.goto('/audit')
  await page.getByLabel('Website address').fill('example.com')
  await page
    .getByRole('button', { name: 'Start full check', exact: true })
    .click()
  await expect(page.getByText('In progress', { exact: true })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByRole('alert')).toContainText('no longer available', {
    timeout: 10_000,
  })
  await expect(
    page.getByRole('button', { name: 'Try again', exact: true }),
  ).toBeEnabled()
  expect(polls).toBe(2)
})

test('the audit result limits its verdict when the overview succeeded but a linked journey was blocked', async ({
  page,
}) => {
  await page.route('**/trusten/api/audit', (route) =>
    route.fulfill({
      json: {
        jobId: 'partial-job',
        domain: 'example.com',
        capabilityToken: 'test-capability',
        capabilityExpiresAt: Date.now() + 60_000,
      },
    }),
  )
  await page.route('**/trusten/api/audit/partial-job/live-ticket', (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: 'SERVICE_UNAVAILABLE',
        error: 'Live video is unavailable.',
      },
    }),
  )
  await page.route('**/trusten/api/audit/partial-job', (route) =>
    route.fulfill({
      json: {
        jobId: 'partial-job',
        status: 'done',
        domain: 'example.com',
        workflows: ['overview', 'pricing'],
        completedWorkflows: ['overview'],
        currentStep: 'done',
        scanIds: ['homepage', 'overview', 'partial-result'],
        error: null,
        plan: [
          {
            id: 'overview',
            name: 'Overview',
            description: 'Inspect the first page.',
            steps: 1,
          },
          {
            id: 'pricing',
            name: 'Pricing',
            description: 'Inspect pricing and checkout.',
            steps: 3,
          },
        ],
        createdAt: '2026-09-28T00:00:00Z',
        completedAt: '2026-09-28T00:01:00Z',
      },
    }),
  )
  await page.route('**/trusten/api/scan/partial-result', (route) =>
    route.fulfill({
      json: {
        id: 'partial-result',
        url: 'https://example.com',
        domain: 'example.com',
        scanType: 'deep',
        startedAt: '2026-09-28T00:00:00Z',
        completedAt: '2026-09-28T00:01:00Z',
        patterns: [],
        score: {
          numeric: 100,
          grade: 'A',
          summary: 'No concerns on inspected pages.',
          categoryBreakdown: {},
        },
        workflowSteps: [
          {
            stepNumber: 1,
            action: 'Inspect the overview.',
            url: 'https://example.com',
            screenshot: '',
            patternsFound: [],
            timestamp: '2026-09-28T00:00:10Z',
            status: 'observed',
          },
          {
            stepNumber: 2,
            action: 'Open the pricing page.',
            url: 'https://example.com/pricing',
            screenshot: '',
            patternsFound: [],
            timestamp: '2026-09-28T00:00:20Z',
            status: 'not-reached',
          },
          {
            stepNumber: 3,
            action: 'Review pricing plans.',
            url: 'https://example.com/pricing',
            screenshot: '',
            patternsFound: [],
            timestamp: '2026-09-28T00:00:20Z',
            status: 'skipped',
          },
          {
            stepNumber: 4,
            action: 'Inspect the first checkout page.',
            url: 'https://example.com/checkout',
            screenshot: '',
            patternsFound: [],
            timestamp: '2026-09-28T00:00:20Z',
            status: 'skipped',
          },
        ],
        pdfPath: null,
        htmlPath: null,
        videoPath: null,
      },
    }),
  )

  await page.goto('/audit')
  await page.getByLabel('Website address').fill('example.com')
  await page
    .getByRole('button', { name: 'Start full check', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'What we found', exact: true }),
  ).toBeVisible({ timeout: 10_000 })
  await expect(
    page.getByRole('heading', {
      name: 'We could only check part of this website',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.locator('.badge').filter({ hasText: 'Limited check' }),
  ).toBeVisible()
  await expect(
    page.getByText('We completed 1 of 4 journey steps.', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'This website looks fair', exact: true }),
  ).toHaveCount(0)
})
