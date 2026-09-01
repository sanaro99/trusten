CREATE TABLE trusten_public_scan_sessions (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trusten_public_scan_quota_events (
  id bigserial PRIMARY KEY,
  dimension text NOT NULL CHECK (dimension IN ('session', 'ip', 'domain')),
  quota_key text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trusten_public_scan_quota_events_lookup_idx
  ON trusten_public_scan_quota_events (dimension, quota_key, occurred_at);

CREATE TABLE trusten_public_scan_leases (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX trusten_public_scan_leases_expiry_idx
  ON trusten_public_scan_leases (expires_at);
