import { describe, expect, test } from 'bun:test'
import {
  authorizeTarget,
  isPublicAddress,
  TargetPolicyError,
  type TargetPolicyErrorCode,
  type TargetResolver,
} from './target-policy'

const resolving =
  (...addresses: string[]): TargetResolver =>
  async () =>
    addresses

async function expectCode(
  promise: Promise<unknown>,
  code: TargetPolicyErrorCode,
) {
  try {
    await promise
    throw new Error('Expected target policy to reject')
  } catch (error) {
    expect(error).toBeInstanceOf(TargetPolicyError)
    expect((error as TargetPolicyError).code).toBe(code)
  }
}

describe('authorizeTarget', () => {
  test('canonicalizes a public HTTP(S) target and removes its fragment', async () => {
    const target = await authorizeTarget(
      'HTTPS://Example.COM:443/a/../b?q=1#secret',
      {
        resolver: resolving('93.184.216.34'),
      },
    )

    expect(target).toEqual({
      url: 'https://example.com/b?q=1',
      hostname: 'example.com',
      addresses: ['93.184.216.34'],
    })
  })

  test('rejects unsupported schemes, credentials, and unsafe ports', async () => {
    await expectCode(
      authorizeTarget('file:///etc/passwd'),
      'UNSUPPORTED_SCHEME',
    )
    await expectCode(
      authorizeTarget('https://user:pass@example.com'),
      'CREDENTIALS_NOT_ALLOWED',
    )
    await expectCode(authorizeTarget('http://example.com:22'), 'UNSAFE_PORT')
  })

  test('permits only explicitly configured non-default ports', async () => {
    const target = await authorizeTarget('https://example.com:8443/', {
      resolver: resolving('93.184.216.34'),
      allowedPorts: [8443],
    })
    expect(target.url).toBe('https://example.com:8443/')
  })

  test('rejects a hostname if any DNS answer is non-public', async () => {
    await expectCode(
      authorizeTarget('https://example.com', {
        resolver: resolving('93.184.216.34', '10.0.0.8'),
      }),
      'NON_PUBLIC_ADDRESS',
    )
  })

  test('rejects empty and failed DNS results with typed errors', async () => {
    await expectCode(
      authorizeTarget('https://example.com', { resolver: resolving() }),
      'NO_ADDRESSES',
    )
    await expectCode(
      authorizeTarget('https://example.com', {
        resolver: async () => {
          throw new Error('resolver unavailable')
        },
      }),
      'DNS_LOOKUP_FAILED',
    )
  })

  test('validates IP literals without consulting DNS', async () => {
    let called = false
    const target = await authorizeTarget('https://[2606:4700:4700::1111]/', {
      resolver: async () => {
        called = true
        return []
      },
    })
    expect(called).toBe(false)
    expect(target.addresses).toEqual(['2606:4700:4700::1111'])
  })
})

describe('isPublicAddress', () => {
  test.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '2002:0a00:1::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
  ])('rejects non-public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  test.each([
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8',
  ])('accepts public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(true)
  })
})
