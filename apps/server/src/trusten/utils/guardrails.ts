/**
 * Trusten — scan guardrails
 *
 * Compliance/safety before we hit a real site:
 *   - robots.txt: honor Disallow rules for our UA (or `*`)
 *   - per-domain rate limiting: at most 1 scan / domain / window
 *
 * Both are best-effort and in-memory (single process). `TRUSTEN_IGNORE_ROBOTS=1`
 * disables the robots check for local testing.
 */

export const TRUSTEN_UA_TOKEN = 'TrustenBot'

interface RobotsEntry {
  disallowAll: boolean
  disallows: string[]
  fetchedAt: number
}

const ROBOTS_TTL_MS = 60 * 60 * 1000
const robotsCache = new Map<string, RobotsEntry>()

const RATE_WINDOW_MS = Number(process.env.TRUSTEN_RATE_WINDOW_MS ?? 60_000)
const lastScanAt = new Map<string, number>()

function parseRobots(text: string): RobotsEntry {
  // Collect Disallow rules from groups that apply to `*` or our UA token.
  const lines = text.split(/\r?\n/)
  let applies = false
  let sawAnyGroup = false
  const disallows: string[] = []
  let disallowAll = false

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const field = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()

    if (field === 'user-agent') {
      const ua = value.toLowerCase()
      // A blank line resets groups; we approximate by re-evaluating per agent line.
      applies = ua === '*' || ua.includes('trusten')
      sawAnyGroup = true
    } else if (field === 'disallow' && applies) {
      if (value === '/') disallowAll = true
      else if (value) disallows.push(value)
    }
  }

  if (!sawAnyGroup)
    return { disallowAll: false, disallows: [], fetchedAt: Date.now() }
  return { disallowAll, disallows, fetchedAt: Date.now() }
}

async function fetchRobots(origin: string): Promise<RobotsEntry> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': TRUSTEN_UA_TOKEN },
    })
    if (!res.ok)
      return { disallowAll: false, disallows: [], fetchedAt: Date.now() }
    return parseRobots(await res.text())
  } catch {
    // No robots.txt / network error → allow.
    return { disallowAll: false, disallows: [], fetchedAt: Date.now() }
  }
}

export async function isAllowedByRobots(url: string): Promise<boolean> {
  try {
    const u = new URL(url)
    let entry = robotsCache.get(u.origin)
    if (!entry || Date.now() - entry.fetchedAt > ROBOTS_TTL_MS) {
      entry = await fetchRobots(u.origin)
      robotsCache.set(u.origin, entry)
    }
    if (entry.disallowAll) return false
    const path = u.pathname || '/'
    return !entry.disallows.some((d) => path.startsWith(d))
  } catch {
    return true
  }
}

/** Returns false (and does not record) when the domain was scanned too recently. */
export function checkRateLimit(domain: string): boolean {
  const now = Date.now()
  const last = lastScanAt.get(domain) ?? 0
  if (now - last < RATE_WINDOW_MS) return false
  lastScanAt.set(domain, now)
  return true
}
