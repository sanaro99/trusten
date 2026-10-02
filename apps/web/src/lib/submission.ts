import {
  type HistoryResponse,
  type ScanHistoryRow,
  WebsiteUrlSchema,
} from '@trusten/shared/api'
import { ApiError, api } from './api'

/** Capture the normalized address before any visitor verification awaits. */
export function validateWebsiteInput(input: string): string | null {
  const parsed = WebsiteUrlSchema.safeParse(input)
  return parsed.success ? parsed.data : null
}

function evidenceAddress(input: string): string {
  const url = new URL(input)
  url.hash = ''
  return url.href
}

/** Public saved evidence is a read-only alternative after an admission limit. */
export async function findSavedEvidence(
  error: unknown,
  submittedUrl: string,
  scanType: 'quick' | 'deep',
  getHistory: () => Promise<HistoryResponse> = () => api.getHistory(),
): Promise<ScanHistoryRow | null> {
  if (
    !(error instanceof ApiError) ||
    ![
      'DOMAIN_QUOTA_EXCEEDED',
      'SESSION_QUOTA_EXCEEDED',
      'IP_QUOTA_EXCEEDED',
    ].includes(error.code ?? '')
  )
    return null
  try {
    const target = evidenceAddress(submittedUrl)
    const history = await getHistory()
    return (
      history.scans.find((scan) => {
        if (scan.scanType !== scanType) return false
        try {
          return evidenceAddress(scan.url) === target
        } catch {
          return false
        }
      }) ?? null
    )
  } catch {
    return null
  }
}
