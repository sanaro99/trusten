/**
 * Trusten — Live hub
 *
 * Tiny in-memory pub/sub keyed by jobId, used to stream a running Deep Scan to
 * the dashboard over WebSocket: live browser frames (CDP screencast) and
 * step-by-step progress events. No external broker — single-process only.
 */

export interface LiveEvent {
  type: 'frame' | 'progress' | 'done' | 'error'
  /** base64 jpeg for `frame` events */
  data?: string
  step?: number
  total?: number
  url?: string
  action?: string
  patternCount?: number
  grade?: string
  message?: string
}

type Listener = (event: LiveEvent) => void

const channels = new Map<string, Set<Listener>>()
// Keep the latest frame per channel so a late subscriber paints immediately.
const lastFrame = new Map<string, LiveEvent>()

export function publish(key: string, event: LiveEvent): void {
  if (event.type === 'frame') lastFrame.set(key, event)
  const subs = channels.get(key)
  if (!subs) return
  for (const cb of subs) {
    try {
      cb(event)
    } catch {
      /* a dead socket shouldn't break the publisher */
    }
  }
}

export function subscribe(key: string, cb: Listener): () => void {
  let set = channels.get(key)
  if (!set) {
    set = new Set()
    channels.set(key, set)
  }
  set.add(cb)
  const lf = lastFrame.get(key)
  if (lf) {
    try {
      cb(lf)
    } catch {
      /* ignore */
    }
  }
  return () => {
    const s = channels.get(key)
    if (!s) return
    s.delete(cb)
    if (s.size === 0) channels.delete(key)
  }
}

/** Drop a channel's retained frame once a job is fully done. */
export function closeChannel(key: string): void {
  lastFrame.delete(key)
}
