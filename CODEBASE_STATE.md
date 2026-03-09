# Vela Platform v2.0 — Codebase State

**Version:** 2.0.0-alpha
**Build Date:** 2026-03-09
**Repo:** github.com/VanHawke/vela-platform
**Target Domain:** vela.vanhawke.com
**Platform:** Vite + React 19 + Tailwind v4 + shadcn/ui
**Database:** Supabase (same project as vanhawke-crm)
**AI Backend:** Anthropic Claude (tiered: Haiku/Sonnet) + OpenAI (voice/search) + Mem0 (memory)
**Voice:** OpenAI Realtime API + ElevenLabs Charlotte
**Deployment:** Vercel

---

## Current Status

### Phase 0 — Project Setup: IN PROGRESS
- [x] React + Vite scaffold
- [x] Git init
- [x] Tailwind CSS v4 + @tailwindcss/vite plugin
- [x] shadcn/ui initialized (21 components)
- [x] All app dependencies installed
- [x] Directory structure matches brief
- [x] Build passes (clean)
- [x] TASKS.md created
- [x] CODEBASE_STATE.md created
- [ ] .env.local + vercel.json + .claude/CLAUDE.md + .gitignore
- [ ] PWA files (manifest.json, sw.js, audio-processor.js)

### Phase 1 — Foundation: NOT STARTED
### Phase 2 — CRM: NOT STARTED
### Phase 3 — Intelligence: NOT STARTED

---

## Project Structure

```
vela-platform/
├── api/                          ← Serverless functions (to be created)
├── src/
│   ├── components/
│   │   ├── auth/                 ← LoginPage (to be created)
│   │   ├── crm/                  ← Phase 2
│   │   ├── intelligence/         ← Phase 3
│   │   ├── kiko/                 ← KikoChat, KikoMessage, KikoVoice
│   │   ├── layout/               ← Layout, Sidebar, ChatHistory
│   │   ├── outreach/             ← Phase 3
│   │   ├── platform/             ← Phase 3
│   │   ├── settings/             ← Settings, ImageUpload, VisualBuilder
│   │   └── ui/                   ← shadcn components (21 installed)
│   ├── lib/
│   │   ├── supabase.js           ← (to be created)
│   │   └── utils.js              ← shadcn utility (exists)
│   ├── pages/                    ← Thin route wrappers
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css                 ← Tailwind + shadcn theme tokens
├── public/
├── jsconfig.json
├── vite.config.js
├── components.json               ← shadcn config
├── TASKS.md
├── CODEBASE_STATE.md
└── package.json
```

## Installed Dependencies

### Core
- react 19, react-dom 19, vite
- tailwindcss v4, @tailwindcss/vite
- shadcn/ui (21 components)

### AI + Backend
- @anthropic-ai/sdk (latest)
- openai
- mem0ai

### Data + Auth
- @supabase/supabase-js
- @supabase/auth-helpers-react
- react-router-dom

### UI
- lucide-react
- react-image-crop
- react-hot-toast
- date-fns

### Utilities
- axios

## shadcn Components Installed
avatar, badge, button, card, command, dialog, dropdown-menu, input, input-group, popover, scroll-area, select, separator, sheet, sidebar, skeleton, sonner, table, tabs, textarea, tooltip

---

## Decisions Log
1. **Tailwind v4** — shadcn auto-detected v4, using @tailwindcss/vite plugin (not PostCSS)
2. **sonner** over toast — shadcn deprecated toast in favour of sonner
3. **Geist font** — auto-installed by shadcn as default sans font
4. **Dark theme** — shadcn generated oklch-based dark/light vars; will customize to brief palette in Phase 1.1
