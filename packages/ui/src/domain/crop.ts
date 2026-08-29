/**
 * Trusten — cropping a screenshot to one finding.
 *
 * The scanner records a boundingBox for the offending element but the old
 * dashboard never used it: boxes were burned into the image at capture time,
 * so they could not be toggled or tied to what the reader was reading.
 *
 * Here each finding gets its own picture, cropped and zoomed to its own
 * element. One finding, one picture, one highlight — easier to follow than a
 * wide screenshot carrying eight boxes.
 */
import type { BoundingBox } from '@trusten/shared/domain'

export interface ImageSize {
  width: number
  height: number
}

export interface CropOptions {
  /** Context to keep around the element, in image pixels. */
  padding?: number
  /** Smallest acceptable crop width, so a tiny element still has context. */
  minWidth?: number
  /** Width the crop will be displayed at, used to compute `scale`. */
  displayWidth?: number
}

export interface CropResult {
  x: number
  y: number
  width: number
  height: number
  /** Multiply image pixels by this to get display pixels. */
  scale: number
}

export function computeCrop(
  box: BoundingBox | undefined,
  image: ImageSize,
  opts: CropOptions = {},
): CropResult {
  const { padding = 40, minWidth = 0, displayWidth } = opts

  // No box: show the whole page rather than guessing.
  if (!box) {
    return {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
      scale: displayWidth ? displayWidth / image.width : 1,
    }
  }

  let width = Math.max(box.width + padding * 2, minWidth)
  let height = box.height + padding * 2

  // Keep the element centred while widening to the minimum.
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2

  width = Math.min(width, image.width)
  height = Math.min(height, image.height)

  let x = Math.round(centerX - width / 2)
  let y = Math.round(centerY - height / 2)

  // Clamp inside the image.
  x = Math.max(0, Math.min(x, image.width - width))
  y = Math.max(0, Math.min(y, image.height - height))

  return {
    x,
    y,
    width: Math.round(width),
    height: Math.round(height),
    scale: displayWidth ? displayWidth / width : 1,
  }
}
