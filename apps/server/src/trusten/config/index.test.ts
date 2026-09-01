import { describe, expect, test } from 'bun:test'
import { loadTrustenConfig } from './index'

describe('loadTrustenConfig', () => {
  test('defaults local development to deterministic test mode', () => {
    expect(loadTrustenConfig({ NODE_ENV: 'development' }).turnstile).toEqual({
      mode: 'test',
    })
  })

  test('defaults production to enforced mode and requires credentials', () => {
    expect(() => loadTrustenConfig({ NODE_ENV: 'production' })).toThrow(
      'TRUSTEN_TURNSTILE_SECRET_KEY',
    )
  })

  test('accepts explicit off and test modes without credentials', () => {
    expect(
      loadTrustenConfig({ TRUSTEN_TURNSTILE_MODE: 'off' }).turnstile,
    ).toEqual({
      mode: 'off',
    })
    expect(
      loadTrustenConfig({ TRUSTEN_TURNSTILE_MODE: 'test' }).turnstile,
    ).toEqual({
      mode: 'test',
    })
  })

  test('rejects enforced mode without a secret and hostname in production', () => {
    expect(() =>
      loadTrustenConfig({
        NODE_ENV: 'production',
        TRUSTEN_TURNSTILE_MODE: 'enforce',
      }),
    ).toThrow('TRUSTEN_TURNSTILE_SECRET_KEY')
  })

  test('rejects production bot-check bypass unless explicitly acknowledged', () => {
    expect(() =>
      loadTrustenConfig({
        NODE_ENV: 'production',
        TRUSTEN_TURNSTILE_MODE: 'test',
        TRUSTEN_CAPABILITY_HASH_KEY: 'a'.repeat(32),
      }),
    ).toThrow('production requires enforce mode')

    expect(
      loadTrustenConfig({
        NODE_ENV: 'production',
        TRUSTEN_TURNSTILE_MODE: 'off',
        TRUSTEN_ALLOW_INSECURE_BOT_BYPASS: '1',
        TRUSTEN_CAPABILITY_HASH_KEY: 'a'.repeat(32),
      }).turnstile,
    ).toEqual({ mode: 'off' })
  })

  test('rejects missing or placeholder capability secrets in production', () => {
    expect(() =>
      loadTrustenConfig({
        NODE_ENV: 'production',
        TRUSTEN_TURNSTILE_MODE: 'off',
        TRUSTEN_ALLOW_INSECURE_BOT_BYPASS: '1',
      }),
    ).toThrow('TRUSTEN_CAPABILITY_HASH_KEY')
    expect(() =>
      loadTrustenConfig({
        NODE_ENV: 'production',
        TRUSTEN_TURNSTILE_MODE: 'off',
        TRUSTEN_ALLOW_INSECURE_BOT_BYPASS: '1',
        TRUSTEN_CAPABILITY_HASH_KEY: 'REPLACE_CAPABILITY_HASH_KEY_123456',
      }),
    ).toThrow('TRUSTEN_CAPABILITY_HASH_KEY')
  })

  test('builds enforced configuration with safe defaults', () => {
    const config = loadTrustenConfig({
      NODE_ENV: 'production',
      TRUSTEN_TURNSTILE_MODE: 'enforce',
      TRUSTEN_TURNSTILE_SECRET_KEY: 'secret',
      TRUSTEN_TURNSTILE_EXPECTED_HOSTNAME: 'Demo.Example.com',
      TRUSTEN_CAPABILITY_HASH_KEY: 'a'.repeat(32),
    })

    expect(config.turnstile).toEqual({
      mode: 'enforce',
      secretKey: 'secret',
      expectedHostname: 'demo.example.com',
      expectedAction: 'scan-submit',
      siteverifyUrl:
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      timeoutMs: 5_000,
    })
  })
})
