import { expect, type Page, test } from '@playwright/test'

const savedScan = {
  id: 'reviewable-result',
  url: 'https://example.com/',
  domain: 'example.com',
  scanType: 'deep',
  startedAt: '2026-10-01T00:00:00Z',
  completedAt: '2026-10-01T00:01:00Z',
  patterns: [
    {
      id: 'uncertain',
      category: 'fake_urgency',
      severity: 'low',
      confidence: 0.55,
      description: 'The timer may restart.',
      evidence: { text: 'Offer ends soon' },
      regulatoryViolations: [],
      detectedAt: '2026-10-01T00:00:30Z',
      url: 'https://example.com/',
      pageTitle: 'Example',
    },
  ],
  score: { numeric: 100, grade: 'A', summary: '', categoryBreakdown: {} },
  workflowSteps: [
    {
      stepNumber: 1,
      action: 'Review the homepage',
      url: 'https://example.com/',
      screenshot: '',
      screenshotPath: 'saved.jpg',
      patternsFound: [],
      timestamp: '2026-10-01T00:00:30Z',
      status: 'observed',
      visualCheckAvailable: true,
    },
    {
      stepNumber: 2,
      action: 'Open checkout',
      url: 'https://example.com/checkout',
      screenshot: '',
      patternsFound: [],
      timestamp: '2026-10-01T00:00:40Z',
      status: 'not-reached',
    },
  ],
  pdfPath: null,
  htmlPath: 'report.html',
  videoPath: 'recording.mp4',
}

async function completedAudit(page: Page, cached = true) {
  await page.route('**/trusten/api/audit', (route) =>
    route.fulfill({
      json: {
        jobId: 'job',
        domain: 'example.com',
        capabilityToken: 'capability',
        capabilityExpiresAt: Date.now() + 60_000,
        cached,
      },
    }),
  )
  await page.route('**/trusten/api/audit/job', (route) =>
    route.fulfill({
      json: {
        jobId: 'job',
        status: 'done',
        domain: 'example.com',
        workflows: ['overview'],
        completedWorkflows: ['overview'],
        currentStep: 'done',
        scanIds: [savedScan.id],
        error: null,
        plan: [],
        createdAt: savedScan.startedAt,
        completedAt: savedScan.completedAt,
      },
    }),
  )
  await page.route(`**/trusten/api/scan/${savedScan.id}`, (route) =>
    route.fulfill({ json: savedScan }),
  )
}

for (const path of ['/', '/audit']) {
  test(`${path} rejects malformed addresses without submitting a scan`, async ({
    page,
  }) => {
    let submitted = false
    await page.route('**/trusten/api/quick-scan', (route) => {
      submitted = true
      return route.fulfill({ status: 503 })
    })
    await page.route('**/trusten/api/audit', (route) => {
      submitted = true
      return route.fulfill({ status: 503 })
    })
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Website address').fill('not a website')
    await page
      .getByRole('button', {
        name: path === '/' ? 'Check this site' : 'Start full check',
        exact: true,
      })
      .click()
    await expect(page.getByRole('alert')).toContainText('valid website address')
    expect(submitted).toBe(false)
  })
}

test('a quick submission freezes its normalized target while the request is pending', async ({
  page,
}) => {
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let submittedUrl = ''
  await page.route('**/trusten/api/quick-scan', async (route) => {
    submittedUrl = route.request().postDataJSON().url
    await pending
    await route.fulfill({ status: 503 })
  })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Website address').fill('  example.com/store  ')
  await page
    .getByRole('button', { name: 'Check this site', exact: true })
    .click()
  await expect(page.getByLabel('Website address')).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Checking…', exact: true }),
  ).toBeDisabled()
  expect(submittedUrl).toBe('https://example.com/store')
  release()
  await expect(page.getByLabel('Website address')).toBeEnabled()
})

test('completed full reports preserve uncertain findings, evidence counts, recording and a durable result', async ({
  page,
}) => {
  await completedAudit(page)
  await page.goto('/audit')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Website address').fill('example.com')
  await page
    .getByRole('button', { name: 'Start full check', exact: true })
    .click()
  await expect(
    page.getByText('1 journey step checked.', { exact: true }),
  ).toBeVisible()
  const otherFindings = page.getByText('A few other things worth a look (1)', {
    exact: true,
  })
  await expect(otherFindings).toBeVisible()
  await otherFindings.click()
  await expect(
    page.getByRole('heading', { name: '1. A fake deadline', exact: true }),
  ).toBeVisible()
  await page.getByText('How we worked this out', { exact: true }).click()
  await expect(
    page.getByText('The timer may restart.', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Open saved result', exact: true }),
  ).toHaveAttribute('href', '/scan/reviewable-result?cached=1')
  await expect(page.locator('video[controls]')).toHaveAttribute(
    'src',
    '/trusten/report/reviewable-result/video',
  )
  await expect(
    page.getByRole('link', { name: 'Open HTML report', exact: true }),
  ).toHaveAttribute('href', '/trusten/report/reviewable-result/html')
  await expect(
    page.getByRole('button', { name: 'Check another site', exact: true }),
  ).toBeEnabled()
  await page.reload()
  await expect(page).toHaveURL(/\/scan\/reviewable-result\?cached=1$/)
  await expect(
    page.getByText('A few other things worth a look (1)', { exact: true }),
  ).toBeVisible()
})

test('a failed full check keeps its limited saved evidence available', async ({
  page,
}) => {
  await completedAudit(page, false)
  let streamClosed = false
  await page.route('**/trusten/api/audit/job/live-ticket', (route) =>
    route.fulfill({
      json: { ticket: 'live-ticket', expiresAt: Date.now() + 60_000 },
    }),
  )
  await page.routeWebSocket('**/trusten/api/jobs/job/live*', (socket) => {
    socket.onClose(() => {
      streamClosed = true
    })
    socket.send(
      JSON.stringify({ type: 'progress', action: 'Planning the route' }),
    )
  })
  await page.route('**/trusten/api/audit/job', (route) =>
    route.fulfill({
      json: {
        jobId: 'job',
        status: 'failed',
        domain: 'example.com',
        workflows: ['overview'],
        completedWorkflows: [],
        currentStep: 'blocked',
        scanIds: [savedScan.id],
        error: 'A journey could not finish.',
        plan: [],
        createdAt: savedScan.startedAt,
        completedAt: savedScan.completedAt,
      },
    }),
  )
  await page.goto('/audit')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Website address').fill('example.com')
  await page
    .getByRole('button', { name: 'Start full check', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('stopped the check')
  await expect(
    page.getByRole('link', { name: 'Open saved result', exact: true }),
  ).toHaveAttribute('href', '/scan/reviewable-result')
  await expect(
    page.getByRole('heading', {
      name: 'We could only check part of this website',
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByText('Check complete', { exact: true })).toHaveCount(0)
  await expect.poll(() => streamClosed).toBe(true)
})

test('a saved blocked check offers browser extension help and available report assets', async ({
  page,
}) => {
  await page.route('**/trusten/api/scan/blocked', (route) =>
    route.fulfill({
      json: {
        ...savedScan,
        id: 'blocked',
        scanType: 'quick',
        patterns: [],
        workflowSteps: [],
        pdfPath: 'report.pdf',
      },
    }),
  )
  await page.route('**/trusten/api/quick-scan', (route) =>
    route.fulfill({
      json: {
        scanId: 'blocked',
        domain: 'example.com',
        grade: 'A',
        score: 100,
        patterns: 0,
        cached: true,
      },
    }),
  )
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Website address').fill('example.com')
  await page
    .getByRole('button', { name: 'Check this site', exact: true })
    .click()
  await expect(page).toHaveURL(/\/scan\/blocked\?cached=1$/)
  await expect(
    page.getByRole('link', {
      name: 'Get the Trusten Chrome extension',
      exact: true,
    }),
  ).toHaveAttribute('href', '/extension')
  await expect(
    page.getByRole('link', { name: 'Download report', exact: true }),
  ).toHaveAttribute('href', '/trusten/report/blocked/pdf')
  await expect(page.locator('video[controls]')).toHaveAttribute(
    'src',
    '/trusten/report/blocked/video',
  )
})

test('a demo limit offers a matching saved check without resubmitting', async ({
  page,
}) => {
  await page.route('**/trusten/api/quick-scan', (route) =>
    route.fulfill({ status: 429, json: { code: 'SESSION_QUOTA_EXCEEDED' } }),
  )
  await page.route('**/trusten/api/history?limit=50', (route) =>
    route.fulfill({
      json: {
        total: 1,
        scans: [
          {
            id: 'saved-quick',
            url: 'https://example.com/',
            domain: 'example.com',
            scanType: 'quick',
            workflowId: null,
            startedAt: savedScan.startedAt,
            completedAt: savedScan.completedAt,
            createdAt: savedScan.completedAt,
            scoreNumeric: 80,
            scoreGrade: 'B',
            quickCoverage: 'complete',
            patternCount: 1,
            criticalCount: 0,
            highCount: 0,
            pdfPath: null,
            htmlPath: null,
          },
        ],
      },
    }),
  )
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Website address').fill('example.com')
  await page
    .getByRole('button', { name: 'Check this site', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('demo limit')
  await expect(
    page.getByRole('link', { name: 'Open saved check', exact: true }),
  ).toHaveAttribute('href', '/scan/saved-quick?cached=1')
})
