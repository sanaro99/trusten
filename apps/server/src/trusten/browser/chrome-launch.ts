/**
 * Chromium launch settings for loading untrusted third-party pages.
 *
 * The Chromium sandbox stays on by default: a renderer exploit on a scanned
 * site must not become code execution in the API process. Chromium also gets
 * a minimal environment, so database credentials and LLM API keys held by the
 * server are not copied into the browser processes.
 */

import type { LaunchOptions } from 'puppeteer'

const SANDBOX_OFF_VALUES = new Set(['0', 'false', 'off', 'no'])

// Variables Chromium needs to start, find fonts and locales, or reach an
// operator-configured proxy. Everything else (DATABASE_URL, *_API_KEY, …)
// stays in the server process.
const CHROME_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TZ',
  'LANG',
  'LANGUAGE',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_RUNTIME_DIR',
  'FONTCONFIG_PATH',
  'FONTCONFIG_FILE',
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'CHROME_DEVEL_SANDBOX',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
]

export const CHROME_SANDBOX_ENV = 'TRUSTEN_CHROME_SANDBOX'

export function chromeSandboxEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env[CHROME_SANDBOX_ENV]?.trim().toLowerCase()
  return !(value && SANDBOX_OFF_VALUES.has(value))
}

export function chromeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (CHROME_ENV_ALLOWLIST.includes(key) || key.startsWith('LC_')) {
      out[key] = value
    }
  }
  return out
}

export function chromeLaunchOptions(
  env: NodeJS.ProcessEnv = process.env,
): LaunchOptions {
  const args = ['--disable-blink-features=AutomationControlled']
  if (!chromeSandboxEnabled(env)) args.unshift('--no-sandbox')
  return {
    headless: true,
    args,
    env: chromeEnvironment(env),
  }
}

/** Adds setup guidance to the common "sandbox could not start" failures. */
export function explainChromeLaunchError(
  error: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Error {
  const err = error instanceof Error ? error : new Error(String(error))
  if (!chromeSandboxEnabled(env)) return err
  const message = err.message
  const sandboxProblem =
    /sandbox|namespace|as root|Operation not permitted/i.test(message)
  if (!sandboxProblem) return err
  return new Error(
    `Chromium could not start its sandbox. Run the server as a non-root user ` +
      `with user namespaces allowed (in Docker, use deploy/chrome-seccomp.json; ` +
      `see docs/deployment.md). Only for trusted local development, set ` +
      `${CHROME_SANDBOX_ENV}=off. Original error: ${message}`,
    { cause: err },
  )
}
