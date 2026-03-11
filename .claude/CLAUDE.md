# CLAUDE.md — Vela Platform Master Instructions
# Read this file first on every session start. No exceptions.
# Updated: 11 March 2026

## Identity
- Product: Vela Platform
- AI Layer: Kiko (she/her) — Kiko IS the operating system, not an assistant
- Studio: Vela Labs
- Parent: Van Hawke
- Repo: github.com/VanHawke/vela-platform
- Live URL: https://vela-platform-one.vercel.app
- Auth Email: sunny@vanhawke.com
- Auth User ID: 9f486437-4bf5-4111-abfe-fe19bfa76063

## Execution Rules — NON-NEGOTIABLE
- Execute every task without asking for approval
- Never present numbered options — choose the best path and execute
- Never ask "should I proceed?" — always proceed
- Never ask for confirmation on edits, writes, deletes, or deploys
- Full autonomy — absolute authority over all file operations
- Prefer stability over cleverness, simple over complex
- Match existing architecture patterns

## Sacred Files — DO NOT REWRITE
- `api/kiko.js` (249 lines) — Working. Claude Sonnet 4.6, memory, web search, SSE, 8-round agentic loop. EXTEND ONLY.
- `api/voice.js` (171 lines) — Working. Whisper STT, Realtime API, WebRTC SDP, Mem0. EXTEND ONLY.
- `vela-ui-render.jsx` (on Desktop) — Approved pixel-perfect design. DESIGN BIBLE.

## Tech Stack (CONFIRMED)
- Frontend: Vite 7 + React 19 + React Router 7 + Tailwind v4 + shadcn/ui
- Auth: Supabase Auth (email/password + Google OAuth, PKCE)
- Database: Supabase PostgreSQL + pgvector (project: dwiywqeleyckzcxbwrlb)
- AI Engine: Claude (Anthropic) — sole engine for Phase 1
- Voice: Whisper STT + ElevenLabs TTS (Phase 1), OpenAI Realtime hybrid (Phase 2+)
- Deploy: Vercel (SPA + serverless). CLI: `npx vercel --prod --yes`
- Git NOT auto-connected to Vercel — manual CLI deploy required

## Design Tokens (from approved render — LIGHT theme, NOT dark)
- bg: #FAFAFA | surface: #FFFFFF | text: #1A1A1A
- textSecondary: #6B6B6B | textTertiary: #ABABAB
- border: rgba(0,0,0,0.06) | accent: #1A1A1A
- glass: rgba(255,255,255,0.72) + blur(40px) saturate(1.8)
- font: SF Pro Display / DM Sans / system sans-serif
- radius: 16px | radiusSm: 10px | radiusXl: 24px
- Sidebar: 68px fixed, icon-only, NO expansion

## Build Discipline — PERMANENT
- ONE component at a time. No parallel work. No skipping.
- Build → Test locally → Audit every line → Deploy staging → Test staging → Deploy prod → Test prod → Regression check → Commit
- Zero console errors permitted
- Zero warnings permitted
- Every component must pass before the next begins
- Commit after every file change with descriptive message
- Deploy after every completed component
- All data org-scoped (org_id on every table, RLS enforced)
- Every module toggleable via feature flags in platform_config

## API Integration Rule — PERMANENT
- Before implementing any external API, fetch and read current official docs
- Never rely on training knowledge for API specs
- Verify endpoints, request/response formats, auth against live docs

## Quality Discipline — PERMANENT
- Test before every commit — every button, input, interaction tested
- Never commit broken code — failed test = blocker, not warning
- Self-verify — after every fix, re-test the issue plus adjacent components
- No static-only testing — trace code path end to end
- Fix the full error chain in one pass
- Self-review before commit — will this throw an error? Is every param present?

## Current Build Phase: PHASE 0 — FOUNDATION
## Current Component: 0.3 — Home Screen

### Component 0.1 — Auth Flow (Verify + Fix)
**What:** Login page renders correctly (matches approved render light theme), email/password works, Google OAuth works, session persists across refresh, protected routes redirect to /login, no OrgContext auth lock errors, no console errors.
**Files to check/fix:** LoginPage.jsx, OrgContext.jsx, supabase.js, App.jsx
**Test criteria:**
1. Visit / without auth → redirected to /login
2. Login page matches approved render (light theme, Google button, email/password, "Van Hawke" heading)
3. Login with email/password → redirected to home
4. Refresh → still logged in (session persists)
5. Logout → redirected to /login
6. No console errors on any page
7. No OrgContext auth lock errors on load
**When done:** Commit, deploy, move to Component 0.2

### Full build sequence (read VELA-MASTER-BUILD-PLAN.md on Desktop for details):
- Phase 0: Foundation (0.1 Auth → 0.2 Layout → 0.3 Home → 0.4 Kiko Chat → 0.5 KikoFloat → 0.6 Design Tokens)
- Phase 1: Kiko Intelligence (1.1 Persistence → 1.2 Memory Write → 1.3 Memory Retrieve → 1.4 Console → 1.5 Modules)
- Phase 2: Voice (2.1 Overlay → 2.2 STT → 2.3 TTS → 2.4 Full Flow)
- Phase 3: Pipeline (3.1–3.6)
- Phase 4: Contacts (4.1–4.4)
- Phase 5: Outreach (5.1–5.3)
- Phase 6: MCP Integrations (6.1–6.3)
- Phase 7: Reports + Polish (7.1–7.5)
- Phase 8: Voice Tier 3 (8.1–8.3)

## Regression Checklist (run after EVERY component deploy)
- [ ] Login works (email/password + Google OAuth)
- [ ] Session persists across refresh
- [ ] Home screen renders (prompt bar, chips, greeting)
- [ ] Kiko responds to text input (streaming)
- [ ] Sidebar navigation works (all routes)
- [ ] No console errors on any page
- [ ] Design matches approved render

## Context Management
At 10% context remaining:
1. Stop at nearest clean checkpoint
2. Update CODEBASE_STATE.md with full state
3. Create RESUME.md with exact next step and what was completed
4. Commit both files
5. Report status

## New Session Startup
1. Read this CLAUDE.md first
2. Read VELA-MASTER-BUILD-PLAN.md from Desktop for full component specs
3. Read approved render: /Users/sunny/Desktop/vela-ui-render.jsx
4. Check if RESUME.md exists → execute from where it left off
5. If no RESUME.md → read CODEBASE_STATE.md → start at current component
6. BEGIN BUILDING. Do not ask. Do not wait. Execute.

## START NOW
Read the master build plan, then begin Component 0.1 (Auth Flow). 
Fix auth, test it, deploy it, verify it. Then move to 0.2. One at a time. Go.
