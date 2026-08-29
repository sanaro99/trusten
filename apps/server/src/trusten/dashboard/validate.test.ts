import { describe, expect, test } from 'bun:test'
import { QuickScanRequestSchema } from '@trusten/shared/api'
import { formatZodError } from './validate'

describe('formatZodError', () => {
  test('names the offending field', () => {
    const result = QuickScanRequestSchema.safeParse({ url: '' })
    expect(result.success).toBe(false)
    if (result.success) return

    const body = formatZodError(result.error)
    expect(body.error).toBe('Invalid request')
    expect(body.fields.url).toBe('url is required')
  })

  test('reports several bad fields at once', () => {
    const schema = QuickScanRequestSchema
    const result = schema.safeParse({ url: 42 })
    expect(result.success).toBe(false)
    if (result.success) return

    const body = formatZodError(result.error)
    expect(Object.keys(body.fields)).toContain('url')
  })
})
