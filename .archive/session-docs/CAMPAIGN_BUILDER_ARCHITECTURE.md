# Campaign Builder — Deterministic Architecture

**Date:** 2026-04-08
**Author:** Built after 3 failed prompt-engineering iterations
**Principle:** LLM judgment is unreliable. Move all decisions into code.

---

## The Problem We're Solving

User says "create a campaign". System must produce a specific team + category + 50 real targets + 8 decision-makers + actual enrollments, with ZERO chance of recommending a company already partnered with another F1 team.

Three previous attempts via system prompt rules all failed because the LLM ignored its own retrieved data when it conflicted with training memory.

---

## Failure Modes to Eliminate

| # | Failure | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Recommends Revolut for Banking | LLM ignored f1_partnerships table | Filter happens in SQL, not in LLM |
| 2 | Picks different team each run | LLM non-determinism | Team picked by SQL ORDER BY |
| 3 | Says "let me source 50" instead of doing | LLM treats sourcing as future action | Code calls web_search inline, returns 50 |
| 4 | Ends with "shall I activate?" | LLM defers decisions | Code activates before LLM speaks |
| 5 | Hallucinates competitive landscape | LLM uses training memory | Landscape pulled from SQL |
| 6 | Same partner in wrong category | One-category-per-partner data model | Multi-category mapping table |

---

## Data Layer — Schema Changes

### Existing tables (audit findings)

`f1_partnerships`:
- 406 rows, 20 garbage placeholder rows, 82 with NULL category, 0 with source URLs
- One category per row → wrong model for Revolut (banking + fintech)

`f1_teams`: 11 teams, clean.
`sponsor_categories`: 20 categories, clean.

### New / changed tables

**1. Clean f1_partnerships:**
- Delete garbage rows (`partner_name LIKE '%unknown%' OR LIKE '%not specified%'`)
- Add `related_categories text[]` column for multi-category partners

**2. Add `campaign_targets` table:**
```sql
CREATE TABLE campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES kiko_sequences(id),
  category_id text NOT NULL,
  team_id text NOT NULL,
  rank int NOT NULL,                  -- 1-50, top 8 get enrolled first
  company_name text NOT NULL,
  revenue_estimate text,
  hq_location text,
  rationale text,
  decision_maker_name text,
  decision_maker_title text,
  decision_maker_email text,
  decision_maker_linkedin text,
  enrollment_status text DEFAULT 'sourced',  -- sourced, enrolled, contacted, replied, bounced
  enrolled_at timestamptz,
  source text DEFAULT 'web_search',
  source_url text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, company_name)
);
CREATE INDEX idx_campaign_targets_campaign ON campaign_targets(campaign_id);
CREATE INDEX idx_campaign_targets_status ON campaign_targets(enrollment_status);
```

**3. Add `category_overlaps` table** (defines which categories block which):
```sql
CREATE TABLE category_overlaps (
  primary_category text NOT NULL REFERENCES sponsor_categories(id),
  blocking_category text NOT NULL REFERENCES sponsor_categories(id),
  reason text,
  PRIMARY KEY (primary_category, blocking_category)
);
-- Seed data:
-- banking blocks fintech (and vice versa) — banks ARE fintechs
-- fintech blocks crypto — overlap on payment rails
-- ai_data blocks software — overlap
-- semiconductors blocks robotics — overlap
```

---

## Pipeline Layer — `/api/build-campaign`

**Input:** `{ category: "banking" }` (one of 20 sponsor_categories.id)
**Auth:** Bearer token from Supabase session
**Output:** JSON with full campaign spec

### Deterministic algorithm:

```
STEP 1 — PICK TEAM
  exclusion_categories := [category] + category_overlaps[category]
  blocked_teams := SELECT DISTINCT team_id 
                   FROM f1_partnerships 
                   WHERE category_id = ANY(exclusion_categories) 
                   AND status='active'
                   AND partner_name NOT ILIKE '%unknown%'
  open_teams := all_teams - blocked_teams
  IF open_teams empty: return error "category fully saturated"
  team := open_teams[0]   -- alphabetical for determinism, never random

STEP 2 — FETCH OR CREATE CAMPAIGN SEQUENCE
  sequence := SELECT * FROM kiko_sequences 
              WHERE name ILIKE '%' || team.name || '%' || category.name || '%'
              LIMIT 1
  IF NOT FOUND: create new sequence with default 5-step authority-led template

STEP 3 — BUILD EXCLUSION SET
  exclusion_companies := SELECT DISTINCT lower(partner_name) 
                         FROM f1_partnerships 
                         WHERE status='active' 
                         AND partner_name NOT ILIKE '%unknown%'
                         AND partner_name NOT ILIKE '%not specified%'
                         AND partner_name NOT ILIKE '%not named%'

STEP 4 — SOURCE 50 TARGETS
  prompt := "Find 50 companies in {category}. Exclude these: {exclusion_companies}"
  raw_50 := claude_with_web_search(prompt)
  filtered_50 := raw_50.filter(c => !exclusion_companies.has(lower(c.name)))
  IF filtered_50.length < 30: re-prompt with even larger exclusion list visible
  INSERT INTO campaign_targets (campaign_id, category_id, team_id, rank, ...) 
  VALUES (...) for each of filtered_50[0..50]

STEP 5 — SOURCE DECISION-MAKERS FOR TOP 8
  FOR each of filtered_50[0..8]:
    dm := claude_with_web_search("Who is the CMO/Marketing decision-maker at {company}")
    UPDATE campaign_targets SET decision_maker_* WHERE id=...

STEP 6 — RETURN JSON (do not enroll yet — that's a separate explicit action)
  RETURN {
    team: { id, name, principal },
    category: { id, name },
    why: <generated from team_principal + category facts>,
    criteria: <pulled from category defaults>,
    competitive_landscape: SELECT team, partner_name FROM f1_partnerships 
                          WHERE category_id = ANY(exclusion_categories),
    top_50: filtered_50,
    top_8: filtered_50[0..8] with decision_makers,
    sequence_id,
    enrolled_count: 0,
    next_action: "Call /api/build-campaign/enroll with campaign_id to enroll top 8"
  }
```

**Separate endpoint:** `/api/build-campaign/enroll` takes `{ campaign_id }` and inserts into `kiko_sequence_enrollments`. Two-step so the user reviews before activation.

---

## Presentation Layer — Kiko's Role

When user says "create a campaign for [category]":
1. Kiko calls `build_campaign` tool with `{ category }`
2. Tool returns JSON
3. Kiko narrates the JSON. She does not modify it.
4. She offers ONE button at the end: "Activate" → calls `enroll`

When user says "create a campaign" without specifying category:
1. Kiko asks ONE question: "Which category? (banking, cybersecurity, cloud, telecoms, fintech, gaming, insurance, aerospace)" — this is the only acceptable clarifying question
2. User picks
3. Pipeline runs

The `build_campaign` tool replaces `create_campaign`, `source_companies`, `source_contacts` for this workflow. Kiko cannot recommend targets without calling it.

---

## Test Plan

Before claiming this works, I run these tests myself:

1. `curl /api/build-campaign -d '{"category":"banking"}'`
   - Assert: response is valid JSON
   - Assert: `team.id` is alphabetically first eligible
   - Assert: `top_50.length === 50`
   - Assert: NO entry in top_50 has lowercase name in exclusion set
   - Assert: `Revolut` is NOT in top_50
   - Assert: `competitive_landscape` includes Revolut → Audi
   
2. Run the same call 3 times in a row.
   - Assert: same team picked each time
   - Assert: at least 40/50 targets identical (some web search variance acceptable)

3. `curl /api/build-campaign/enroll -d '{"campaign_id":"..."}'`
   - Assert: 8 rows inserted into `kiko_sequence_enrollments`
   - Assert: returns `{ enrolled: 8 }`

4. From the chat, ask Kiko "create a banking campaign"
   - Assert: she calls `build_campaign` tool
   - Assert: she does NOT mention any company that's in the exclusion set
   - Assert: she does NOT end with a question
   - Assert: she presents the team/category/50/8 structure

If any test fails, I do not say it's done. I fix and re-test.

---

## What this does NOT solve

- LinkedIn automation (still manual)
- Tracking when sponsorships expire (the table has no end-date enforcement)
- The data scraping cron quality issue (still scrapes garbage, but garbage now gets filtered)
- The full Lemlist canvas builder (separate project)

These are explicit non-goals for this build.
