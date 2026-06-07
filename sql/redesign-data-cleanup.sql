-- REDESIGN DATA CLEANUP — Run via Kiko or Supabase SQL Editor
-- Addresses Kiko's "honest data beats abundant data" principle
-- Each query is idempotent (safe to run multiple times)

-- 1. ARCHIVE DEAD PIPEDRIVE DEALS (38 Closed Lost polluting pipeline)
UPDATE deals
SET data = data || '{"archived": true, "archive_reason": "pipedrive_import_cleanup"}'::jsonb
WHERE data->>'stage' = 'Closed Lost'
  AND (data->>'source' = 'pipedrive' OR data->>'imported_from' IS NOT NULL)
  AND (data->>'archived')::boolean IS NOT TRUE;

-- 2. LABEL ALPINE TEST CAMPAIGN (inflated metrics from debugging)
UPDATE kiko_sequences
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"is_test": true}'::jsonb
WHERE name ILIKE '%alpine%'
  AND (metadata->>'is_test')::boolean IS NOT TRUE;

-- 3. QUARANTINE EMPTY CONTACTS (no email AND no LinkedIn = dead weight)
UPDATE contacts
SET data = data || '{"needs_enrichment": true}'::jsonb
WHERE (data->>'email' IS NULL OR data->>'email' = '')
  AND (data->>'linkedin' IS NULL OR data->>'linkedin' = '')
  AND (data->>'needs_enrichment')::boolean IS NOT TRUE;

-- 4. AUTO-EXPIRE STALE DRAFTS (>7 days old, 283 pending = panic room)
UPDATE kiko_draft_actions
SET status = 'expired'
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '7 days';

-- 5. DISMISS STALE ALERTS (>14 days old)
UPDATE kiko_alerts SET dismissed = true
WHERE dismissed = false AND created_at < NOW() - INTERVAL '14 days';
