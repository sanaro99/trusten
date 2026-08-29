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
  DomainSummarySchema,
  GlobalStatsSchema,
  HistoryResponseSchema,
  type QuickScanRequest,
  QuickScanResponseSchema,
  ScanDetailSchema,
} from '@trusten/shared/api'
import type { ZodType, z } from 'zod'

const BASE = '/trusten/api'

type Fetcher = typeof globalThis.fetch

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
): Promise<z.infer<S>> {
  const res = await fetcher(`${BASE}${path}`)
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return schema.parse(await res.json())
}

async function post<S extends ZodType>(
  fetcher: Fetcher,
  path: string,
  body: unknown,
  schema: S,
): Promise<z.infer<S>> {
  const res = await fetcher(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return schema.parse(await res.json())
}

export const api = {
  getStats: (f: Fetcher = fetch) => get(f, '/stats', GlobalStatsSchema),

  getHistory: (limit = 50, f: Fetcher = fetch) =>
    get(f, `/history?limit=${limit}`, HistoryResponseSchema),

  getScan: (id: string, f: Fetcher = fetch) =>
    get(f, `/scan/${encodeURIComponent(id)}`, ScanDetailSchema),

  getDomain: (domain: string, f: Fetcher = fetch) =>
    get(
      f,
      `/domain/${encodeURIComponent(domain)}`,
      DomainSummarySchema.nullable(),
    ),

  startAudit: (req: AuditRequest, f: Fetcher = fetch) =>
    post(f, '/audit', req, AuditStartResponseSchema),

  getAuditStatus: (jobId: string, f: Fetcher = fetch) =>
    get(f, `/audit/${encodeURIComponent(jobId)}`, AuditStatusSchema),

  quickScan: (req: QuickScanRequest, f: Fetcher = fetch) =>
    post(f, '/quick-scan', req, QuickScanResponseSchema),
}
