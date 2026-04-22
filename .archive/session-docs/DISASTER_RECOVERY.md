# KIKO INTELLIGENCE OS — DISASTER RECOVERY RUNBOOK
# ═══════════════════════════════════════════════════
# Last updated: 31 March 2026, Session 8
# Keep this file current after every infrastructure change
# ═══════════════════════════════════════════════════

---

## 1. IMMEDIATE TRIAGE (first 2 minutes)

**Check what's broken:**
```bash
# Health check — tests all 10 systems
curl -s https://vela-platform-one.vercel.app/api/health | python3 -m json.tool

# Ping — is the serverless function even alive?
curl -s https://vela-platform-one.vercel.app/api/ping

# If both fail, Vercel is down → check https://vercel-status.com
```

**Severity classification:**
- 🔴 CRITICAL: Supabase down, Anthropic API down, Kiko endpoint 500s → affects all users
- 🟡 WARNING: Gmail/Calendar auth expired, single cron failing → degraded, not dead
- 🟢 LOW: UI glitch, slow response, non-critical cron → fix in next session

---

## 2. VERCEL ROLLBACK (bad deploy broke the frontend or API)

**Option A: Git tag rollback (preferred)**
```bash
cd /Users/sunny/Desktop/vela-platform

# List recent tags to find a known-good state
git tag --sort=-creatordate | head -10

# Checkout the tag
git checkout <tag-name>

# Deploy from that state
VERCEL_FORCE_NO_BUILD_CACHE=1 npx vercel --prod --yes --force

# Verify
curl -s https://vela-platform-one.vercel.app | grep -o 'index-[A-Za-z0-9_-]*\.js'
curl -s https://vela-platform-one.vercel.app/api/ping

# Once verified, return to main and investigate
git checkout main
```

**Option B: Vercel dashboard rollback**
1. Go to https://vercel.com/sunny-9526s-projects/vela-platform
2. Click "Deployments" tab
3. Find the last working deploy (green checkmark)
4. Click "..." → "Promote to Production"
5. Verify with `curl -s https://vela-platform-one.vercel.app/api/ping`


## 3. DATABASE RECOVERY (Supabase)

### Daily backups (automatic, Pro plan)
- Supabase Pro plan includes daily backups with 7-day retention
- Restore via Dashboard: Project → Database → Backups → Restore

### Point-in-Time Recovery (PITR)
- **HOW TO ENABLE**: Supabase Dashboard → Project Settings → Add-ons → Point in Time Recovery → Enable
- Cost: ~$100/month on top of Pro plan
- Allows restore to any second within the retention window (typically 7 days)
- **When to use**: Accidental mass deletion, data corruption, bad migration

### Manual table backup (before risky operations)
```sql
-- Backup a critical table before changes
CREATE TABLE kiko_deals_backup_YYYYMMDD AS SELECT * FROM deals;

-- Restore from backup
INSERT INTO deals SELECT * FROM kiko_deals_backup_YYYYMMDD
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;

-- Drop backup when confirmed safe
DROP TABLE kiko_deals_backup_YYYYMMDD;
```

### Critical tables (restore priority order)
1. `deals` — 306 active deals, revenue pipeline
2. `contacts` — 5,006 contacts
3. `companies` — 2,244 companies
4. `kiko_user_config` — user authentication/roles
5. `kiko_learning_log` — decision history (feeds Phase 9 pattern matching)
6. `kiko_preferences` — synthesised preferences (feeds Phase 12)
7. `kiko_relationships` — 79 contacts with warmth scores


## 4. GOOGLE AUTH EXPIRED (Gmail/Calendar stop working)

**Symptoms**: Kiko says "AUTH_EXPIRED" when you ask to check email or calendar.

**Fix**:
1. Go to https://vela-platform-one.vercel.app/settings → Accounts tab
2. Click "Reconnect Google Account"
3. Complete OAuth flow
4. Verify: `curl -s https://vela-platform-one.vercel.app/api/health | python3 -m json.tool | grep gmail`

**Root cause**: Google OAuth refresh tokens expire after ~7 days of inactivity or if the user revokes access at https://myaccount.google.com/permissions

---

## 5. ANTHROPIC API DOWN

**Symptoms**: All Kiko responses fail, health check shows `anthropic` failing.

**Check**: https://status.anthropic.com

**Mitigation**: Nothing to do — Kiko depends on Claude. The health check will auto-alert via email. Wait for Anthropic to resolve.

**If key is compromised**:
1. Rotate at https://console.anthropic.com/settings/keys
2. Update in Vercel: Dashboard → Settings → Environment Variables → `ANTHROPIC_KEY`
3. Redeploy: `VERCEL_FORCE_NO_BUILD_CACHE=1 npx vercel --prod --yes --force`

---

## 6. SUPABASE CREDENTIALS ROTATED

If the Supabase service role key needs rotation:
1. Supabase Dashboard → Project Settings → API → Service Role Key → Regenerate
2. Update `.env.local` line 12 with new key
3. Update Vercel: Dashboard → Settings → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY`
4. Redeploy
5. Verify: `curl -s https://vela-platform-one.vercel.app/api/health | python3 -m json.tool | grep supabase`


## 7. MONITORING SETUP

### Better Stack (external uptime)
1. Sign up at https://betterstack.com (free tier: 10 monitors)
2. Create monitor: URL = `https://vela-platform-one.vercel.app/api/ping`
3. Check interval: 60 seconds
4. Alert via: Email (sunny@vanhawke.com)
5. Expected response: HTTP 200, body contains `"status":"ok"`
6. Optional: Create a second monitor for `/api/health` (check every 5 min, slower but tests all systems)

### Gmail alerts (built-in)
- Health check cron runs every 30 minutes
- On failure: sends email to primary user via Gmail API
- On cron watchdog failure: sends email listing missing/failed crons
- No setup needed — active by default

### In-app alerts
- All failures written to `kiko_alerts` table
- Kiko surfaces these in morning briefs and conversations
- Viewable via: "Kiko, show me system alerts"

---

## 8. INFRASTRUCTURE DETAILS

| Component | Dashboard | Status Page |
|-----------|-----------|-------------|
| Vercel | https://vercel.com/sunny-9526s-projects/vela-platform | https://vercel-status.com |
| Supabase | https://supabase.com/dashboard/project/dwiywqeleyckzcxbwrlb | https://status.supabase.com |
| Anthropic | https://console.anthropic.com | https://status.anthropic.com |
| Google APIs | https://console.cloud.google.com | https://status.cloud.google.com |

### Key identifiers
- Supabase project: `dwiywqeleyckzcxbwrlb`
- Supabase org: `35975d96-c2c9-4b6c-b4d4-bb947ae817d5`
- Vercel project: `vela-platform` (sunny-9526s-projects)
- Live URL: `https://vela-platform-one.vercel.app`
- Local codebase: `/Users/sunny/Desktop/vela-platform/`
