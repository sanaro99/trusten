import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const publicEnv: { PUBLIC_TURNSTILE_SITE_KEY?: string } = {}
mock.module('$env/dynamic/public', () => ({ env: publicEnv }))
const { getTurnstileToken } = await import('./turnstile')

type WidgetOptions = {
  sitekey: string
  action: string
  appearance: 'interaction-only'
  execution: 'execute'
  callback(token: string): void
  'error-callback'(): void
  'expired-callback'(): void
  'timeout-callback'(): void
  'unsupported-callback'(): void
}

type TurnstileApi = {
  execute(widgetId: string): void
  remove(widgetId: string): void
  render(container: HTMLElement, options: WidgetOptions): string
}

class FakeScript {
  id = ''
  src = ''
  async = false
  defer = false
  removed = false
  private readonly listeners = new Map<string, Set<EventListener>>()

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener)
  }

  remove() {
    this.removed = true
  }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type))
    }
  }
}

class FakeDocument {
  readonly scripts: FakeScript[] = []
  readonly head = {
    appendChild: (script: FakeScript) => {
      this.scripts.push(script)
      return script
    },
  }

  createElement(tagName: string) {
    if (tagName !== 'script') throw new Error(`Unexpected element: ${tagName}`)
    return new FakeScript()
  }

  getElementById(id: string) {
    return (
      this.scripts.find((script) => script.id === id && !script.removed) ?? null
    )
  }
}

const originalWindow = globalThis.window
const originalDocument = globalThis.document
const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout
let document: FakeDocument
let timers: Map<number, () => void>
let nextTimerId: number

function runTimers() {
  for (const [id, callback] of [...timers]) {
    timers.delete(id)
    callback()
  }
}

async function flushMicrotasks() {
  await Promise.resolve()
}

beforeEach(() => {
  document = new FakeDocument()
  timers = new Map()
  nextTimerId = 0
  publicEnv.PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key'
  globalThis.window = {} as Window & typeof globalThis
  globalThis.document = document as unknown as Document
  globalThis.setTimeout = ((callback: TimerHandler) => {
    const id = ++nextTimerId
    timers.set(id, () => {
      if (typeof callback === 'function') callback()
    })
    return id as unknown as ReturnType<typeof setTimeout>
  }) as unknown as typeof setTimeout
  globalThis.clearTimeout = ((id: number) => {
    timers.delete(id)
  }) as typeof clearTimeout
})

afterEach(() => {
  globalThis.window = originalWindow
  globalThis.document = originalDocument
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
  delete publicEnv.PUBLIC_TURNSTILE_SITE_KEY
})

describe('getTurnstileToken', () => {
  test('times out a stalled script, removes it, and permits a later retry', async () => {
    const firstAttempt = getTurnstileToken({} as HTMLElement, 'quick_scan')
    expect(document.scripts).toHaveLength(1)

    runTimers()
    await expect(firstAttempt).rejects.toThrow('took too long to load')
    expect(document.scripts[0].removed).toBe(true)

    let options: WidgetOptions | undefined
    const retryApi: TurnstileApi = {
      render: (_container, nextOptions) => {
        options = nextOptions
        return 'retry-widget'
      },
      execute: () => options?.callback('retry-token'),
      remove: () => {},
    }
    const secondAttempt = getTurnstileToken({} as HTMLElement, 'quick_scan')
    expect(document.scripts).toHaveLength(2)
    window.turnstile = retryApi
    document.scripts[1].emit('load')

    await expect(secondAttempt).resolves.toBe('retry-token')
  })

  test('bounds a widget that never responds and removes it before retrying', async () => {
    const removed: string[] = []
    let options: WidgetOptions | undefined
    window.turnstile = {
      render: (_container, nextOptions) => {
        options = nextOptions
        return 'stalled-widget'
      },
      execute: () => {},
      remove: (widgetId) => removed.push(widgetId),
    }

    const stalledAttempt = getTurnstileToken({} as HTMLElement, 'audit_scan')
    await flushMicrotasks()
    runTimers()
    await expect(stalledAttempt).rejects.toThrow('took too long')
    expect(removed).toEqual(['stalled-widget'])

    window.turnstile.execute = () => options?.callback('fresh-token')
    await expect(
      getTurnstileToken({} as HTMLElement, 'audit_scan'),
    ).resolves.toBe('fresh-token')
    expect(removed).toEqual(['stalled-widget', 'stalled-widget'])
  })

  test('rejects and cleans up when Turnstile reports timeout or unsupported', async () => {
    const removed: string[] = []
    let options: WidgetOptions | undefined
    window.turnstile = {
      render: (_container, nextOptions) => {
        options = nextOptions
        return 'callback-widget'
      },
      execute: () => {},
      remove: (widgetId) => removed.push(widgetId),
    }

    const timeoutAttempt = getTurnstileToken({} as HTMLElement, 'quick_scan')
    await flushMicrotasks()
    options?.['timeout-callback']()
    await expect(timeoutAttempt).rejects.toThrow('timed out')

    const unsupportedAttempt = getTurnstileToken(
      {} as HTMLElement,
      'quick_scan',
    )
    await flushMicrotasks()
    options?.['unsupported-callback']()
    await expect(unsupportedAttempt).rejects.toThrow('not supported')
    expect(removed).toEqual(['callback-widget', 'callback-widget'])
  })
})
