# KIKO SESSION BRIEF — Read this before writing any code
## Last updated: 2026-04-22

### REPO & DEPLOY
- Repo: `/Users/sunny/Desktop/vela-platform/` → `https://kiko.vanhawke.agency`
- Deploy: `git push` auto-deploys to Vercel. NEVER use `--force` or `VERCEL_FORCE_NO_BUILD_CACHE=1`
- Build: `npm run build` → verify → commit → push → verify new hash → test
- Supabase: project_id `dwiywqeleyckzcxbwrlb`

### HETZNER (178.104.73.22)
- PM2: `kiko-crons` (21 scheduled jobs) + `kiko-worker` (Express port 3000)
- LinkedIn worker: Playwright + Decodo proxy (`isp.decodo.com:10001`)
- Email Intel Engine: `/home/kiko/kiko-worker/lib/emailIntel.js`
- Routes: `/email-intel/find`, `/email-intel/enrich`, `/email-intel/verify`, `/email-intel/bulk`
- Worker secret: `kiko-hetzner-2026-vanhawke` (Authorization: Bearer header)
- nginx reverse proxy for CORS

### RING-FENCE RULES
- NEVER modify `api/kiko.js`, `api/kiko-tools.js`, `api/kiko-self-knowledge.js` without explicit permission
- Always `node --check` syntax verify before pushing server files
- Always `Array.isArray()` on Supabase query results
- LinkedIn worker reads from `kiko_linkedin_queue` (NOT `kiko_outreach_queue`)

### KEY FILES
| File | Lines | Role |
|------|-------|------|
| api/kiko.js | 1943 | Main Kiko API — system prompt, tool routing, streaming |
| api/kiko-tools.js | 1437 | 36 tools — agents, actions, Gmail drafts |
| api/kiko-self-knowledge.js | 356 | Capability map, self-knowledge, bible injection |
| api/cron-sequence-sender.js | 336 | Sequence email sender with condition evaluation |
| api/source-prospects.js | 329 | Deep research pipeline + email intel integration |
| src/pages/SequenceDetail.jsx | 1424 | Campaign editor: flow builder + prospects + activity |
| src/pages/Campaigns.jsx | 1520 | Campaign list + prospect table + detail panel |
| src/components/kiko/KikoChat.jsx | 1876 | Kiko chat: multi-file upload, streaming, voice |

### EMAIL INTELLIGENCE API KEYS (on Hetzner)
- Hunter.io: `404535bb1e247b82992209e153cd2b2fe3eacde6`
- Snov.io: `553969ec6fbe768f993684fe2dbd2acf` / `8605d5403f512e9cffc46921d9ed166e`
- Voila Norbert: `2c453a9e-9abc-4b94-aff8-0846d9cb60ad`
- Skrapp.io: `16488159434pe7UCIl2NPdbiRdyTgkIk2TikkX7bOB`
- Prospeo: `pk_9142c0872613098079a1f55fdd1c279517d569570db87a71c4778a634a22e091`
- Clearout: `b60ee141d350e6e807132abc8d0f515d:656f42a896b10daaa5a2ba3a7f5874b5dfb715762d8f778406ed48b9b89879a0`

### WHAT'S WORKING (April 22, 2026)
- Kiko chat (streaming, 36 tools, context awareness, multi-file upload)
- CRM (contacts, companies, deals, pipeline)
- Campaign builder (Lemlist-style flow + editor, conditions, branching)
- Sequence sender (cron, timezone-aware, condition evaluation engine)
- Email sending via Gmail API + LinkedIn via Playwright
- Email Intelligence Engine (6 APIs + SMTP, auto-wired into sourcing)
- Gmail draft creation for any team member
- Reply detection (email + LinkedIn, auto-stop, alerts, deal creation)
- Knowledge base (26 nightly research domains)
- Self-improvement engine (learning + rules + promotion)
- Voice (GPT-4o Realtime via WebRTC)
- Multi-user auth (zero data leakage)
- Supabase backup (14-day retention)

### OUTSTANDING ITEMS
1. End-to-end tool testing (verify all 36 tools work)
2. Background prospect sourcing (job queue for async)
3. ~22 more dead API files to verify and archive
4. SponsorSignal LinkedIn posting (not connected)
5. Voice latency on mobile (pre-warm token)
6. Kiko learning from email draft edits
7. Campaign detail panel polish
