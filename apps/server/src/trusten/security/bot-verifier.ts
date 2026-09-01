export interface BotVerificationRequest {
  token: string
  remoteIp?: string
}

export type BotVerificationResult =
  | { verified: true }
  | {
      verified: false
      reason:
        | 'invalid-token'
        | 'hostname-mismatch'
        | 'action-mismatch'
        | 'unavailable'
      errorCodes?: string[]
    }

export interface BotVerifier {
  verify(request: BotVerificationRequest): Promise<BotVerificationResult>
}

/** Deterministic adapter for tests and explicitly configured local environments. */
export class FakeBotVerifier implements BotVerifier {
  constructor(
    private readonly result: BotVerificationResult = { verified: true },
  ) {}

  async verify(
    _request: BotVerificationRequest,
  ): Promise<BotVerificationResult> {
    return this.result
  }
}
