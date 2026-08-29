import { describe, expect, test } from 'bun:test'
import { computeCrop } from './crop'

const image = { width: 1280, height: 3000 }

describe('computeCrop', () => {
  test('centres the crop on the element', () => {
    const box = { x: 500, y: 1000, width: 200, height: 60 }
    const crop = computeCrop(box, image, { padding: 40 })
    expect(crop.x).toBe(460)
    expect(crop.y).toBe(960)
    expect(crop.width).toBe(280)
    expect(crop.height).toBe(140)
  })

  test('never crops outside the image on the top left', () => {
    const box = { x: 5, y: 5, width: 100, height: 20 }
    const crop = computeCrop(box, image, { padding: 40 })
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)
  })

  test('never crops past the bottom right edge', () => {
    const box = { x: 1200, y: 2960, width: 100, height: 60 }
    const crop = computeCrop(box, image, { padding: 40 })
    expect(crop.x + crop.width).toBeLessThanOrEqual(image.width)
    expect(crop.y + crop.height).toBeLessThanOrEqual(image.height)
  })

  test('enforces a minimum crop so a tiny element is not shown alone', () => {
    const box = { x: 600, y: 1500, width: 8, height: 8 }
    const crop = computeCrop(box, image, { padding: 40, minWidth: 320 })
    expect(crop.width).toBeGreaterThanOrEqual(320)
  })

  test('falls back to the top of the page when there is no box', () => {
    const crop = computeCrop(undefined, image, { padding: 40 })
    expect(crop).toEqual({ x: 0, y: 0, width: 1280, height: 3000, scale: 1 })
  })

  test('reports the scale needed to fit a display width', () => {
    const box = { x: 0, y: 0, width: 640, height: 200 }
    const crop = computeCrop(box, image, { padding: 0, displayWidth: 320 })
    expect(crop.scale).toBeCloseTo(0.5)
  })
})
