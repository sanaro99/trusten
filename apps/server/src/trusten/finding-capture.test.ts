import { describe, expect, test } from 'bun:test'
import {
  captureDirectory,
  captureFileName,
  isValidCapture,
  searchText,
} from './finding-capture'

describe('finding screenshots', () => {
  test('accept only screenshot files inside a scan folder', () => {
    expect(isValidCapture({ scanId: 'scan-1-ab', file: 'step-2.jpg' })).toBe(
      true,
    )
    expect(
      isValidCapture({ scanId: 'scan-1-ab', file: 'step-2-view-3.jpg' }),
    ).toBe(true)
    expect(isValidCapture({ scanId: '..', file: 'step-1.jpg' })).toBe(false)
    expect(isValidCapture({ scanId: 'scan-1', file: '../../secret.jpg' })).toBe(
      false,
    )
    expect(isValidCapture({ scanId: 'scan-1', file: 'report.pdf' })).toBe(false)
  })

  test('name the step screenshot and its extra views', () => {
    expect(captureFileName(3, 0)).toBe('step-3.jpg')
    expect(captureFileName(3, 2)).toBe('step-3-view-2.jpg')
  })

  test('find the folder from the scan’s own saved steps', () => {
    expect(
      captureDirectory(
        'scan-1',
        [
          {
            screenshotPath: String.raw`C:\reports\screenshots\scan-1\step-1.jpg`,
          },
        ],
        '/fallback',
      ),
    ).toBe('C:/reports/screenshots/scan-1')
    expect(captureDirectory('scan-2', [], '/reports')).toBe(
      '/reports/screenshots/scan-2',
    )
  })

  test('search for the quote with normal spacing, cut at a word', () => {
    expect(searchText('  Only\n2   left ')).toBe('Only 2 left')
    const long = searchText(`${'word '.repeat(30)}end`)
    expect(long.length).toBeLessThanOrEqual(80)
    expect(long.endsWith('word')).toBe(true)
  })
})
