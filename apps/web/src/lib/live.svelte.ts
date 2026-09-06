/**
 * Live scan state.
 *
 * The old dashboard polled every 3 seconds and rebuilt DOM by string
 * concatenation, because the page had no state model to receive the
 * WebSocket's events into. It always carried progress/frame/done/error; this
 * is the model. Polling survives only as a reconnect fallback.
 */
import { type LiveEvent, LiveEventSchema } from '@trusten/shared/api'
import { api } from './api'

export interface LiveStep {
  step: number
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
      const step = event.step ?? state.steps.length + 1
      if (state.steps.some((s) => s.step === step)) return state
      return {
        ...state,
        steps: [
          ...state.steps.map((s) => ({ ...s, done: true })),
          { step, action: event.action ?? 'Working…', done: false },
        ],
      }
    }

    case 'done':
      return {
        ...state,
        status: 'done',
        steps: state.steps.map((s) => ({ ...s, done: true })),
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
  let state = $state<LiveState>({
    steps: [],
    frame: null,
    status: 'running',
    error: null,
  })

  let socket: WebSocket | null = null

  async function connect(jobId: string, capabilityToken: string) {
    const { ticket } = await api.createLiveTicket(jobId, capabilityToken)
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(
      `${proto}://${location.host}/trusten/api/jobs/${encodeURIComponent(jobId)}/live?ticket=${encodeURIComponent(ticket)}`,
    )
    socket.onmessage = (message) => {
      const parsed = LiveEventSchema.safeParse(JSON.parse(message.data))
      if (parsed.success) state = reduceLiveEvent(state, parsed.data)
    }
  }

  return {
    get state() {
      return state
    },
    connect,
    destroy() {
      socket?.close()
      socket = null
    },
  }
}
