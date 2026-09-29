import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
    ...(process.env.TRUSTEN_USE_SYSTEM_CHROME === '1'
      ? { channel: 'chrome' as const }
      : {}),
  },
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
