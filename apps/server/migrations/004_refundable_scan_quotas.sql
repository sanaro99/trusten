ALTER TABLE trusten_public_scan_quota_events
  ADD COLUMN reservation_id text;

CREATE INDEX trusten_public_scan_quota_events_reservation_idx
  ON trusten_public_scan_quota_events (reservation_id)
  WHERE reservation_id IS NOT NULL;
