import { env } from '$env/dynamic/public'

const SCRIPT_ID = 'trusten-turnstile-script'
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SCRIPT_LOAD_TIMEOUT_MS = 10_000
const WIDGET_EXECUTION_TIMEOUT_MS = 30_000

interface TurnstileApi {
  execute(widgetId: string): void
  remove(widgetId: string): void
  render(
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      appearance: 'interaction-only'
      execution: 'execute'
      callback(token: string): void
      'error-callback'(): void
      'expired-callback'(): void
      'timeout-callback'(): void
      'unsupported-callback'(): void
    },
  ): string
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise

  const loading = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      script.removeEventListener('load', ready)
      script.removeEventListener('error', failed)
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      // A stalled script tag would make every later attempt subscribe to the
      // same never-firing element. Removing it lets the next request retry.
      script.remove()
      reject(error)
    }
    const ready = () => {
      if (settled) return
      if (!window.turnstile) {
        fail(new Error('Turnstile did not become available'))
        return
      }
      settled = true
      cleanup()
      resolve(window.turnstile)
    }
    const failed = () => fail(new Error('Turnstile could not be loaded'))
    script.addEventListener('load', ready, { once: true })
    script.addEventListener('error', failed, { once: true })
    if (!existing) {
      script.id = SCRIPT_ID
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
    timeoutId = setTimeout(
      () => fail(new Error('Turnstile took too long to load')),
      SCRIPT_LOAD_TIMEOUT_MS,
    )
  }).catch((error) => {
    scriptPromise = null
    throw error
  })
  scriptPromise = loading
  return loading
}

/** Complete the managed check immediately before submitting a scan. */
export async function getTurnstileToken(
  container: HTMLElement,
  _action: 'quick_scan' | 'audit_scan',
): Promise<string | undefined> {
  const sitekey = env.PUBLIC_TURNSTILE_SITE_KEY?.trim()
  if (!sitekey) return undefined

  const turnstile = await loadTurnstile()
  return new Promise<string>((resolve, reject) => {
    let widgetId: string | undefined
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const removeWidget = () => {
      if (!widgetId) return
      try {
        turnstile.remove(widgetId)
      } catch {
        // Removing a broken widget must not leave the caller's promise pending.
      }
      widgetId = undefined
    }
    const finish = (result: { token: string } | { error: Error }) => {
      if (settled) return
      settled = true
      if (timeoutId) clearTimeout(timeoutId)
      removeWidget()
      if ('token' in result) resolve(result.token)
      else reject(result.error)
    }

    try {
      widgetId = turnstile.render(container, {
        sitekey,
        // One action is shared by both public scan forms so the server can bind
        // every accepted token to this admission seam.
        action: 'scan-submit',
        appearance: 'interaction-only',
        execution: 'execute',
        callback: (token) => finish({ token }),
        'error-callback': () =>
          finish({ error: new Error('The bot check could not be completed') }),
        'expired-callback': () =>
          finish({ error: new Error('The bot check expired') }),
        'timeout-callback': () =>
          finish({ error: new Error('The bot check timed out') }),
        'unsupported-callback': () =>
          finish({
            error: new Error('The bot check is not supported in this browser'),
          }),
      })
      if (settled) {
        removeWidget()
        return
      }
      timeoutId = setTimeout(
        () => finish({ error: new Error('The bot check took too long') }),
        WIDGET_EXECUTION_TIMEOUT_MS,
      )
      turnstile.execute(widgetId)
    } catch (error) {
      finish({
        error:
          error instanceof Error
            ? error
            : new Error('The bot check could not be completed'),
      })
    }
  })
}
