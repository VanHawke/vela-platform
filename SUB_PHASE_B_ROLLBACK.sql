-- SUB_PHASE_B_ROLLBACK.sql
-- Reverses all Sub-Phase B schema changes.
-- Run in order if Sub-Phase B breaks Kiko.
-- Generated: 2026-04-12

-- 1. Remove Van Hawke org member
DELETE FROM organization_members WHERE user_id = '9f486437-4bf5-4111-abfe-fe19bfa76063';

-- 2. Remove Van Hawke org
DELETE FROM organizations WHERE slug = 'van-hawke';

-- 3. Drop organization_members table (drops RLS + policies + indexes via CASCADE)
DROP TABLE IF EXISTS organization_members CASCADE;

-- 4. Drop organizations table
DROP TABLE IF EXISTS organizations CASCADE;

-- 5. Drop organization_id columns from SHARED tables (if added in Sub-Phase B)
-- NOTE: Sub-Phase B uses the EXISTING org_id columns, not new organization_id columns.
-- If Sub-Phase B adds organization_id to any table, add ALTER TABLE DROP COLUMN here.
-- Currently: no columns to drop because existing org_id is reused.

-- 6. Drop Bible tables (Sub-Phase C — only run if C was started)
DROP TABLE IF EXISTS user_bibles CASCADE;
DROP TABLE IF EXISTS org_bibles CASCADE;
DROP TABLE IF EXISTS kiko_core_bible CASCADE;

-- 7. Drop kiko-health endpoint (manual: delete api/kiko-health.js from filesystem)
-- No SQL needed.

-- VERIFY: After running, confirm:
-- SELECT count(*) FROM organizations; -- should be 0 or table doesn't exist
-- SELECT count(*) FROM organization_members; -- should be 0 or table doesn't exist
-- curl /api/selfcheck -- should still PASS (these tables didn't exist before)
