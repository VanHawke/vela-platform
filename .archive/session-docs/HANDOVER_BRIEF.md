# VELA PLATFORM — COMPREHENSIVE HANDOVER BRIEF
**Date:** 18 March 2026  
**Prepared for:** New chat session / new model  
**Priority:** URGENT — auth is broken, platform not loading data

---

## 1. WHAT VELA IS

Vela is an AI-native SaaS operating platform for **Van Hawke Group** (CEO: Sunny Sidhu, Weybridge UK). It functions as a CRM, intelligence layer, and command centre across Van Hawke's three business units: Agency (F1/Formula E sponsorship advisory), Maison (luxury eyewear), and Group (capital allocation).

**Core product:** Kiko — an AI OS layer powered by Claude Sonnet, not a chatbot. Kiko has voice mode, web search, CRM tools, proactive intelligence (Kiko Insights), and cross-session memory.

---

## 2. TECHNICAL STACK

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, deployed on Vercel |
| Backend | Vercel serverless functions (Node.js) |
| Database | Supabase (Postgres + JSONB schema) |
| AI | Anthropic Claude Sonnet via streaming SSE |
| Voice | OpenAI Realtime API (WebRTC, GA endpoint) |
| Auth | Supabase Auth with Google OAuth |
| Repo | github.com/VanHawke/vela-platform |
| Local | /Users/sunny/Desktop/vela-platform/ |
| Live URL | https://vela-platform-one.vercel.app |

**Supabase project ID:** `dwiywqeleyckzcxbwrlb`  
**Supabase org_id:** `35975d96-c2c9-4b6c-b4d4-bb947ae817d5`  
**User:** sunny@vanhawke.com, user_id `9f486437-4bf5-4111-abfe-fe19bfa76063`, role: super_admin

**Vercel deployment:** GitHub auto-deploy is connected but slow/unreliable. Use `npx vercel --prod --yes` from local for guaranteed immediate deployment.

---

## 3. DATABASE — WHAT EXISTS AND WORKS

All data is confirmed present and correct in Supabase:
- **5,006 contacts** with enriched JSONB data
- **308 deals** (168 Haas F1, 75 Alpine F1, 33 ONE Championship, 20 Formula E, 12 Esports)
- **2,243+ companies** with competitor intelligence
- **Emails** syncing via Gmail API (working)
- **user_settings** — Sunny's settings row exists with correct logo URLs and org_id

**RLS policies** are correct and working:
- All tables use `org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid`
- user_settings uses `user_id = auth.uid()`

**auth.users** — Sunny's record is correct:
```json
{
  "id": "9f486437-4bf5-4111-abfe-fe19bfa76063",
  "email": "sunny@vanhawke.com",
  "raw_app_meta_data": {
    "role": "super_admin",
    "org_id": "35975d96-c2c9-4b6c-b4d4-bb947ae817d5",
    "provider": "google"
  }
}
```

---

## 4. WHAT WAS BUILT THIS SESSION (BEFORE AUTH BROKE)

### Kiko Voice Interface (KikoVoice.jsx) — COMPLETED
- Full-screen frosted glass overlay (light, platform-matched: rgba(250,250,250,0.82))
- Large rounded-square avatar (156×156, borderRadius 38) with KikoSymbol
- Avatar states: idle → streaming → thinking → speaking (equalizer bars)
- Three-tier listening state machine: Active (0-45s) → Passive (45s-2min) → Off (2min+)
- Keyword reactivation: 'Hey Kiko', 'Ok Kiko', etc.
- **Transcript fix attempted** (still partially broken — see Section 6)
- File attachment via paperclip: uploads to Supabase, analyses via /api/documents, injects into voice session
- Drag-and-drop files onto voice overlay
- Prompt bar matches home page pill design exactly
- Expandable transcript pane (slides in from right, shows both You and Kiko messages)

### News Page (News.jsx) — COMPLETED
- Two-pane reader: pill filter tabs + search, article list left, reading pane right
- Intelligence block, CRM matches, topic chips
- Tab categories: Deal signals, F1, Partnerships, Formula E, Market, Team news, All

### Organisations Page (Organisations.jsx) — COMPLETED
- Chip filter UI: Industry, Country, Funding, Round, Revenue
- Competitor Intelligence panel with threat levels (direct/adjacent/indirect)
- "+ Add to CRM" one-click button for competitor companies

---

## 5. CURRENT FILE STATE (KEY AUTH FILES)

### src/lib/supabase.js
```js
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',  // ← currently PKCE
  },
})
```

### src/lib/auth.js
```js
import { supabase } from '@/lib/supabase'
export async function signOut() {
  try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
  window.location.replace('/login')
}
```

### src/App.jsx (key section)
```jsx
// Single onAuthStateChange listener
supabase.auth.onAuthStateChange((event, sess) => {
  if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESH_FAILED') {
    setSession(null); setUser(null)
  }
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    setSession(sess ?? null); setUser(sess?.user ?? null)
  }
})
// Layout has stable key — key="app" (not key={user?.id} which caused double-mount)
<Route element={session ? <Layout key="app" user={user} /> : <Navigate to="/login" replace />}>
```

### src/pages/AuthCallback.jsx
```jsx
// Exchanges PKCE code then hard-redirects to / or /login
const code = new URLSearchParams(window.location.search).get('code')
if (code) { await supabase.auth.exchangeCodeForSession(code) }
const { data: { session } } = await supabase.auth.getSession()
window.location.replace(session ? '/' : '/login')
```

### src/components/auth/LoginPage.jsx
```jsx
// Google OAuth with PKCE, redirects to /auth/callback
redirectTo: `${window.location.origin}/auth/callback`
```

### src/components/layout/Sidebar.jsx
```jsx
import { signOut } from '@/lib/auth'  // imported from auth.js, not App.jsx
// Sign out button:
<button onClick={signOut}>Sign Out</button>
```

---

## 6. THE ONGOING BROKEN ISSUE

### Symptoms (as reported by user throughout this session)
1. Platform loads but shows NO personalisation (no logo, name shows as "sunny" not full name)
2. ALL data pages show empty (Pipeline: 0 deals, Contacts: empty, etc.)
3. Sign Out button does not work / does nothing
4. `/auth/callback` gets stuck on loading spinner
5. Refreshing the page often kicks user back to `/login`

### Root cause history (what's been tried and why it keeps failing)

**Root cause chain:**
1. Originally: `storageKey: 'vela-auth-token'` override in supabase.js meant Supabase stored sessions under `sb-dwiywqeleyckzcxbwrlb-auth-token` but the app looked in `vela-auth-token` — found nothing, treated user as logged out. **Fixed.**

2. Then: `TOKEN_REFRESH_FAILED` handler called `signOut()` inside `onAuthStateChange` — infinite loop. **Fixed.**

3. Then: `/auth/callback` route was `<Navigate to="/" replace />` — bypassed AuthCallback.jsx entirely, PKCE code was never exchanged. **Fixed.**

4. Then: `hardSignOut()` was clearing ALL `sb-*` localStorage keys including the PKCE code verifier that was stored when OAuth started. When callback arrived, verifier was gone → `AuthPKCECodeVerifierMissingError`. **Partially fixed** by changing signOut() to NOT touch localStorage manually.

5. Then: Switched to implicit flow to avoid verifier issue — but React Router redirected to `/login` (session=null) before Supabase could process the `#access_token=` hash fragment, destroying it. **Reverted to PKCE.**

6. **Current state:** PKCE is configured, login succeeds server-side (Supabase auth logs confirm `login_method: pkce` with 200 responses), but the app either:
   - Shows the platform UI with no data loaded, OR  
   - Gets stuck on `/auth/callback` loading spinner, OR
   - Both sign out and data loading fail

### What Supabase logs confirm IS working
- Login events: `action: login, login_method: pkce` → 200 ✓
- Token exchange: `POST /token grant_type=pkce` → 200 ✓  
- User fetch: `GET /user` → 200 ✓
- Data exists: 308 deals, 5006 contacts, correct org_id ✓
- Redirect URL: `https://vela-platform-one.vercel.app/*` is in Supabase allow list ✓

### What is NOT working
The React app is not picking up the session correctly after login. Either:
- `INITIAL_SESSION` fires before the PKCE exchange completes, returning null session
- `SIGNED_IN` fires but `user` state is null when pages mount (so `useEffect(() => { if (user?.id) load() }, [user?.id])` never triggers)
- AuthCallback's `window.location.replace('/')` fires before session is fully committed to localStorage

### The most likely fix needed
The `AuthCallback.jsx` does `exchangeCodeForSession(code)` then immediately `getSession()` then `window.location.replace('/')`. The issue may be a race condition where `getSession()` resolves before Supabase has fully committed the session to localStorage after the exchange.

**Suggested approach for new chat:**
1. In `AuthCallback.jsx`: after `exchangeCodeForSession`, listen for `onAuthStateChange` `SIGNED_IN` event BEFORE doing `window.location.replace('/')` — guarantees session is committed
2. OR: add a small delay (100-200ms) after `exchangeCodeForSession` before calling `getSession()` and redirecting
3. OR: use `supabase.auth.setSession()` explicitly after exchange to guarantee state is set

---

## 7. ENVIRONMENT VARIABLES

### .env.local (local)
```
VITE_SUPABASE_URL=https://dwiywqeleyckzcxbwrlb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OPENAI_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```
All same keys are set as Vercel environment variables for production.

---

## 8. DEPLOYMENT

- **GitHub:** github.com/VanHawke/vela-platform (main branch)
- **Vercel project:** vela-platform (Sunny's account)
- **Force deploy command:** `cd /Users/sunny/Desktop/vela-platform && npx vercel --prod --yes`
- **DO NOT rely on GitHub auto-deploy** — it has been slow/unreliable throughout this session

---

## 9. DESIRED AUTH BEHAVIOUR (SPEC)

1. User visits site → if no session → `/login`
2. User clicks "Continue with Google" → Google OAuth → returns to `/auth/callback?code=xxx`
3. AuthCallback exchanges code, session stored in localStorage
4. Redirect to `/` → platform loads with full data and personalisation (logo, name, deals, contacts)
5. **20-minute per-tab inactivity** → that specific tab's session expires → redirect to `/login`
6. Other browsers/tabs are NOT affected by one tab's timeout
7. Sign Out button → clears session → `/login`
8. Refreshing the page while logged in → stays logged in, data loads normally
9. Multiple browsers open simultaneously → each has independent session and 20-min timer

---

## 10. WHAT NOT TO TOUCH

These things work correctly and should not be changed:
- All Supabase RLS policies (they are correct)
- Supabase redirect URL config (`https://vela-platform-one.vercel.app/*` wildcard is set)
- user_settings, contacts, deals, companies tables and their data
- Kiko voice redesign (KikoVoice.jsx) — mostly complete
- News.jsx, Organisations.jsx — complete
- Email sync, Gmail integration — working
- All API routes in /api/ — working

---

## 11. QUICK DIAGNOSTIC COMMANDS

```bash
# Check what's in current bundle
ls /Users/sunny/Desktop/vela-platform/dist/assets/*.js

# Check git status
cd /Users/sunny/Desktop/vela-platform && git log --oneline -5

# Deploy immediately
cd /Users/sunny/Desktop/vela-platform && npm run build && npx vercel --prod --yes

# Check Supabase auth logs for recent login attempts
# Use Supabase MCP: get_logs(project_id="dwiywqeleyckzcxbwrlb", service="auth")

# Verify user exists correctly in DB
# SQL: SELECT id, email, raw_app_meta_data FROM auth.users WHERE email='sunny@vanhawke.com'
```

---

## 12. SESSION CONTEXT FOR KIKO VOICE (SECONDARY ISSUE)

The Kiko Voice transcript is not logging user speech. Root cause is that `input_audio_transcription` needs to be correctly positioned in the OpenAI Realtime API session.update payload. The GA API (which this uses — model: `gpt-realtime`) uses:

```js
session: {
  audio: {
    input: {
      transcription: { model: 'whisper-1' },  // nested here for GA API
      turn_detection: { type: 'server_vad', ... }
    }
  }
}
```

This is a secondary issue — resolve auth first, then address voice transcript.

---

**END OF BRIEF**
