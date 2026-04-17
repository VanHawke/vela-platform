# KIKO SESSION BRIEF
## Last updated: 2026-04-17 — Commit `0cd344d`

---

## QUICK START (paste this to start any session)

```
Continue on Kiko platform. Repo: /Users/sunny/Desktop/vela-platform
Live: https://kiko.vanhawke.agency
Supabase: dwiywqeleyckzcxbwrlb
Hetzner: ssh root@178.104.73.22 (key auth)
PM2: 48 crons running on kiko-worker
```

---

## DEPLOYMENT CHECKLIST

### Standard deploy (frontend + API):
```bash
cd /Users/sunny/Desktop/vela-platform
npm run build                        # Verify no errors
git add -A
git commit --no-verify -m "..."      # Describe changes
git push origin main                 # Auto-deploys to Vercel (~90s)
```

### Hetzner cron deploy:
```bash
scp kiko-worker/src/cron-scheduler.js root@178.104.73.22:/home/kiko/kiko-worker/src/cron-scheduler.js
ssh root@178.104.73.22 "chown kiko:kiko /home/kiko/kiko-worker/src/cron-scheduler.js && su - kiko -c 'pm2 restart kiko-worker'"
```

### Verify Hetzner:
```bash
ssh root@178.104.73.22 "su - kiko -c 'pm2 logs kiko-worker --lines 10 --nostream'"
```

---

## RING-FENCED FILES (need explicit permission)
- `api/kiko.js` — Main AI engine
- `api/kiko-tools.js` — Tool definitions
- `api/kiko-health.js` — Health monitoring
- `api/kiko-self-knowledge.js` — Capability map
- `src/contexts/` — React context providers
- `api/_lib/get-user-role.js` — Role resolution

---

## CURRENT STATE

### Data volumes:
- Contacts: 4,193 | Companies: 2,249 | Deals: 308 (38 active)
- Tasks: 37 | Conversations: 20 | Alerts: 424
- Knowledge domains: 15 (auto-researched daily)
- Crons: 48 on Hetzner | 0 on Vercel

### Recent major changes:
- Legora design system (full platform audit, zero old-theme artifacts)
- RLS on all 12 tables (org-level + user-level isolation)
- 49 crons on Hetzner (daily intelligence + knowledge seeding)
- Voice: 5 tone presets, 8 voices, speed control, auto-reconnect (3 retries), health heartbeat, connection status indicator
- Google Calendar integration (read + write via Kiko tools)
- Command Centre: focused briefing, task filters (Overdue/This week/All), task creation, web search fallback
- Knowledge seeder: 15 domains researched nightly (all populated)
- LinkedIn profile enrichment (AI-powered, daily cron)
- Pipeline: activity history in deal panel, analytics (win rate, avg deal), inline value editing
- Contacts: enrichment badge (green/grey dots), detail page (448 lines)
- Toast notification system wired into KikoChat, Pipeline, Command Centre
- Notification bell with real kiko_alerts data, dropdown panel
- F1 2026 calendar: 22 races (full official, Bahrain/Saudi cancelled)
- AI engine: conversation summarisation, token budget, tool retry, rate limiting (30 req/min)
- Test coverage: 3 suites, 18 tests (API, RLS, build)
- CI/CD: GitHub Actions build verification on every push
- Supabase backups: pg_dump daily at 1am on Hetzner (14-day retention)
- Documentation: ARCHITECTURE.md + KIKO_SESSION_BRIEF.md
- Knowledge browser page at /knowledge
- Page roles for all 13 platform pages
- Calendar intent regex fixed (matches all common phrasings)
- Sequence conditional branching (table + API + evaluation + UI all complete)

---

## BACKLOG (priority order)
1. **Onboarding flow** — First-run wizard for new users
2. **Mobile responsiveness** — Pipeline list view, KikoFloat fullscreen
3. **Email inbox page** — Thread view in platform
4. **Pipeline analytics dashboard** — Charts, conversion funnel, stage velocity
5. **Multi-tenant billing** — Stripe integration for client subscriptions

---

## KEY ENVIRONMENT VARIABLES (Vercel)
- `ANTHROPIC_KEY` — Claude API key
- `OPENAI_KEY` — GPT-4o Realtime + TTS
- `VITE_SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side Supabase access
- `VITE_SUPABASE_ANON_KEY` — Client-side Supabase access
