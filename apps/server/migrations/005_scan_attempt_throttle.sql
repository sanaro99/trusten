CREATE TABLE trusten_public_scan_attempts (
  id text PRIMARY KEY,
  client_ip text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trusten_public_scan_attempts_ip_idx
  ON trusten_public_scan_attempts (client_ip, occurred_at);
