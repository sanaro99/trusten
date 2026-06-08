/**
 * Trusten — URL helpers
 */

/**
 * Canonical cache key for a page: lowercase host + pathname, query/hash dropped,
 * trailing slash trimmed. Pages that differ only by query string collapse to one
 * key (good enough for the deep-scan → quick-scan cache; SPA stages that reuse a
 * single URL also collapse — a known v1 limitation).
 */
export function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    let path = u.pathname.replace(/\/+$/, '')
    if (path === '') path = '/'
    return `${host}${path}`
  } catch {
    return url.trim().toLowerCase()
  }
}
