-- Extension results are analyzed from page content the client submitted, so
-- anyone can post made-up HTML for any website. Keep them available by id for
-- the person who ran the check, but out of public history, domain grades,
-- statistics and quick-scan reuse. Only pages Trusten loaded itself count.
ALTER TABLE trusten_scans ADD COLUMN source text NOT NULL DEFAULT 'server'
  CHECK (source IN ('server', 'extension'));

UPDATE trusten_scans SET source = 'extension'
WHERE workflow_steps #>> '{0,action}' = 'Inspect the page captured by the browser extension';

-- The column list of s.* changes, so the view must be recreated, not replaced.
-- The action check also covers rows written by an older server version during
-- a rolling update, which insert the column default.
DROP VIEW trusten_public_scans;
CREATE VIEW trusten_public_scans AS
SELECT s.*, regexp_replace(lower(s.domain), '^www\.', '') AS canonical_domain
FROM trusten_scans s
WHERE s.parent_audit_id IS NULL
  AND s.source = 'server'
  AND COALESCE(s.workflow_steps #>> '{0,action}', '')
    <> 'Inspect the page captured by the browser extension'
  AND (s.workflow_id = 'full-audit' OR NOT EXISTS (
    SELECT 1 FROM trusten_audit_jobs j WHERE j.scan_ids ? s.id
  ));
