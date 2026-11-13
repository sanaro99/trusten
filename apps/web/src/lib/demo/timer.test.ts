import { expect, test } from 'bun:test'
import { clockLabel } from './timer.svelte'

test('practice shop countdown reads like a shop timer', () => {
  expect(clockLabel(299)).toBe('04:59')
  expect(clockLabel(600)).toBe('10:00')
  expect(clockLabel(0)).toBe('00:00')
  expect(clockLabel(-3)).toBe('00:00')
})
