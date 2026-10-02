-- Preserve internal audit artifacts for evidence and page caching, while public
-- history counts one completed audit. A text provenance column intentionally
-- survives audit-job retention/deletion.
ALTER TABLE trusten_scans ADD COLUMN parent_audit_id text;
CREATE INDEX trusten_scans_parent_audit_idx ON trusten_scans(parent_audit_id)
  WHERE parent_audit_id IS NOT NULL;
CREATE INDEX trusten_audit_jobs_scan_ids_idx ON trusten_audit_jobs USING gin(scan_ids);

UPDATE trusten_scans s SET parent_audit_id = (
  SELECT j.id FROM trusten_audit_jobs j WHERE j.scan_ids ? s.id
  ORDER BY j.created_at DESC LIMIT 1
)
WHERE COALESCE(s.workflow_id, '') <> 'full-audit'
  AND EXISTS (SELECT 1 FROM trusten_audit_jobs j WHERE j.scan_ids ? s.id);

-- The legacy relationship check also covers artifacts written by older server
-- versions during a rolling update, after this migration has run.
CREATE VIEW trusten_public_scans AS
SELECT s.*, regexp_replace(lower(s.domain), '^www\.', '') AS canonical_domain
FROM trusten_scans s
WHERE s.parent_audit_id IS NULL
  AND (s.workflow_id = 'full-audit' OR NOT EXISTS (
    SELECT 1 FROM trusten_audit_jobs j WHERE j.scan_ids ? s.id
  ));

CREATE INDEX trusten_scans_canonical_domain_created_idx
  ON trusten_scans ((regexp_replace(lower(domain), '^www\.', '')), created_at DESC)
  WHERE parent_audit_id IS NULL;
