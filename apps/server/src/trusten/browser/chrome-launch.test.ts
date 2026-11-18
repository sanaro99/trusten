import { describe, expect, test } from 'bun:test'
import {
  chromeEnvironment,
  chromeLaunchOptions,
  chromeSandboxEnabled,
  explainChromeLaunchError,
} from './chrome-launch'

describe('chrome launch options', () => {
  test('keeps the sandbox on by default', () => {
    expect(chromeSandboxEnabled({})).toBe(true)
    expect(chromeLaunchOptions({}).args).not.toContain('--no-sandbox')
  })

  test('only an explicit opt-out disables the sandbox', () => {
    for (const value of ['off', '0', 'false', 'NO', ' Off ']) {
      const env = { TRUSTEN_CHROME_SANDBOX: value }
      expect(chromeSandboxEnabled(env)).toBe(false)
      expect(chromeLaunchOptions(env).args).toContain('--no-sandbox')
    }
    for (const value of ['', 'on', '1', 'yes', 'nope']) {
      expect(chromeSandboxEnabled({ TRUSTEN_CHROME_SANDBOX: value })).toBe(true)
    }
  })

  test('does not pass server secrets to Chromium', () => {
    const env = chromeEnvironment({
      PATH: '/usr/bin',
      HOME: '/data',
      LC_ALL: 'C.UTF-8',
      HTTPS_PROXY: 'http://proxy:3128',
      DATABASE_URL: 'postgresql://u:p@db/trusten',
      GROQ_API_KEY: 'secret',
      CLOUDFLARE_API_TOKEN: 'secret',
      TRUSTEN_TURNSTILE_SECRET_KEY: 'secret',
    })
    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/data',
      LC_ALL: 'C.UTF-8',
      HTTPS_PROXY: 'http://proxy:3128',
    })
    expect(
      chromeLaunchOptions({ PATH: '/bin', DATABASE_URL: 'x' }).env,
    ).toEqual({ PATH: '/bin' })
  })

  test('explains sandbox start failures', () => {
    const err = explainChromeLaunchError(
      new Error('Running as root without --no-sandbox is not supported.'),
      {},
    )
    expect(err.message).toContain('could not start its sandbox')
    expect(err.message).toContain('TRUSTEN_CHROME_SANDBOX=off')

    const other = new Error('Browser was not found')
    expect(explainChromeLaunchError(other, {})).toBe(other)
  })
})
