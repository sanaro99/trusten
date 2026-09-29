import type { SQL } from 'bun'
import {
  DEFAULT_ATTEMPT_QUOTA,
  type PublicScanAdmissionPersistence,
  type PublicScanAdmissionReservation,
  type PublicScanAdmissionReservationResult,
  type PublicScanQuotaDimension,
  type WindowQuota,
} from './public-scan-admission'

const ADMISSION_LOCK = 814005240

/**
 * PostgreSQL-backed public admission state. The advisory lock deliberately
 * serializes every admission transaction: a request either writes all three
 * quota events plus its lease, or rolls back without writing any of them.
 */
export class PostgresPublicScanAdmissionPersistence
  implements PublicScanAdmissionPersistence
{
  constructor(private readonly sql: SQL) {}

  async reserve(
    reservation: PublicScanAdmissionReservation,
  ): Promise<PublicScanAdmissionReservationResult> {
    return this.sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${ADMISSION_LOCK})`
      // PostgreSQL owns time so a fast application instance cannot expire a
      // lease created by a slower one.
      const clock = (await tx`SELECT clock_timestamp() AS now`) as Array<{
        now: Date
      }>
      const now = clock[0]?.now ?? new Date(reservation.now)
      const largestWindowMs = Math.max(
        reservation.sessionQuota.windowMs,
        reservation.ipQuota.windowMs,
        reservation.domainQuota.windowMs,
      )
      const oldestTrackedAt = new Date(now.getTime() - largestWindowMs)
      // Expiring capacity must not erase the ownership needed to refund a
      // scan that finishes with a failure after its execution lease expires.
      await tx`DELETE FROM trusten_public_scan_leases WHERE expires_at <= ${now} AND refund_expires_at <= ${now}`
      await tx`
        DELETE FROM trusten_public_scan_quota_events
        WHERE occurred_at <= ${oldestTrackedAt}
      `

      const sessionId = await this.resolveSession(tx, reservation)
      const dimensions = [
        ['session', sessionId, reservation.sessionQuota],
        ['ip', reservation.clientIp, reservation.ipQuota],
        [
          'domain',
          `${reservation.kind}:${reservation.domain}`,
          reservation.domainQuota,
        ],
      ] as const
      for (const [dimension, key, quota] of dimensions) {
        const blocked = await this.quotaBlocked(tx, dimension, key, quota, now)
        if (blocked) return blocked
      }

      const attemptQuota = reservation.attemptQuota ?? DEFAULT_ATTEMPT_QUOTA
      const attemptStart = new Date(now.getTime() - attemptQuota.windowMs)
      await tx`DELETE FROM trusten_public_scan_attempts WHERE occurred_at <= ${attemptStart}`
      const [attempts] = await tx`
        SELECT COUNT(*)::integer AS count, MIN(occurred_at) AS oldest
        FROM trusten_public_scan_attempts
        WHERE client_ip = ${reservation.clientIp} AND occurred_at > ${attemptStart}
      `
      if (Number(attempts?.count ?? 0) >= attemptQuota.limit)
        return {
          allowed: false,
          dimension: 'retry',
          retryAfterMs: Math.max(
            1,
            (attempts.oldest?.getTime() ?? now.getTime()) +
              attemptQuota.windowMs -
              now.getTime(),
          ),
        }

      const outstanding = (await tx`
        SELECT COUNT(*)::integer AS count
        FROM trusten_public_scan_leases
        WHERE expires_at > ${now}
      `) as Array<{ count: number }>
      if (Number(outstanding[0]?.count ?? 0) >= reservation.maxOutstanding) {
        return { allowed: false, dimension: 'capacity', retryAfterMs: 1_000 }
      }

      await tx`
        INSERT INTO trusten_public_scan_sessions (id)
        VALUES (${sessionId})
        ON CONFLICT (id) DO NOTHING
      `
      for (const [dimension, key] of dimensions) {
        await tx`
          INSERT INTO trusten_public_scan_quota_events
            (dimension, quota_key, occurred_at, reservation_id)
          VALUES (${dimension}, ${key}, ${now}, ${reservation.id})
        `
      }
      await tx`
        INSERT INTO trusten_public_scan_leases (id, expires_at, refund_expires_at)
        VALUES (
          ${reservation.id},
          ${new Date(now.getTime() + reservation.leaseDurationMs)},
          ${new Date(now.getTime() + largestWindowMs)}
        )
      `
      await tx`INSERT INTO trusten_public_scan_attempts (id, client_ip, occurred_at) VALUES (${reservation.id}, ${reservation.clientIp}, ${now})`
      return { allowed: true, sessionId }
    })
  }

  async release(id: string, refundQuota = false): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${ADMISSION_LOCK})`
      const deleted = (await tx`
        DELETE FROM trusten_public_scan_leases
        WHERE id = ${id}
        RETURNING id
      `) as Array<{ id: string }>
      if (!deleted.length) return false
      if (refundQuota) {
        await tx`DELETE FROM trusten_public_scan_quota_events WHERE reservation_id = ${id}`
      }
      return true
    })
  }

  private async resolveSession(
    tx: SQL,
    reservation: PublicScanAdmissionReservation,
  ): Promise<string> {
    if (!reservation.anonymousSession) return reservation.generatedSessionId
    const known = (await tx`
      SELECT 1 FROM trusten_public_scan_sessions
      WHERE id = ${reservation.anonymousSession}
      LIMIT 1
    `) as Array<{ '?column?': number }>
    return known.length
      ? reservation.anonymousSession
      : reservation.generatedSessionId
  }

  private async quotaBlocked(
    tx: SQL,
    dimension: PublicScanQuotaDimension,
    key: string,
    quota: WindowQuota,
    now: Date,
  ): Promise<Extract<
    PublicScanAdmissionReservationResult,
    { allowed: false }
  > | null> {
    const windowStart = new Date(now.getTime() - quota.windowMs)
    const rows = (await tx`
      SELECT COUNT(*)::integer AS count, MIN(occurred_at) AS oldest
      FROM trusten_public_scan_quota_events
      WHERE dimension = ${dimension}
        AND quota_key = ${key}
        AND occurred_at > ${windowStart}
    `) as Array<{ count: number; oldest: Date | null }>
    const row = rows[0]
    if (Number(row?.count ?? 0) < quota.limit) return null
    const oldest = row?.oldest?.getTime() ?? now.getTime()
    return {
      allowed: false,
      dimension,
      retryAfterMs: Math.max(0, oldest + quota.windowMs - now.getTime()),
    }
  }
}
