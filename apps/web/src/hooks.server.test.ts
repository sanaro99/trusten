import { afterEach, describe, expect, test } from 'bun:test'
import type { Handle, HandleFetch } from '@sveltejs/kit'
import { handle, handleFetch } from './hooks.server'

const originalOrigin = process.env.TRUSTEN_INTERNAL_API_ORIGIN

afterEach(() => {
  if (originalOrigin === undefined) {
    delete process.env.TRUSTEN_INTERNAL_API_ORIGIN
  } else {
    process.env.TRUSTEN_INTERNAL_API_ORIGIN = originalOrigin
  }
})

async function destinationFor(requestUrl: string): Promise<string> {
  let destination = ''
  const fetcher = (async (request: RequestInfo | URL) => {
    destination = new Request(request).url
    return new Response(null, { status: 204 })
  }) as Parameters<HandleFetch>[0]['fetch']

  await handleFetch({
    event: { url: new URL('https://trusten.example/') },
    request: new Request(requestUrl),
    fetch: fetcher,
  } as Parameters<HandleFetch>[0])

  return destination
}

describe('production API forwarding', () => {
  test('sends server-side API requests to the private service', async () => {
    process.env.TRUSTEN_INTERNAL_API_ORIGIN = 'http://api:9200'

    expect(
      await destinationFor(
        'https://trusten.example/trusten/api/history?limit=5',
      ),
    ).toBe('http://api:9200/trusten/api/history?limit=5')
  })

  test('leaves non-API requests on their original origin', async () => {
    process.env.TRUSTEN_INTERNAL_API_ORIGIN = 'http://api:9200'

    expect(await destinationFor('https://trusten.example/explore')).toBe(
      'https://trusten.example/explore',
    )
  })
})

async function browserRequest(request: Request): Promise<Response> {
  return handle({
    event: { request, url: new URL(request.url) },
    resolve: async () => new Response('web route', { status: 404 }),
  } as unknown as Parameters<Handle>[0])
}

describe('direct web server API forwarding', () => {
  test('forwards browser scan body and capability headers and returns the service status', async () => {
    const upstream = Bun.serve({
      port: 0,
      fetch: async (request) =>
        Response.json(
          {
            path: new URL(request.url).pathname + new URL(request.url).search,
            method: request.method,
            body: await request.json(),
            authorization: request.headers.get('authorization'),
            cookie: request.headers.get('cookie'),
            clientIp: request.headers.get('x-trusten-client-ip'),
          },
          { status: 202, headers: { 'X-Service': 'scanner' } },
        ),
    })
    process.env.TRUSTEN_INTERNAL_API_ORIGIN = upstream.url.origin

    try {
      const response = await browserRequest(
        new Request('https://trusten.example/trusten/api/audit?watch=1', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer capability',
            Cookie: 'session=abc',
            'X-Trusten-Client-IP': '203.0.113.99',
          },
          body: JSON.stringify({ url: 'https://example.com' }),
        }),
      )

      expect(response.status).toBe(202)
      expect(response.headers.get('x-service')).toBe('scanner')
      expect(await response.json()).toEqual({
        path: '/trusten/api/audit?watch=1',
        method: 'POST',
        body: { url: 'https://example.com' },
        authorization: 'Bearer capability',
        cookie: 'session=abc',
        clientIp: null,
      })
    } finally {
      upstream.stop(true)
    }
  })

  test('forwards report downloads including their content type and bytes', async () => {
    const upstream = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private' },
        }),
    })
    process.env.TRUSTEN_INTERNAL_API_ORIGIN = upstream.url.origin

    try {
      const response = await browserRequest(
        new Request('https://trusten.example/trusten/report/id/screenshot'),
      )

      expect(response.headers.get('content-type')).toBe('image/png')
      expect(response.headers.get('cache-control')).toBe('private')
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array([137, 80, 78, 71]),
      )
    } finally {
      upstream.stop(true)
    }
  })

  test('leaves web routes, lookalike prefixes, and websocket upgrades to the web server', async () => {
    process.env.TRUSTEN_INTERNAL_API_ORIGIN = 'http://127.0.0.1:1'
    for (const path of [
      '/explore',
      '/trusten/api-other',
      '/trusten/report-other',
    ]) {
      const response = await browserRequest(
        new Request(`https://trusten.example${path}`),
      )
      expect(await response.text()).toBe('web route')
    }
    const upgrade = await browserRequest(
      new Request('https://trusten.example/trusten/api/audit/id/live', {
        headers: { Upgrade: 'websocket' },
      }),
    )
    expect(await upgrade.text()).toBe('web route')
  })

  test('keeps unconfigured browser API requests with the web server', async () => {
    delete process.env.TRUSTEN_INTERNAL_API_ORIGIN
    const response = await browserRequest(
      new Request('https://trusten.example/trusten/api/quick-scan', {
        method: 'POST',
      }),
    )
    expect(await response.text()).toBe('web route')
  })

  test('returns a typed unavailable response without exposing the internal service address', async () => {
    process.env.TRUSTEN_INTERNAL_API_ORIGIN = 'http://127.0.0.1:1'
    const response = await browserRequest(
      new Request('https://trusten.example/trusten/api/quick-scan', {
        method: 'POST',
      }),
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      error: 'The checking service is temporarily unavailable.',
    })
  })
})
