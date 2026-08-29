/**
 * Trusten — request validation at the HTTP boundary.
 *
 * Replaces `c.req.json<T>()`, which is a compile-time cast and checks nothing
 * at run time. Errors come back field-by-field so the client can render them
 * next to the input that caused them.
 */
import type { Context } from 'hono'
import type { ZodError, ZodType, z } from 'zod'

export interface ValidationErrorBody {
  error: string
  fields: Record<string, string>
}

export function formatZodError(error: ZodError): ValidationErrorBody {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    if (!fields[key]) fields[key] = issue.message
  }
  return { error: 'Invalid request', fields }
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; body: ValidationErrorBody }

/**
 * Parse and validate a JSON body. Never throws.
 *
 * `schema` is constrained to `ZodType` (not `ZodType<T>`) and the result type
 * comes from `z.infer<S>` — pinning the Output generic directly breaks
 * inference for any schema with a `.default()`, since that makes Input
 * diverge from Output and TypeScript can no longer unify both against one
 * `T`.
 */
export async function parseBody<S extends ZodType>(
  c: Context,
  schema: S,
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return {
      ok: false,
      body: { error: 'Invalid request', fields: { _: 'Body must be JSON' } },
    }
  }

  const result = schema.safeParse(raw)
  if (!result.success) return { ok: false, body: formatZodError(result.error) }
  return { ok: true, data: result.data }
}
