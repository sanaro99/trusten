import type { Handle, HandleFetch } from '@sveltejs/kit'

function isServicePath(pathname: string): boolean {
  return (
    pathname.startsWith('/trusten/api/') ||
    pathname.startsWith('/trusten/report/')
  )
}

async function forward(
  request: Request,
  origin: string,
  fetcher: typeof fetch,
): Promise<Response> {
  try {
    const url = new URL(request.url)
    const upstream = new URL(url.pathname + url.search, origin)
    const forwarded = new Request(upstream, request)
    // Only the public reverse proxy may set the API's trusted client-IP header.
    // A browser reaching the web server directly cannot establish that identity.
    forwarded.headers.delete('x-trusten-client-ip')
    forwarded.headers.delete('host')
    return await fetcher(forwarded)
  } catch {
    return Response.json(
      {
        code: 'SERVICE_UNAVAILABLE',
        error: 'The checking service is temporarily unavailable.',
      },
      { status: 502 },
    )
  }
}

/**
 * Forward browser HTTP requests when running adapter-node directly. Caddy still
 * routes API/report requests and WebSocket upgrades in the deployed stack.
 * Without an internal service origin, SvelteKit keeps its normal route behavior.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const internalOrigin = process.env.TRUSTEN_INTERNAL_API_ORIGIN
  if (
    internalOrigin &&
    isServicePath(event.url.pathname) &&
    event.request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
  ) {
    return forward(event.request, internalOrigin, fetch)
  }
  return resolve(event)
}

/**
 * SvelteKit's server-side loads use event.fetch with a relative API path.
 * In production that request must go directly to the private API service;
 * browser requests use the same-origin path through Caddy or the HTTP hook above.
 */
export const handleFetch: HandleFetch = async ({ request, fetch }) => {
  const internalOrigin = process.env.TRUSTEN_INTERNAL_API_ORIGIN
  const url = new URL(request.url)

  if (internalOrigin && url.pathname.startsWith('/trusten/api/')) {
    return forward(request, internalOrigin, fetch)
  }

  return fetch(request)
}
