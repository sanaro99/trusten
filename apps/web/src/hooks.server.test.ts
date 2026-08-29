import { afterEach, describe, expect, test } from 'bun:test'
import type { HandleFetch } from '@sveltejs/kit'
import { handleFetch } from './hooks.server'

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
