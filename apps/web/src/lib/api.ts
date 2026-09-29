/**
 * Typed client over the Trusten API.
 *
 * Every response is parsed through the shared schema rather than cast, so a
 * server change that breaks the contract fails here rather than rendering
 * something wrong.
 */
import {
  type AuditRequest,
  AuditRequestSchema,
  AuditStartResponseSchema,
  AuditStatusSchema,
  DomainDetailSchema,
  GlobalStatsSchema,
  HistoryResponseSchema,
  LiveTicketResponseSchema,
  type QuickScanRequest,
  QuickScanRequestSchema,
  QuickScanResponseSchema,
  ScanDetailSchema,
} from '@trusten/shared/api'
import type { ZodType, z } from 'zod'

const BASE = '/trusten/api'

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

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

export class VisitorCheckError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VisitorCheckError'
  }
}

function retryMessage(seconds?: number): string {
  if (!seconds) return 'Please try again later.'
  const amount = seconds < 60 ? Math.ceil(seconds) : Math.ceil(seconds / 60)
  const unit = seconds < 60 ? 'second' : 'minute'
  return `Please try again in ${amount} ${unit}${amount === 1 ? '' : 's'}.`
}

export function publicScanErrorMessage(error: unknown): string {
  if (error instanceof VisitorCheckError)
    return 'We could not complete the visitor check. Please try again.'
  if (!(error instanceof ApiError))
    return 'We could not reach the checking service. Try again in a moment.'
  if (error.code === 'TARGET_REJECTED')
    return 'That address cannot be checked safely. Try a public website.'
  if (error.code === 'SITE_BLOCKED')
    return 'That website blocked the automated check. Open the page in Chrome and use the Trusten Chrome extension to check it.'
  if (error.code === 'PAGE_NOT_READY')
    return 'That page did not finish loading in time. Please try again, or check it with the Trusten Chrome extension.'
  if (error.code === 'PAGE_LOAD_FAILED')
    return 'We could not load that website. Check the address and try again, or use the Trusten Chrome extension on the page.'
  if (error.code === 'SCAN_INCOMPLETE')
    return 'We could not inspect enough of that page to give a result. Try again or check a different URL.'
  if (error.code === 'DOMAIN_QUOTA_EXCEEDED')
    return `This website was checked recently. ${retryMessage(error.retryAfterSeconds)} You can also check a different website.`
  if (
    error.code === 'SESSION_QUOTA_EXCEEDED' ||
    error.code === 'IP_QUOTA_EXCEEDED'
  )
    return `You have reached the demo limit. ${retryMessage(error.retryAfterSeconds)}`
  if (error.status === 429)
    return `Too many requests. ${retryMessage(error.retryAfterSeconds)}`
  if (error.code === 'DEMO_BUSY')
    return 'The public demo is busy. Please try again in a moment.'
  if (error.code?.startsWith('BOT_'))
    return 'We could not complete the visitor check. Please try again.'
  if (error.status === 400)
    return 'Please enter a valid website address and try again.'
  if (error.status === 403)
    return 'That website does not allow this check. Try a different website.'
  if (error.status === 404)
    return 'This check is no longer available. Start a new check.'
  if (error.code === 'SERVICE_UNAVAILABLE')
    return 'The checking service is temporarily unavailable. Try again in a moment.'
  if (error.status >= 500)
    return 'The checking service could not complete this check. Try again or check a different URL.'
  return 'We could not reach the checking service. Try again in a moment.'
}

async function responseError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null)
  const code =
    body !== null &&
    typeof body === 'object' &&
    'code' in body &&
    typeof body.code === 'string'
      ? body.code
      : undefined
  const retryAfter = Number(res.headers.get('retry-after'))
  return new ApiError(
    res.status,
    code,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  )
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
  if (!res.ok) throw await responseError(res)
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
  if (!res.ok) throw await responseError(res)
  return schema.parse(await res.json())
}

function parseScanRequest<S extends ZodType>(
  schema: S,
  request: unknown,
): z.infer<S> {
  const parsed = schema.safeParse(request)
  if (!parsed.success) throw new ApiError(400)
  return parsed.data
}

export const api = {
  getStats: (f: Fetcher = fetch) => get(f, '/stats', GlobalStatsSchema),

  getHistory: (limit = 50, f: Fetcher = fetch) =>
    get(f, `/history?limit=${limit}`, HistoryResponseSchema),

  getScan: (id: string, f: Fetcher = fetch) =>
    get(f, `/scan/${encodeURIComponent(id)}`, ScanDetailSchema),

  getDomainDetail: (domain: string, f: Fetcher = fetch) =>
    get(f, `/domain/${encodeURIComponent(domain)}`, DomainDetailSchema),

  startAudit: async (req: AuditRequest, f: Fetcher = fetch) =>
    post(
      f,
      '/audit',
      parseScanRequest(AuditRequestSchema, req),
      AuditStartResponseSchema,
    ),

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

  quickScan: async (req: QuickScanRequest, f: Fetcher = fetch) =>
    post(
      f,
      '/quick-scan',
      parseScanRequest(QuickScanRequestSchema, req),
      QuickScanResponseSchema,
    ),
}
