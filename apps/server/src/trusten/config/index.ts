import { z } from 'zod'

const nonEmpty = z.string().trim().min(1)

const EnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    TRUSTEN_TURNSTILE_MODE: z.enum(['enforce', 'test', 'off']),
    TRUSTEN_ALLOW_INSECURE_BOT_BYPASS: z.enum(['0', '1']).default('0'),
    TRUSTEN_TURNSTILE_SECRET_KEY: z.string().trim().optional(),
    TRUSTEN_TURNSTILE_EXPECTED_HOSTNAME: z.string().trim().optional(),
    TRUSTEN_TURNSTILE_EXPECTED_ACTION: nonEmpty.default('scan-submit'),
    TRUSTEN_TURNSTILE_SITEVERIFY_URL: z
      .string()
      .url()
      .default('https://challenges.cloudflare.com/turnstile/v0/siteverify'),
    TRUSTEN_TURNSTILE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .max(30_000)
      .default(5_000),
    TRUSTEN_DEMO_SESSION_LIMIT: z.coerce.number().int().positive().default(3),
    TRUSTEN_DEMO_SESSION_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(3_600_000),
    TRUSTEN_DEMO_IP_LIMIT: z.coerce.number().int().positive().default(10),
    TRUSTEN_DEMO_IP_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(3_600_000),
    TRUSTEN_DEMO_DOMAIN_LIMIT: z.coerce.number().int().positive().default(1),
    TRUSTEN_DEMO_DOMAIN_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(600_000),
    TRUSTEN_DEMO_MAX_OUTSTANDING: z.coerce.number().int().positive().default(2),
    TRUSTEN_CAPABILITY_HASH_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      env.TRUSTEN_TURNSTILE_MODE !== 'enforce' &&
      env.TRUSTEN_ALLOW_INSECURE_BOT_BYPASS !== '1'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRUSTEN_TURNSTILE_MODE'],
        message:
          'production requires enforce mode unless TRUSTEN_ALLOW_INSECURE_BOT_BYPASS=1',
      })
    }

    if (env.NODE_ENV === 'production') {
      const capabilityKey = env.TRUSTEN_CAPABILITY_HASH_KEY ?? ''
      if (
        Buffer.byteLength(capabilityKey, 'utf8') < 32 ||
        capabilityKey.includes('REPLACE_')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TRUSTEN_CAPABILITY_HASH_KEY'],
          message: 'must be a non-placeholder secret of at least 32 bytes',
        })
      }
    }

    if (env.TRUSTEN_TURNSTILE_MODE !== 'enforce') return

    if (
      !env.TRUSTEN_TURNSTILE_SECRET_KEY ||
      env.TRUSTEN_TURNSTILE_SECRET_KEY.includes('REPLACE_')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRUSTEN_TURNSTILE_SECRET_KEY'],
        message: 'is required when TRUSTEN_TURNSTILE_MODE=enforce',
      })
    }
    if (
      !env.TRUSTEN_TURNSTILE_EXPECTED_HOSTNAME ||
      env.TRUSTEN_TURNSTILE_EXPECTED_HOSTNAME.includes('REPLACE_')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRUSTEN_TURNSTILE_EXPECTED_HOSTNAME'],
        message: 'is required when TRUSTEN_TURNSTILE_MODE=enforce',
      })
    }
  })

export type TurnstileConfig =
  | { mode: 'off' }
  | { mode: 'test' }
  | {
      mode: 'enforce'
      secretKey: string
      expectedHostname: string
      expectedAction: string
      siteverifyUrl: string
      timeoutMs: number
    }

export interface TrustenConfig {
  environment: 'development' | 'test' | 'production'
  turnstile: TurnstileConfig
  demo: {
    sessionLimit: number
    sessionWindowMs: number
    ipLimit: number
    ipWindowMs: number
    domainLimit: number
    domainWindowMs: number
    maxOutstanding: number
  }
  capabilityHashKey: string
}

/** Parse environment input once at the composition root and inject the result. */
export function loadTrustenConfig(
  source: Record<string, string | undefined> = process.env,
): TrustenConfig {
  const env = EnvironmentSchema.parse({
    ...source,
    TRUSTEN_TURNSTILE_MODE:
      source.TRUSTEN_TURNSTILE_MODE ??
      (source.NODE_ENV === 'production' ? 'enforce' : 'test'),
  })

  const base = {
    environment: env.NODE_ENV,
    capabilityHashKey:
      env.TRUSTEN_CAPABILITY_HASH_KEY ??
      'development-only-capability-key-32-bytes',
    demo: {
      sessionLimit: env.TRUSTEN_DEMO_SESSION_LIMIT,
      sessionWindowMs: env.TRUSTEN_DEMO_SESSION_WINDOW_MS,
      ipLimit: env.TRUSTEN_DEMO_IP_LIMIT,
      ipWindowMs: env.TRUSTEN_DEMO_IP_WINDOW_MS,
      domainLimit: env.TRUSTEN_DEMO_DOMAIN_LIMIT,
      domainWindowMs: env.TRUSTEN_DEMO_DOMAIN_WINDOW_MS,
      maxOutstanding: env.TRUSTEN_DEMO_MAX_OUTSTANDING,
    },
  } as const

  if (env.TRUSTEN_TURNSTILE_MODE === 'off')
    return { ...base, turnstile: { mode: 'off' } }
  if (env.TRUSTEN_TURNSTILE_MODE === 'test')
    return { ...base, turnstile: { mode: 'test' } }

  return {
    ...base,
    turnstile: {
      mode: 'enforce',
      secretKey: env.TRUSTEN_TURNSTILE_SECRET_KEY!,
      expectedHostname: env.TRUSTEN_TURNSTILE_EXPECTED_HOSTNAME!.toLowerCase(),
      expectedAction: env.TRUSTEN_TURNSTILE_EXPECTED_ACTION,
      siteverifyUrl: env.TRUSTEN_TURNSTILE_SITEVERIFY_URL,
      timeoutMs: env.TRUSTEN_TURNSTILE_TIMEOUT_MS,
    },
  }
}
