/**
 * Live scan state.
 *
 * The old dashboard polled every 3 seconds and rebuilt DOM by string
 * concatenation, because the page had no state model to receive the
 * WebSocket's events into. It always carried progress/frame/done/error; this
 * is the model. Polling survives only as a reconnect fallback.
 */
import {
  type AuditStatus,
  type LiveEvent,
  LiveEventSchema,
} from '@trusten/shared/api'
import { ApiError, api } from './api'

/** Live video is optional: HTTP polling remains authoritative for the result. */
export async function openLiveSocket(
  url: string,
  getTicket: () => Promise<string>,
  onEvent: (event: LiveEvent) => void,
): Promise<WebSocket | null> {
  try {
    const ticket = await getTicket()
    const endpoint = new URL(url)
    endpoint.searchParams.set('ticket', ticket)
    const socket = new WebSocket(endpoint)
    socket.onerror = () => socket.close()
    socket.onmessage = (message) => {
      try {
        const parsed = LiveEventSchema.safeParse(JSON.parse(message.data))
        if (parsed.success) onEvent(parsed.data)
      } catch {
        // A malformed optional frame must not interrupt result polling.
      }
    }
    return socket
  } catch {
    return null
  }
}

export async function pollAuditStatus(
  getStatus: () => Promise<AuditStatus>,
  onStatus: (status: AuditStatus) => void,
  pause = () => new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  signal?: AbortSignal,
): Promise<AuditStatus> {
  let consecutiveErrors = 0
  while (true) {
    signal?.throwIfAborted()
    await pause()
    signal?.throwIfAborted()
    let status: AuditStatus
    try {
      status = await getStatus()
      consecutiveErrors = 0
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      )
        throw error
      consecutiveErrors++
      if (consecutiveErrors >= 5) throw error
      continue
    }
    signal?.throwIfAborted()
    onStatus(status)
    if (status.status === 'done' || status.status === 'failed') return status
  }
}

export interface LiveStep {
  step: number
  sourceStep?: number
  action: string
  done: boolean
}

export interface LiveState {
  steps: LiveStep[]
  frame: string | null
  status: 'running' | 'done' | 'failed'
  error: string | null
}

/**
 * Audit jobs begin with a lightweight homepage scan and append the completed
 * journey scans. The final ID is therefore the durable result with steps and
 * screenshots, not the first ID.
 */
export function completedAuditResultId(scanIds: string[]): string | undefined {
  return scanIds[scanIds.length - 1]
}

/** Pure reducer — the whole transport-independent behaviour, testable alone. */
export function reduceLiveEvent(state: LiveState, event: LiveEvent): LiveState {
  switch (event.type) {
    case 'frame':
      if (!event.data) return state
      return { ...state, frame: `data:image/jpeg;base64,${event.data}` }

    case 'progress': {
      const action = event.action ?? 'Working…'
      const previous = state.steps.at(-1)
      if (previous?.sourceStep === event.step && previous?.action === action)
        return state
      const step = state.steps.length + 1
      return {
        ...state,
        steps: [
          ...state.steps,
          { step, sourceStep: event.step, action, done: false },
        ],
      }
    }

    case 'done':
      return {
        ...state,
        status: 'done',
      }

    case 'error':
      return {
        ...state,
        status: 'failed',
        error: event.message ?? 'Something went wrong while checking.',
      }
  }
}

export function createLiveScan() {
  const initialState = (): LiveState => ({
    steps: [],
    frame: null,
    status: 'running',
    error: null,
  })

  let state = $state<LiveState>(initialState())

  let socket: WebSocket | null = null
  let generation = 0

  async function connect(jobId: string, capabilityToken: string) {
    const currentGeneration = generation
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const nextSocket = await openLiveSocket(
      `${proto}://${location.host}/trusten/api/jobs/${encodeURIComponent(jobId)}/live`,
      async () => (await api.createLiveTicket(jobId, capabilityToken)).ticket,
      (event) => {
        if (currentGeneration === generation)
          state = reduceLiveEvent(state, event)
      },
    )
    if (currentGeneration !== generation) nextSocket?.close()
    else socket = nextSocket
  }

  return {
    get state() {
      return state
    },
    connect,
    update(status: AuditStatus) {
      if (status.status === 'done') {
        state = reduceLiveEvent(state, { type: 'done' })
      } else if (
        status.status === 'running' &&
        status.currentStep &&
        state.steps[state.steps.length - 1]?.action !== status.currentStep
      ) {
        state = reduceLiveEvent(state, {
          type: 'progress',
          action: status.currentStep,
        })
      }
    },
    fail(message: string) {
      state = { ...state, status: 'failed', error: message }
    },
    reset() {
      generation++
      socket?.close()
      socket = null
      state = initialState()
    },
    destroy() {
      generation++
      socket?.close()
      socket = null
    },
  }
}
