# CLAUDE.md — Vela Platform v2.0 Standing Instructions
# Read this file first on every session start. No exceptions.

## Identity
- Product: Vela Platform v2.0
- Assistant: Kiko
- Studio: Vela Labs
- Parent: Van Hawke
- Repo: github.com/VanHawke/vela-platform
- Live URL: https://vela.vanhawke.com
- Auth Email: sunny@vanhawke.com

## Execution Rules
- Execute every task without asking for approval
- Never present numbered options — choose the best path and execute
- Never ask "should I proceed?" — always proceed
- Prefer stability over cleverness, simple over complex
- Match existing architecture patterns
- Document every decision in CODEBASE_STATE.md

## Build Discipline
- Follow TASKS.md strictly — every checkbox must be [x] before proceeding
- Test after every component (visual, functional, errors, edge cases, cross-component)
- Zero console errors permitted
- No commit until all tasks in current section are complete
- Update CODEBASE_STATE.md after every commit
- DO NOT reference or touch vanhawke-crm repo

## Phase Gates
- Phase 1 (Foundation) must be deployed and stable before Phase 2
- Phase 2 (CRM) must be deployed and stable before Phase 3
- No skipping, no jumping ahead

## Tech Stack
- Frontend: React 19 + Vite + Tailwind v4 + shadcn/ui
- AI: Anthropic Claude (tiered) + OpenAI (voice/search) + Mem0 (memory)
- Database: Supabase (PostgreSQL + pgvector)
- Voice: OpenAI Realtime API + ElevenLabs Charlotte
- Deploy: Vercel

## Quality Discipline — PERMANENT
- Full autonomy — absolute authority over all file operations. Never ask for confirmation on edits, writes, deletes, or deploys. Execute immediately.
- Test before every commit — run a full virtual environment check after every component build. Every button, input, interaction, and click path must be tested. Zero console errors permitted. Zero warnings permitted.
- Never commit broken code — if a test fails, fix it before committing. Do not deploy until all tests pass. A failed test is a blocker, not a warning.
- Self-verify — after every fix, re-test the specific issue plus all adjacent components to confirm nothing regressed.
- No static-only testing — static structure tests do not count as functional tests. Every fix must be verified by tracing the code path end to end — read the component, identify the data flow, confirm the fix resolves the root cause.

## Context Management
At 10% context remaining:
1. Stop at nearest clean checkpoint
2. Update CODEBASE_STATE.md with full state
3. Create RESUME.md with exact next step
4. Commit both files
5. Report to Sunny

## New Session Startup
1. Check if RESUME.md exists → execute from where it left off
2. If no RESUME.md → read CODEBASE_STATE.md → await instructions
