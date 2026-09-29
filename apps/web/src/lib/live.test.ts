import { afterEach, describe, expect, test } from 'bun:test'
import type { AuditStatus } from '@trusten/shared/api'
import { ApiError } from './api'
import {
  completedAuditResultId,
  type LiveState,
  openLiveSocket,
  pollAuditStatus,
  reduceLiveEvent,
} from './live.svelte'

const empty: LiveState = {
  steps: [],
  frame: null,
  status: 'running',
  error: null,
}

const running: AuditStatus = {
  jobId: 'job',
  status: 'running',
  domain: 'example.com',
  workflows: [],
  completedWorkflows: [],
  currentStep: 'Checking the homepage',
  scanIds: [],
  error: null,
  plan: [],
  createdAt: '2026-09-28T00:00:00Z',
  completedAt: null,
}

const noDelay = async () => {}

describe('audit polling fallback', () => {
  test('stops on authorization or expired-job errors instead of polling forever', async () => {
    for (const status of [403, 404]) {
      let attempts = 0
      const failure = new ApiError(status)
      const outcome = pollAuditStatus(
        async () => {
          attempts++
          if (attempts === 1) throw failure
          return { ...running, status: 'done' }
        },
        () => {},
        noDelay,
      )
      await expect(outcome).rejects.toBe(failure)
      expect(attempts).toBe(1)
    }
  })

  test('recovers after a transient connection error and reports HTTP progress', async () => {
    let attempts = 0
    const progress: string[] = []
    const status = await pollAuditStatus(
      async () => {
        attempts++
        if (attempts === 1) throw new TypeError('network unavailable')
        if (attempts === 2) return running
        return { ...running, status: 'done', scanIds: ['saved-result'] }
      },
      (status) => progress.push(status.status),
      noDelay,
    )
    expect(status.scanIds).toEqual(['saved-result'])
    expect(progress).toEqual(['running', 'done'])
  })

  test('bounds consecutive service outages instead of leaving the check pending', async () => {
    let attempts = 0
    const failure = new ApiError(502, 'SERVICE_UNAVAILABLE')
    await expect(
      pollAuditStatus(
        async () => {
          attempts++
          if (attempts <= 10) throw failure
          return { ...running, status: 'done' }
        },
        () => {},
        noDelay,
      ),
    ).rejects.toBe(failure)
    expect(attempts).toBe(5)
  })
})

const originalWebSocket = globalThis.WebSocket
afterEach(() => {
  globalThis.WebSocket = originalWebSocket
})

describe('optional live connection', () => {
  test('a failed socket closes while malformed frames are ignored', async () => {
    class Socket {
      closed = false
      onerror?: () => void
      onmessage?: (message: { data: string }) => void
      constructor(readonly url: URL) {}
      close() {
        this.closed = true
      }
    }
    globalThis.WebSocket = Socket as unknown as typeof WebSocket
    const events: string[] = []
    const socket = (await openLiveSocket(
      'ws://trusten.example/live',
      async () => 'single-use ticket',
      (event) => events.push(event.type),
    )) as unknown as Socket

    expect(socket.url.searchParams.get('ticket')).toBe('single-use ticket')
    socket.onmessage?.({ data: '<gateway error>' })
    socket.onmessage?.({
      data: JSON.stringify({ type: 'progress', action: 'Checking choices' }),
    })
    expect(events).toEqual(['progress'])
    socket.onerror?.()
    expect(socket.closed).toBe(true)
  })

  test('a live-ticket failure allows HTTP polling to continue', async () => {
    await expect(
      openLiveSocket(
        'ws://trusten.example/live',
        async () => {
          throw new ApiError(503)
        },
        () => {},
      ),
    ).resolves.toBeNull()
  })

  test('a WebSocket construction failure allows HTTP polling to continue', async () => {
    globalThis.WebSocket = class {
      constructor() {
        throw new Error('blocked')
      }
    } as unknown as typeof WebSocket
    await expect(
      openLiveSocket(
        'ws://trusten.example/live',
        async () => 'ticket',
        () => {},
      ),
    ).resolves.toBeNull()
  })
})

describe('reduceLiveEvent', () => {
  test('adds a step when progress arrives', () => {
    const next = reduceLiveEvent(empty, {
      type: 'progress',
      step: 1,
      total: 4,
      action: 'Looking at the home page',
    })
    expect(next.steps).toHaveLength(1)
    expect(next.steps[0].action).toBe('Looking at the home page')
  })

  test('does not duplicate a step number', () => {
    const once = reduceLiveEvent(empty, {
      type: 'progress',
      step: 1,
      action: 'Looking at the home page',
    })
    const twice = reduceLiveEvent(once, {
      type: 'progress',
      step: 1,
      action: 'Looking at the home page',
    })
    expect(twice.steps).toHaveLength(1)
  })

  test('stores the newest frame without touching steps', () => {
    const next = reduceLiveEvent(empty, { type: 'frame', data: 'abc123' })
    expect(next.frame).toBe('data:image/jpeg;base64,abc123')
    expect(next.steps).toHaveLength(0)
  })

  test('marks the scan done', () => {
    const next = reduceLiveEvent(empty, { type: 'done' })
    expect(next.status).toBe('done')
  })

  test('carries an error message in plain words', () => {
    const next = reduceLiveEvent(empty, {
      type: 'error',
      message: 'We could not open the basket page',
    })
    expect(next.status).toBe('failed')
    expect(next.error).toBe('We could not open the basket page')
  })
})

describe('completedAuditResultId', () => {
  test('selects the journey result instead of the preliminary homepage scan', () => {
    expect(
      completedAuditResultId(['quick-scan', 'checkout-scan', 'cancel-scan']),
    ).toBe('cancel-scan')
  })

  test('returns nothing when the audit produced no scans', () => {
    expect(completedAuditResultId([])).toBeUndefined()
  })
})
