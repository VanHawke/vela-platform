# KIKO SESSION BRIEF — UPDATED 6 APRIL 2026

## PLATFORM
- **Live URL:** https://vela-platform-one.vercel.app
- **Codebase:** /Users/sunny/Desktop/vela-platform/
- **Deploy:** `npm run build → git commit → git push → npx vercel --prod --yes`
- **NEVER** use `--force` or `VERCEL_FORCE_NO_BUILD_CACHE=1`
- **Functions:** 49/50 in vercel.json (1 slot remaining)
- **Env:** `ANTHROPIC_KEY` (not ANTHROPIC_API_KEY)

## WHAT'S OPERATIONAL
### Intelligence Layer (all running, verified via heartbeats 6 Apr)
- 33 crons active, heartbeating every 30min-weekly
- 246 learning log entries, preferences at 0.85-0.95 confidence
- 75 news feeds, 17 companies enriched, proactive alerts daily
- Reply detection, deal attribution, edit-delta feedback loop

### Campaign Engine (built 6 Apr — FULLY OPERATIONAL)
- **5 campaign tools** in Kiko's brain: campaign_overview, create_campaign, source_companies, source_contacts, bulk_enroll
- **System prompt** explicitly tells Kiko about her campaign toolkit + proactive recommendations
- **Draft → Launch flow:** Campaigns start as draft, guided Sequence → Leads → Launch wizard
- **Conditional branching:** Backend evaluates no_reply/has_linkedin/has_email conditions, routes to yes/no branches. UI shows condition steps with branch visual.
- **Timezone-aware sending:** Auto-detects prospect location from company intel, targets 9-10am local time
- **Reply → Pipeline bridge:** Auto-creates/updates CRM deal on reply, moves to "Contact Made"
- **Category recommender:** Proactive cron alerts on open HIGH-priority categories
- **LinkedIn alert flow:** When LinkedIn actions queued, creates alert for manual execution
- **Email:** Helvetica 12pt, auto-signature, subject encoding fixed

### What Kiko Can Do Via Conversation
- "What campaigns do we have?" → campaign_overview
- "Create a Banking campaign for Haas" → generates 7-step AI sequence as draft
- "Source companies for FinTech" → web searches, cross-refs CRM, scores fit
- "Find contacts at JPMorgan" → finds decision-makers via web search
- "Enroll Banking contacts into the campaign" → bulk_enroll from CRM
- "What categories should we target?" → analyses gaps, recommends HIGH-priority

### HIGH-PRIORITY OPEN CATEGORIES (no campaigns)
Banking/Financial Services, FinTech/Payments, Telecoms/Connectivity, Energy/Petrochemical, Gaming/Entertainment

## KEY DOCS IN REPO
- KIKO_PROSPECTING_ARCHITECTURE.md — Full system architecture + 12-feature build plan
- KIKO_LEMLIST_FEATURE_MAP.md — Complete Lemlist vs Kiko comparison + condition types + build sessions
- KIKO_SESSION_BRIEF.md — This file
- KIKO_EVOLUTION_PLAN.md — Original 19-phase spec (Phases 6-14 complete)

## STILL TO BUILD
1. **Open/click tracking** — tracking pixel + link wrapping for email_opened condition
2. **LinkedIn execution** — PhantomBuster API or manual queue alert flow (alerts built, execution pending)
3. **UI polish** — condition step branch editing, drag-drop reorder, A/B testing
4. **Campaign performance learning** — feed reply data back into sequence generation
5. **Unified inbox** — all replies in one view
