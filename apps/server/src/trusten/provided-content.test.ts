import { expect, test } from 'bun:test'
import type { BrowserDriver } from './browser/driver'
import { TrustenEngine } from './index'
import type { ScanStore } from './store'

test('a captured extension verification screen cannot become a clean website result', async () => {
  let saved = false
  const store: ScanStore = {
    saveScan: async () => {
      saved = true
    },
    cachePageFindings: async () => {},
    getCachedPageFindings: async () => null,
  }
  const engine = new TrustenEngine({} as BrowserDriver, undefined, store)
  const error = await engine
    .analyzeProvidedContent(
      'https://www.temu.com/bgn_verification.html',
      '<html><body>Security Verification: Slide to complete the puzzle</body></html>',
      'Security Verification: Slide to complete the puzzle',
      'Security verification',
    )
    .catch((error) => error)
  expect(error.code).toBe('SITE_BLOCKED')
  expect(saved).toBe(false)
})
