import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { readBuildInfo } from './build-info'

const rootPackage = JSON.parse(
  readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
) as { version: string }

describe('readBuildInfo', () => {
  test('reports the release version from the root package', () => {
    expect(readBuildInfo({}).version).toBe(rootPackage.version)
  })

  test('shortens a commit hash and ignores anything else', () => {
    expect(readBuildInfo({ TRUSTEN_COMMIT: '4fde2934384fb38d' }).commit).toBe(
      '4fde293',
    )
    expect(readBuildInfo({ TRUSTEN_COMMIT: 'not a commit' }).commit).toBe('dev')
    expect(readBuildInfo({}).commit).toBe('dev')
  })
})
