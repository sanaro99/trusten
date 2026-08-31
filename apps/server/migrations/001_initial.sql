CREATE TABLE trusten_scans (
  id text PRIMARY KEY, url text NOT NULL, domain text NOT NULL,
  scan_type text NOT NULL CHECK (scan_type IN ('quick', 'deep')), workflow_id text,
  started_at timestamptz NOT NULL, completed_at timestamptz NOT NULL,
  score_numeric double precision NOT NULL,
  score_grade text NOT NULL CHECK (score_grade IN ('A','B','C','D','F')),
  pattern_count integer NOT NULL DEFAULT 0 CHECK (pattern_count >= 0),
  critical_count integer NOT NULL DEFAULT 0 CHECK (critical_count >= 0),
  high_count integer NOT NULL DEFAULT 0 CHECK (high_count >= 0),
  patterns jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(patterns) = 'array'),
  workflow_steps jsonb CHECK (workflow_steps IS NULL OR jsonb_typeof(workflow_steps) = 'array'),
  pdf_path text, html_path text, video_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trusten_scans_domain_created_idx ON trusten_scans (domain, created_at DESC);
CREATE INDEX trusten_scans_created_idx ON trusten_scans (created_at DESC);

CREATE TABLE trusten_audit_jobs (
  id text PRIMARY KEY, url text NOT NULL, domain text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  workflows jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(workflows) = 'array'),
  scan_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(scan_ids) = 'array'),
  plan jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(plan) = 'array'),
  error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX trusten_audit_jobs_created_idx ON trusten_audit_jobs (created_at DESC);
CREATE INDEX trusten_audit_jobs_status_created_idx ON trusten_audit_jobs (status, created_at);

CREATE TABLE trusten_page_cache (
  url_key text PRIMARY KEY, url text NOT NULL,
  patterns jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(patterns) = 'array'),
  scan_id text REFERENCES trusten_scans(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trusten_page_cache_created_idx ON trusten_page_cache (created_at);
