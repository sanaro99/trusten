import { describe, expect, test } from 'bun:test'
import type { ScanHistoryRow } from '../db'
import { ScanIncompleteError } from '../scan-incomplete-error'
import type { ScanResult } from '../types'
import { publicErrorMessage, publicHistoryRow, publicScan } from './public-scan'

const SERVER_DIR = 'C:\\srv\\trusten\\executions\\scan-1'

function scan(): ScanResult {
  return {
    id: 'scan 1',
    url: 'https://shop.example/',
    domain: 'shop.example',
    scanType: 'deep',
    startedAt: '2026-11-10T00:00:00.000Z',
    completedAt: '2026-11-10T00:01:00.000Z',
    patterns: [],
    score: { numeric: 100, grade: 'A', categoryBreakdown: {}, summary: '' },
    workflowSteps: [
      {
        stepNumber: 1,
        action: 'Open the shop',
        url: 'https://shop.example/',
        screenshot: '[saved]',
        screenshotPath: `${SERVER_DIR}\\step-1.jpg`,
        patternsFound: [],
        timestamp: '2026-11-10T00:00:30.000Z',
      },
      {
        stepNumber: 2,
        action: 'Open a product',
        url: 'https://shop.example/',
        screenshot: '',
        patternsFound: [],
        timestamp: '2026-11-10T00:00:40.000Z',
        status: 'skipped',
      },
    ],
    pdfPath: `${SERVER_DIR}\\report.pdf`,
    htmlPath: '/var/lib/trusten/report.html',
    videoPath: null,
  }
}

describe('public scan responses', () => {
  test('replace server file paths with the public URLs that serve them', () => {
    const result = publicScan(scan())
    expect(JSON.stringify(result)).not.toContain('srv')
    expect(JSON.stringify(result)).not.toContain('/var/lib')
    expect(result.pdfPath).toBe('/trusten/report/scan%201/pdf')
    expect(result.htmlPath).toBe('/trusten/report/scan%201/html')
    expect(result.videoPath).toBeNull()
    expect(result.workflowSteps?.[0].screenshotPath).toBe(
      '/trusten/report/scan%201/screenshot/1',
    )
    expect(result.workflowSteps?.[1]).not.toHaveProperty('screenshotPath')
  })

  test('keep the saved scan untouched for the server to stream files', () => {
    const saved = scan()
    publicScan(saved)
    expect(saved.pdfPath).toBe(`${SERVER_DIR}\\report.pdf`)
    expect(saved.workflowSteps?.[0].screenshotPath).toContain(SERVER_DIR)
  })

  test('replace report paths in history rows', () => {
    const row = {
      id: 'scan-2',
      pdfPath: null,
      htmlPath: `${SERVER_DIR}\\report.html`,
    } as ScanHistoryRow
    expect(publicHistoryRow(row)).toMatchObject({
      pdfPath: null,
      htmlPath: '/trusten/report/scan-2/html',
    })
  })
})

describe('public error messages', () => {
  test('keep plain scan explanations', () => {
    expect(
      publicErrorMessage(new ScanIncompleteError('No pages could be checked.')),
    ).toBe('No pages could be checked.')
  })

  test('hide internal errors that can include server paths', () => {
    const message = publicErrorMessage(
      new Error(
        `ENOENT: no such file or directory, open '${SERVER_DIR}\\step-1.jpg'`,
      ),
    )
    expect(message).not.toContain('srv')
    expect(message).toContain('Please try again')
  })
})
