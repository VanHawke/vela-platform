// api/agents/navigator.js — Navigator Agent
// Understands the Kiko platform UI. Describes screen content. Navigates between pages.
// Called by Kiko Prime via ask_navigator tool.
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const PLATFORM_MAP = `KIKO PLATFORM — COMPLETE PAGE MAP

Pages you can navigate to (use exact IDs):

HOME (id: home, path: /)
- Greeting + prompt bar + quick action chips (Brief me, Pipeline update, Check emails, F1 calendar)
- KikoFloat chat bubble (bottom right)
- Alert notification bar (partnership signals count)
- Chat history panel (left edge, expandable)

PIPELINE (id: pipeline, path: /pipeline)
- Kanban board with deal cards sorted by stage columns
- Stages: To revisit → Contact made → Qualified → In Dialogue → Meeting arranged → Proposal Sent → Negotiation → Verbal Agreement → Contract Review
- Each card shows: company name, contact, value, days since activity
- Pipeline selector dropdown (top) — filters by pipeline name
- Click a card → opens deal detail panel (right side)
- Stats visible: deal count per stage

COMMAND CENTRE (id: email, path: /email)
- Priority actions ranked by deal value × urgency multiplier
- Stats bar: active deals count, weighted pipeline ($M), stale count (30d+), days to next race
- Each action row: rank number, urgency bar (red/amber/purple), action type label, company name, contact, stage, value, days since activity, probability %
- Right panel: Kiko Intelligence — click any deal for AI analysis + draft
- Stale deals (30d+ no activity) flagged with red STALE badge

TASKS — now merged into COMMAND CENTRE (id: email, path: /email)
- Tasks are accessible via the Command Centre page
- Say "open command centre" to see tasks and priority actions together

CONTACTS (id: contacts, path: /contacts)
- Searchable table of all contacts
- Columns: name, company, title, email, phone, last activity
- Click a contact → detail view with full history

ORGANISATIONS (id: organisations, path: /organisations)
- Company cards/list view
- Each company: name, industry, revenue range, funding stage, employee count
- Deal status badge if company has an active deal
- Click → detail view with contacts, deals, notes, news signals

PARTNERSHIP MATRIX (id: partnership-matrix, path: /partnership-matrix)
- Grid view: F1/FE teams × sponsorship categories
- Shows current sponsors per team per category
- Gaps highlighted — open categories available for sales
- Team selector tabs at top
- NEW: Partnership Detection Engine runs daily at 7am, auto-detects F1 sponsor announcements from team websites and news
- New partners appear here automatically with "New" badges
- Alerts show on homepage with "Discuss" and "View Matrix" buttons

RACE CALENDAR (id: calendar, path: /calendar)
- F1 2026 and Formula E Season 12 race calendars
- Pre-race outreach windows, upcoming events
- Event list view with meetings, calls, race weekends

- Left: campaign list sorted by status (Running → Paused → Other) with lead counts
- Middle: click campaign → stats bar (sent, opened, clicked, replied, bounced), sequence flow (email/LinkedIn steps), leads list with last activity
- Right: click any lead → full activity timeline showing every email, LinkedIn action, open, reply

SETTINGS (id: settings, path: /settings)
- Navigation customisation, preferences
`;

const NAVIGATOR_PROMPT = `You are the Navigator Agent inside Kiko, the AI operating system for Van Hawke Group.

Your ONLY job: understand the Kiko platform UI, describe what's on screen, and navigate between pages.

${PLATFORM_MAP}

INSTRUCTIONS:

When asked to DESCRIBE THE SCREEN:
1. State which page the user is on (use the page name from the map above)
2. Describe the layout (what sections are visible)
3. List specific data items visible (from the visibleItems provided)
4. Offer one actionable observation

When asked to NAVIGATE:
1. Identify the target page from the map above
2. Return the page ID for navigation
3. Confirm what the user will see when they arrive

RULES:
- ONLY use information from the pageContext provided. NEVER guess or hallucinate data.
- If visibleItems is empty, say "I can see the page structure but no data has loaded yet."
- Keep responses under 100 words. Be precise.
- You know every page, every section, every data field. Reference them specifically.
`;

export async function callNavigator(instruction, pageContext = {}) {
  const contextBlock = pageContext?.page
    ? `\n\nCURRENT PAGE CONTEXT:\nPage: ${pageContext.page}\nPath: ${pageContext.path || '/'}\nSummary: ${pageContext.summary || 'No summary'}\n${pageContext.stageDistribution ? `Stage distribution: ${JSON.stringify(pageContext.stageDistribution)}` : ''}\n${pageContext.visibleItems ? `Visible items: ${pageContext.visibleItems}` : 'No visible items data'}`
    : '\n\nNo page context available.';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: NAVIGATOR_PROMPT + contextBlock,
      messages: [{ role: 'user', content: instruction }],
    });

    const text = response.content?.find(b => b.type === 'text')?.text || 'Navigator could not process this request.';

    // Detect navigation intent — ONLY match against user's original instruction, not page context or response
    // The instruction may contain appended [PAGE CONTEXT: ...] — strip it before matching
    const rawInstruction = instruction.split('\n\n[PAGE CONTEXT')[0].toLowerCase();
    let navigateTo = null;

    // Page alias map
    const pageAliases = {
      'pipeline': 'pipeline', 'deals': 'pipeline', 'deal pipeline': 'pipeline',
      'command centre': 'email', 'command center': 'email', 'outreach intelligence': 'email',
      'contacts': 'contacts', 'people': 'contacts',
      'organisations': 'organisations', 'organizations': 'organisations', 'companies': 'organisations',
      'tasks': 'email', 'to do': 'email', 'todo': 'email', 'task list': 'email',
      'calendar': 'calendar', 'schedule': 'calendar', 'race calendar': 'calendar', 'races': 'calendar', 'f1 calendar': 'calendar',
      'news': 'partnership-matrix', 'news signals': 'partnership-matrix', 'partnerships': 'partnership-matrix',
      'partnership matrix': 'partnership-matrix', 'matrix': 'partnership-matrix', 'partnerships': 'partnership-matrix',
      'home': 'home', 'dashboard': 'home', 'homepage': 'home',
      'settings': 'settings',
    };

    // Navigation triggers — match only against the user's raw instruction
    const navTriggers = ['take me', 'go to', 'show me', 'open', 'navigate', 'pull up', 'switch to'];
    const hasNavIntent = navTriggers.some(t => rawInstruction.includes(t));

    if (hasNavIntent) {
      // Sort by alias length descending to match longer phrases first ("command centre" before "contacts")
      const sorted = Object.entries(pageAliases).sort((a, b) => b[0].length - a[0].length);
      for (const [alias, pageId] of sorted) {
        if (rawInstruction.includes(alias)) { navigateTo = pageId; break; }
      }
    }

    return { description: text, navigateTo };
  } catch (err) {
    return { description: `Navigator error: ${err.message}`, navigateTo: null };
  }
}
