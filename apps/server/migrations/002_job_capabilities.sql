CREATE TABLE trusten_job_capabilities (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('job', 'live-ticket')),
  job_id text NOT NULL,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] NOT NULL CHECK (
    cardinality(scopes) > 0
    AND array_position(scopes, NULL) IS NULL
    AND scopes <@ ARRAY['status', 'result', 'report', 'artifact', 'live']::text[]
  ),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CHECK (
    (kind = 'job' AND consumed_at IS NULL)
    OR (kind = 'live-ticket' AND scopes = ARRAY['live']::text[])
  )
);

CREATE INDEX trusten_job_capabilities_job_expiry_idx
  ON trusten_job_capabilities (job_id, expires_at);

CREATE INDEX trusten_job_capabilities_active_expiry_idx
  ON trusten_job_capabilities (expires_at)
  WHERE revoked_at IS NULL AND consumed_at IS NULL;
