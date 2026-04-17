# KIKO SESSION BRIEF
## Last updated: 2026-04-17 — Commit `f2bad3a`

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
- 48 crons migrated from Vercel to Hetzner
- Voice settings: 5 tone presets, 8 voices, speed control
- Google Calendar integration (read + write)
- Command Centre focused briefing (entity-specific, not pipeline dumps)
- Knowledge seeder: 15 domains researched nightly
- Toast notification system
- Notification bell with real alert data
- F1 2026 calendar: 22 races (full official)
- Email draft detection improved
- Test coverage: API smoke + RLS + build tests

---

## BACKLOG (priority order)
1. **Voice stability** — WebRTC reconnection, connection health, dedicated session
2. **Onboarding flow** — First-run wizard for new users
3. **Mobile responsiveness** — Pipeline list view, KikoFloat fullscreen
4. **Analytics dashboard** — Usage stats, pipeline velocity, campaign ROI
5. **Multi-tenant billing** — Stripe integration for client subscriptions

---

## KEY ENVIRONMENT VARIABLES (Vercel)
- `ANTHROPIC_KEY` — Claude API key
- `OPENAI_KEY` — GPT-4o Realtime + TTS
- `VITE_SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side Supabase access
- `VITE_SUPABASE_ANON_KEY` — Client-side Supabase access
