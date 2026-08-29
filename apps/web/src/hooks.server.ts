import type { HandleFetch } from '@sveltejs/kit'

/**
 * SvelteKit's server-side loads use event.fetch with a relative API path.
 * In production that request must go directly to the private API service;
 * browser requests still use the public same-origin path through Caddy.
 */
export const handleFetch: HandleFetch = async ({ request, fetch }) => {
  const internalOrigin = process.env.TRUSTEN_INTERNAL_API_ORIGIN
  const url = new URL(request.url)

  if (internalOrigin && url.pathname.startsWith('/trusten/api/')) {
    const upstream = new URL(url.pathname + url.search, internalOrigin)
    return fetch(new Request(upstream, request))
  }

  return fetch(request)
}
