import { z } from 'zod'
import type {
  BotVerificationRequest,
  BotVerificationResult,
  BotVerifier,
} from './bot-verifier'

const SiteverifyResponseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  'error-codes': z.array(z.string()).optional(),
})

export interface CloudflareTurnstileOptions {
  secretKey: string
  expectedHostname: string
  expectedAction: string
  siteverifyUrl?: string
  timeoutMs?: number
  fetch?: typeof fetch
}

export class CloudflareTurnstileVerifier implements BotVerifier {
  private readonly fetchImpl: typeof fetch
  private readonly siteverifyUrl: string
  private readonly timeoutMs: number

  constructor(private readonly options: CloudflareTurnstileOptions) {
    this.fetchImpl = options.fetch ?? fetch
    this.siteverifyUrl =
      options.siteverifyUrl ??
      'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    this.timeoutMs = options.timeoutMs ?? 5_000
  }

  async verify(
    request: BotVerificationRequest,
  ): Promise<BotVerificationResult> {
    if (!request.token.trim())
      return { verified: false, reason: 'invalid-token' }

    const body = new URLSearchParams({
      secret: this.options.secretKey,
      response: request.token,
    })
    if (request.remoteIp) body.set('remoteip', request.remoteIp)

    try {
      const response = await this.fetchImpl(this.siteverifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!response.ok) return { verified: false, reason: 'unavailable' }

      const parsed = SiteverifyResponseSchema.safeParse(await response.json())
      if (!parsed.success) return { verified: false, reason: 'unavailable' }

      const result = parsed.data
      if (!result.success) {
        return {
          verified: false,
          reason: 'invalid-token',
          errorCodes: result['error-codes'],
        }
      }
      if (
        result.hostname?.toLowerCase() !==
        this.options.expectedHostname.toLowerCase()
      ) {
        return { verified: false, reason: 'hostname-mismatch' }
      }
      if (result.action !== this.options.expectedAction) {
        return { verified: false, reason: 'action-mismatch' }
      }

      return { verified: true }
    } catch {
      return { verified: false, reason: 'unavailable' }
    }
  }
}
