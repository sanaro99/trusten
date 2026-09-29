-- Capacity expiry and quota refund ownership have different lifetimes.
-- The default preserves inserts from an older application during a rollout.
ALTER TABLE trusten_public_scan_leases ADD COLUMN refund_expires_at timestamptz DEFAULT CURRENT_TIMESTAMP;
UPDATE trusten_public_scan_leases SET refund_expires_at = expires_at;
ALTER TABLE trusten_public_scan_leases ALTER COLUMN refund_expires_at SET NOT NULL;
CREATE INDEX trusten_public_scan_leases_refund_expiry_idx
  ON trusten_public_scan_leases (refund_expires_at);
