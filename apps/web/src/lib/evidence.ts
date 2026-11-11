/**
 * Where each finding's proof lives on the result page.
 *
 * New results carry a screenshot per finding with the element's position.
 * Older results only have one screenshot per step, so the finding falls back
 * to the step it was found on, without a highlight.
 */
import type { WorkflowStep } from '@trusten/shared/api'
import type { BoundingBox, DetectedPattern } from '@trusten/shared/domain'

export interface FindingEvidence {
  /** Image to show, or undefined when no picture exists for this finding. */
  src?: string
  /** Element position as fractions (0–1) of the image. */
  box?: BoundingBox
  /** The checked page this finding belongs to. */
  step?: WorkflowStep
}

const CAPTURE_FILE = /^step-\d+(?:-view-\d+)?\.jpg$/

function normalize(text: string | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function stepScreenshotUrl(scanId: string, step: WorkflowStep): string {
  return `/trusten/report/${encodeURIComponent(scanId)}/screenshot/${step.stepNumber}`
}

export function hasScreenshot(step: WorkflowStep): boolean {
  return Boolean(step.screenshotPath)
}

/** The step a finding was seen on: same finding first, then same wording, then same page. */
export function stepForFinding(
  steps: readonly WorkflowStep[],
  pattern: DetectedPattern,
): WorkflowStep | undefined {
  const byId = steps.find((step) =>
    step.patternsFound.some((found) => found.id === pattern.id),
  )
  if (byId) return byId
  const text = normalize(pattern.element?.text)
  if (text) {
    const byText = steps.find((step) =>
      step.patternsFound.some(
        (found) =>
          found.category === pattern.category &&
          normalize(found.element?.text) === text,
      ),
    )
    if (byText) return byText
  }
  const page = pattern.url.split('#')[0]
  return steps.find(
    (step) => step.url.split('#')[0] === page && hasScreenshot(step),
  )
}

function validBox(box: BoundingBox | undefined): BoundingBox | undefined {
  if (!box) return undefined
  const values = [box.x, box.y, box.width, box.height]
  if (values.some((value) => !Number.isFinite(value))) return undefined
  if (box.width <= 0 || box.height <= 0) return undefined
  if (box.x < 0 || box.y < 0 || box.x + box.width > 1.001) return undefined
  if (box.y + box.height > 1.001) return undefined
  return box
}

export function findingEvidence(
  scanId: string,
  steps: readonly WorkflowStep[],
  pattern: DetectedPattern,
): FindingEvidence {
  const step = stepForFinding(steps, pattern)
  const capture = pattern.evidence.capture
  if (capture && CAPTURE_FILE.test(capture.file)) {
    return {
      src: `/trusten/report/${encodeURIComponent(capture.scanId)}/capture/${encodeURIComponent(capture.file)}`,
      box: validBox(capture.box),
      step,
    }
  }
  if (step && hasScreenshot(step))
    return { src: stepScreenshotUrl(scanId, step), step }
  if (pattern.evidence.screenshotUrl)
    return { src: pattern.evidence.screenshotUrl, step }
  const inline = pattern.evidence.screenshot
  if (inline && !inline.startsWith('[')) {
    return {
      src: inline.startsWith('data:')
        ? inline
        : `data:image/jpeg;base64,${inline}`,
      step,
    }
  }
  return { step }
}

export interface FocusView {
  /** Picture width as a multiple of the frame width. */
  zoom: number
  /** Picture offset, in frame widths (zero or negative). */
  left: number
  top: number
  /** Frame height, in frame widths. */
  height: number
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

/**
 * Zoom and offset that keep the outlined element in the middle of a
 * landscape frame, so a footer link is not lost at the bottom of a page.
 * `ratio` is the picture's height divided by its width.
 */
export function focusView(
  box: BoundingBox,
  ratio: number,
  frame = 0.625,
): FocusView {
  const height = Math.min(frame, ratio)
  const fitWidth = 0.8 / Math.max(box.width, 0.01)
  const fitHeight = (height * 0.75) / Math.max(box.height * ratio, 0.001)
  const zoom = clamp(
    Math.min(2.5, fitWidth, fitHeight),
    Math.max(1, height / ratio),
    2.5,
  )
  const centerX = (box.x + box.width / 2) * zoom
  const centerY = (box.y + box.height / 2) * zoom * ratio
  return {
    zoom,
    left: clamp(0.5 - centerX, 1 - zoom, 0),
    top: clamp(height / 2 - centerY, height - zoom * ratio, 0),
    height,
  }
}
