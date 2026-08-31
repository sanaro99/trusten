/**
 * Typed client over the Trusten API.
 *
 * Every response is parsed through the shared schema rather than cast, so a
 * server change that breaks the contract fails here rather than rendering
 * something wrong.
 */
import {
  type AuditRequest,
  AuditStartResponseSchema,
  AuditStatusSchema,
  DomainDetailSchema,
  GlobalStatsSchema,
  HistoryResponseSchema,
  LiveTicketResponseSchema,
  type QuickScanRequest,
  QuickScanResponseSchema,
  ScanDetailSchema,
} from '@trusten/shared/api'
import type { ZodType, z } from 'zod'

const BASE = '/trusten/api'

type Fetcher = typeof globalThis.fetch

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(`Request failed: ${status}`)
    this.name = 'ApiError'
  }
}

export function publicScanErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'TARGET_REJECTED')
    return 'That address cannot be checked safely. Try a public website.'
  if (error instanceof ApiError && error.status === 429)
    return 'You have reached the demo limit. Please try again later.'
  if (error instanceof ApiError && error.code === 'DEMO_BUSY')
    return 'The public demo is busy. Please try again in a moment.'
  if (error instanceof ApiError && error.code?.startsWith('BOT_'))
    return 'We could not complete the visitor check. Please try again.'
  return 'We could not reach the checking service. Try again in a moment.'
}

/**
 * `schema` is constrained to `ZodType` (not `ZodType<T>`) and the result
 * comes from `z.infer<S>` — pinning the Output generic directly breaks
 * inference for any schema with a `.default()`, since Input then diverges
 * from Output and TypeScript can no longer unify both against one `T`.
 */
async function get<S extends ZodType>(
  fetcher: Fetcher,
  path: string,
  schema: S,
  capabilityToken?: string,
): Promise<z.infer<S>> {
  const res = await fetcher(`${BASE}${path}`, {
    headers: capabilityToken
      ? { Authorization: `Bearer ${capabilityToken}` }
      : undefined,
  })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return schema.parse(await res.json())
}

async function post<S extends ZodType>(
  fetcher: Fetcher,
  path: string,
  body: unknown,
  schema: S,
  capabilityToken?: string,
): Promise<z.infer<S>> {
  const res = await fetcher(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(capabilityToken
        ? { Authorization: `Bearer ${capabilityToken}` }
        : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      code?: string
    } | null
    const retryAfter = Number(res.headers.get('retry-after'))
    throw new ApiError(
      res.status,
      body?.code,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    )
  }
  return schema.parse(await res.json())
}

export const api = {
  getStats: (f: Fetcher = fetch) => get(f, '/stats', GlobalStatsSchema),

  getHistory: (limit = 50, f: Fetcher = fetch) =>
    get(f, `/history?limit=${limit}`, HistoryResponseSchema),

  getScan: (id: string, f: Fetcher = fetch) =>
    get(f, `/scan/${encodeURIComponent(id)}`, ScanDetailSchema),

  getDomainDetail: (domain: string, f: Fetcher = fetch) =>
    get(f, `/domain/${encodeURIComponent(domain)}`, DomainDetailSchema),

  startAudit: (req: AuditRequest, f: Fetcher = fetch) =>
    post(f, '/audit', req, AuditStartResponseSchema),

  getAuditStatus: (
    jobId: string,
    capabilityToken: string,
    f: Fetcher = fetch,
  ) =>
    get(
      f,
      `/audit/${encodeURIComponent(jobId)}`,
      AuditStatusSchema,
      capabilityToken,
    ),

  createLiveTicket: (
    jobId: string,
    capabilityToken: string,
    f: Fetcher = fetch,
  ) =>
    post(
      f,
      `/audit/${encodeURIComponent(jobId)}/live-ticket`,
      {},
      LiveTicketResponseSchema,
      capabilityToken,
    ),

  quickScan: (req: QuickScanRequest, f: Fetcher = fetch) =>
    post(f, '/quick-scan', req, QuickScanResponseSchema),
}
