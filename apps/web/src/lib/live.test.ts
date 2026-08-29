import { describe, expect, test } from 'bun:test'
import { type LiveState, reduceLiveEvent } from './live.svelte'

const empty: LiveState = {
  steps: [],
  frame: null,
  status: 'running',
  error: null,
}

describe('reduceLiveEvent', () => {
  test('adds a step when progress arrives', () => {
    const next = reduceLiveEvent(empty, {
      type: 'progress',
      step: 1,
      total: 4,
      action: 'Looking at the home page',
    })
    expect(next.steps).toHaveLength(1)
    expect(next.steps[0].action).toBe('Looking at the home page')
  })

  test('does not duplicate a step number', () => {
    const once = reduceLiveEvent(empty, {
      type: 'progress',
      step: 1,
      action: 'Looking at the home page',
    })
    const twice = reduceLiveEvent(once, {
      type: 'progress',
      step: 1,
      action: 'Looking at the home page',
    })
    expect(twice.steps).toHaveLength(1)
  })

  test('stores the newest frame without touching steps', () => {
    const next = reduceLiveEvent(empty, { type: 'frame', data: 'abc123' })
    expect(next.frame).toBe('data:image/jpeg;base64,abc123')
    expect(next.steps).toHaveLength(0)
  })

  test('marks the scan done', () => {
    const next = reduceLiveEvent(empty, { type: 'done' })
    expect(next.status).toBe('done')
  })

  test('carries an error message in plain words', () => {
    const next = reduceLiveEvent(empty, {
      type: 'error',
      message: 'We could not open the basket page',
    })
    expect(next.status).toBe('failed')
    expect(next.error).toBe('We could not open the basket page')
  })
})
