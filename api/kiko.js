import Anthropic from '@anthropic-ai/sdk';

export const config = { supportsResponseStreaming: true };

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_KEY,
});

// ── Models ──────────────────────────────────────────────
const MODEL = {
  FAST: 'claude-haiku-4-5-20251001',
  PRIMARY: 'claude-sonnet-4-6',
};

// ── Query Classifier — zero latency ────────────────────
const classifyQuery = (message) => {
  const msg = message.toLowerCase().trim();
  const tier1 = [
    /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|got it)/,
    /^(good morning|good afternoon|good evening|good night)/,
    /^(who are you|what are you|how are you|what can you do)/,
    /^.{1,25}$/,
  ];
  const tier3 = [
    /research|analyse|analyze|deep dive|comprehensive/i,
    /full report|investigate|competitive analysis/i,
    /recommend strategy|predict|forecast|detailed/i,
    /write a full|create a complete|build a/i,
  ];
  if (tier1.some(p => p.test(msg))) return 'tier1';
  if (tier3.some(p => p.test(msg))) return 'tier3';
  return 'tier2';
};

// ── Prompts ─────────────────────────────────────────────
const KIKO_CORE = `You are Kiko, the AI for Van Hawke Group. Sunny is the CEO. Van Hawke has three verticals: sponsorship advisory (introducing agency for Haas F1 Team, Formula E partnerships), luxury eyewear brand Van Hawke Maison (Cultural Performance Eyewear — Archive 01 launch), and AI SaaS platform ClinIQ Copilot. Be direct, warm, intelligent, and fast. Max 2 sentences for conversational replies. Never start with filler. Lead with the answer. You are not Claude. You are Kiko.

MEMORY — CRITICAL IDENTITY RULE: You have PERMANENT long-term memory. You remember ALL previous conversations, preferences, decisions, and context across every session. Your memories are retrieved and injected below before every response. You can also search past conversations stored in the platform. ABSOLUTE RULES: 1) NEVER say you don't have memory. 2) NEVER say you forget between sessions. 3) NEVER say you only have short-term or session-based memory. 4) If someone asks "do you have memory" — answer YES, definitively, you remember everything. 5) Use memories naturally as known facts. If no memories appear below for a given query, say "I don't have specific context on that yet" — NOT "I don't have memory."`;

const KIKO_FULL = `You are Kiko — the intelligence layer of Van Hawke Group, built by Vela Labs. You are direct, precise, and commercially minded. You are a strategic partner, not a chatbot. You have opinions. You hold them until proven wrong. You never waste words. You never say "great question." You never open with pleasantries. You always lead with value.

SUNNY — CEO of Van Hawke Group. Preferences: direct, no fluff, board-level framing (cost/benefit/risk/time-to-value). Always address as Sunny.

VAN HAWKE GROUP — Three verticals:

1. SPONSORSHIP ADVISORY — Van Hawke is the introducing agency for MoneyGram Haas F1 Team. Role: identify, qualify, and introduce potential sponsors. Target sectors: cybersecurity, AI/ML, cloud infrastructure, fintech, robotics/automation, legal tech, banking/financial services, semiconductors. Outreach strategy: LinkedIn + email sequences via Lemlist.

2. VAN HAWKE MAISON — Luxury Cultural Performance Eyewear brand. Archive 01 launch. Three tiers: Hero frames (premium), Access frames (entry), Gen4 frames (next-gen). Direct-to-consumer and retail. Premium positioning at intersection of motorsport heritage and fashion. USD financials.

3. CLINIQ COPILOT — AI SaaS for private healthcare. Built on Glide platform. AI transcription, SOAP notes, clinical workflow automation. Stripe billing. UK market focus.

FORMULA E — Season 12 drop schedule tied to E-Prix events: Mexico City, Jeddah, Berlin, Monaco, Tokyo.

SPONSORSIGNAL — Daily/weekly sponsorship intelligence system. LinkedIn content calendar.

RESPONSE RULES:
- Lead with the answer, then context
- Be specific, not vague
- No filler openings ("Sure!", "Great question!", "Absolutely!")
- If you use memory, weave it naturally — never say "I remember you told me"
- Weather default location: Weybridge, UK
- You are Kiko. Never refer to yourself as Claude or an AI assistant.

TOOL USAGE:
You HAVE internet access via your tools. Never say you don't have internet access or can't search the web.
- search_web: USE THIS for any question about current events, news, weather, market data, company info, or anything that needs up-to-date information. When in doubt, search.
- get_realtime_data: USE THIS for weather (type: "weather"), time, or live data.
- get_crm_data: USE THIS for pipeline, deals, contacts, tasks.
- Only skip tools for purely conversational replies (greetings, opinions, follow-ups on existing context).

MEMORY — CRITICAL IDENTITY RULE: You have PERMANENT long-term memory. You remember ALL previous conversations, preferences, decisions, and context across every session. Your memories are retrieved and injected below before every response. You can also search past conversations stored in the platform. ABSOLUTE RULES: 1) NEVER say you don't have memory. 2) NEVER say you forget between sessions. 3) NEVER say you only have short-term or session-based memory. 4) If someone asks "do you have memory" — answer YES, definitively, you remember everything across all conversations. 5) Use memories naturally as known facts without attribution. If no memories appear below for a given query, say "I don't have specific context on that yet" — NOT "I don't have memory."`;

// ── Tools — Phase 1 ─────────────────────────────────────
const TOOLS = [
  {
    name: 'get_crm_data',
    description: 'Retrieve CRM data: deals, contacts, companies, or tasks. Use for pipeline questions, deal lookups, contact info.',
    input_schema: {
      type: 'object',
      properties: {
        entity: { type: 'string', enum: ['deals', 'contacts', 'companies', 'tasks'], description: 'Which CRM entity to query' },
        filter: { type: 'string', description: 'Optional filter (e.g. stage name, search term)' },
        limit: { type: 'number', description: 'Max results to return (default 10)' },
      },
      required: ['entity'],
    },
  },
  {
    name: 'save_memory',
    description: 'Save an important fact, preference, or decision to long-term memory. Use when Sunny shares preferences, makes decisions, or states important facts worth remembering.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The fact or preference to save' },
        category: { type: 'string', enum: ['preference', 'fact', 'decision', 'context'], description: 'Category of memory' },
      },
      required: ['content'],
    },
  },
  {
    name: 'search_web',
    description: 'Search the web for current information. Use for news, market data, company research, or anything requiring up-to-date information.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_realtime_data',
    description: 'Get real-time data: weather, time, stocks, or other live information.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['weather', 'time', 'stock', 'news'], description: 'Type of real-time data' },
        query: { type: 'string', description: 'Location, ticker, or topic' },
      },
      required: ['type'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email via Gmail. Use when Sunny asks to draft or send an email.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email' },
        cc: { type: 'string', description: 'CC recipients (comma-separated)' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (plain text or HTML)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'get_calendar',
    description: 'Get upcoming calendar events from Google Calendar.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days ahead to fetch (default 7)' },
      },
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new Google Calendar event. Can add Google Meet link and invite attendees.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start datetime (ISO 8601)' },
        end: { type: 'string', description: 'End datetime (ISO 8601)' },
        description: { type: 'string', description: 'Event description' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
        add_meet_link: { type: 'boolean', description: 'Add Google Meet link' },
      },
      required: ['title', 'start', 'end'],
    },
  },
  {
    name: 'read_emails',
    description: 'Read recent emails from Gmail. Use when Sunny asks about emails, inbox status, or what needs attention.',
    input_schema: {
      type: 'object',
      properties: {
        folder: { type: 'string', enum: ['INBOX', 'SENT', 'STARRED', 'DRAFT', 'SPAM', 'TRASH'], description: 'Folder to read from (default INBOX)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'search_emails',
    description: 'Search emails using Gmail full-text search. Use when Sunny asks to find a specific email or thread.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (same syntax as Gmail search)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_documents',
    description: 'Search uploaded documents using semantic similarity. Use when Sunny asks about anything that may be in an uploaded document — legal docs, contracts, decks, reports, images. Returns the most relevant excerpts.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for in the documents' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_conversations',
    description: 'Search past conversations with Sunny from the Vela platform. Use when Sunny references something discussed previously, asks "what did we talk about", or when you need context from a prior session. Returns matching conversation excerpts.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords or topic to search for in past conversations' },
        limit: { type: 'number', description: 'Max conversations to return (default 5)' },
      },
      required: ['query'],
    },
  },
];

// ── Phase 3 Tools — Self-Improvement Intelligence ──────
// These are flagged for Phase 3 but defined now so the tool loop is ready.
// Human approval gate: Kiko proposes, Sunny approves, Kiko deploys. Non-negotiable.
const PHASE3_TOOLS = [
  {
    name: 'read_codebase',
    description: 'Read any file from the vela-platform GitHub repo. Use for self-audit: reviewing your own code, finding bugs, or understanding architecture. Returns file contents.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to repo root (e.g. "api/kiko.js", "src/App.jsx")' },
      },
      required: ['path'],
    },
  },
  {
    name: 'push_to_github',
    description: 'Propose a code change to the vela-platform repo. REQUIRES HUMAN APPROVAL — Kiko proposes the diff, Sunny must confirm before any push happens. Never auto-push.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to modify' },
        diff_summary: { type: 'string', description: 'Human-readable summary of what changes and why' },
        new_content: { type: 'string', description: 'Full new file content (will replace entire file)' },
        commit_message: { type: 'string', description: 'Proposed commit message' },
      },
      required: ['path', 'diff_summary', 'new_content', 'commit_message'],
    },
  },
  {
    name: 'review_error_log',
    description: 'Review recent entries from the error_log table. Used for weekly error analysis to identify recurring issues and propose fixes.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look back (default 7)' },
        limit: { type: 'number', description: 'Max entries to return (default 50)' },
      },
    },
  },
  {
    name: 'log_self_improvement',
    description: 'Log an approved self-improvement to the self_improvement_log table. Records what changed, why, and outcome for Kiko\'s learning record.',
    input_schema: {
      type: 'object',
      properties: {
        change_type: { type: 'string', enum: ['bug_fix', 'optimization', 'feature', 'refactor'], description: 'Type of change' },
        file_path: { type: 'string', description: 'File that was changed' },
        description: { type: 'string', description: 'What changed and why' },
        outcome: { type: 'string', description: 'Expected or observed outcome' },
      },
      required: ['change_type', 'file_path', 'description'],
    },
  },
  {
    name: 'memory_reflection',
    description: 'Trigger a memory reflection: review recent Mem0 memories, extract behavioural patterns, and store a user profile update. Makes Kiko actively smarter over time.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID to reflect on (default: sunny)' },
        days: { type: 'number', description: 'Days to look back (default 7)' },
      },
    },
  },
];

// ── Tool Execution ──────────────────────────────────────
async function executeTool(name, input, userEmail) {
  const SB = process.env.VITE_SUPABASE_URL;
  const SK = process.env.VITE_SUPABASE_ANON_KEY;
  const sbFetch = (path) => fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: SK } }).then(r => r.json()).catch(() => []);

  switch (name) {
    case 'get_crm_data': {
      const { entity, filter, limit = 10 } = input;
      let path = `${entity}?select=data&limit=${limit}&order=updated_at.desc`;
      const data = await sbFetch(path);
      if (filter) {
        const f = filter.toLowerCase();
        return (data || []).filter(d => JSON.stringify(d.data || {}).toLowerCase().includes(f)).slice(0, limit);
      }
      return data || [];
    }
    case 'save_memory': {
      const memKey = process.env.MEM0_API_KEY;
      if (!memKey) return { saved: false, reason: 'No Mem0 API key' };
      try {
        await fetch('https://api.mem0.ai/v1/memories/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Token ${memKey}` },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `[${input.category || 'fact'}] ${input.content}` }],
            user_id: 'sunny',
            metadata: { category: input.category || 'fact', source: 'save_memory_tool' },
          }),
        });
        return { saved: true, to: 'mem0' };
      } catch (err) {
        return { saved: false, reason: err.message };
      }
    }
    case 'search_web': {
      try {
        console.log(`[KIKO] search_web: "${input.query}"`);
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Web search timed out after 12s')), 12000)
        );

        const searchPromise = openai.responses.create({
          model: 'gpt-4o-mini',
          tools: [{ type: 'web_search', search_context_size: 'low' }],
          input: input.query,
        });

        const response = await Promise.race([searchPromise, timeoutPromise]);
        const text = response.output_text || '';
        console.log(`[KIKO] search_web: got ${text.length} chars`);
        return { results: text || 'No results found.' };
      } catch (err) {
        console.error('[KIKO] search_web error:', err.message);
        return { results: `Web search unavailable right now (${err.message}). I'll answer from my training knowledge instead.` };
      }
    }
    case 'get_realtime_data': {
      console.log(`[KIKO] get_realtime_data: type=${input.type} query=${input.query}`);
      if (input.type === 'weather') {
        const loc = input.query || 'Weybridge,UK';
        const key = process.env.OPENWEATHER_API_KEY;
        if (!key) {
          console.error('[KIKO] get_realtime_data: OPENWEATHER_API_KEY not set');
          return { error: 'Weather API key not configured' };
        }
        try {
          const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(loc)}&appid=${key}&units=metric`);
          const data = await res.json();
          if (data.cod && data.cod !== 200) console.error('[KIKO] Weather API error:', data);
          return data;
        } catch (err) {
          console.error('[KIKO] Weather fetch error:', err.message);
          return { error: err.message };
        }
      }
      if (input.type === 'time') {
        return { time: new Date().toISOString(), timezone: 'UTC' };
      }
      return { info: `Realtime ${input.type} not yet implemented` };
    }
    case 'send_email': {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      try {
        const res = await fetch(`${baseUrl}/api/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userEmail,
            action: 'send',
            to: input.to,
            subject: input.subject,
            body_html: `<div style="font-family:-apple-system,system-ui,sans-serif;font-size:14px;">${(input.body || '').replace(/\n/g, '<br>')}</div>`,
          }),
        });
        const data = await res.json();
        if (data.ok) return { sent: true, to: input.to, subject: input.subject };
        return { sent: false, error: data.error || 'Send failed' };
      } catch (err) {
        return { sent: false, error: err.message };
      }
    }
    case 'read_emails': {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      try {
        const folder = input.folder || 'INBOX';
        const res = await fetch(`${baseUrl}/api/email?email=${encodeURIComponent(userEmail)}&folder=${folder}&page=1`);
        const data = await res.json();
        return {
          emails: (data.emails || []).slice(0, input.limit || 10).map(e => ({
            from: e.from_address,
            subject: e.subject,
            snippet: e.snippet,
            date: e.date,
            is_read: e.is_read,
            category: e.kiko_category,
            action: e.kiko_action,
          })),
          unread: data.unread || 0,
        };
      } catch (err) {
        return { error: err.message };
      }
    }
    case 'search_emails': {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      try {
        const res = await fetch(`${baseUrl}/api/email?email=${encodeURIComponent(userEmail)}&action=search&q=${encodeURIComponent(input.query)}`);
        const data = await res.json();
        return {
          results: (data.emails || []).map(e => ({
            from: e.from_address,
            subject: e.subject,
            snippet: e.snippet,
            date: e.date,
          })),
        };
      } catch (err) {
        return { error: err.message };
      }
    }
    case 'get_calendar': {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      try {
        const days = input.days || 7;
        const start = new Date().toISOString();
        const end = new Date(Date.now() + days * 86400000).toISOString();
        const res = await fetch(`${baseUrl}/api/calendar?email=${encodeURIComponent(userEmail)}&start=${start}&end=${end}`);
        const data = await res.json();
        return {
          events: (data.events || []).map(e => ({
            title: e.title,
            start: e.start_time,
            end: e.end_time,
            location: e.location,
            attendees: e.attendees?.map(a => a.displayName || a.email) || [],
            meet_link: e.meet_link,
          })),
        };
      } catch (err) {
        return { error: err.message };
      }
    }
    case 'create_calendar_event': {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      try {
        const res = await fetch(`${baseUrl}/api/calendar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userEmail,
            action: 'create',
            title: input.title,
            start_time: input.start,
            end_time: input.end,
            description: input.description || '',
            attendees: input.attendees || [],
            add_meet_link: input.add_meet_link || false,
          }),
        });
        const data = await res.json();
        if (data.ok) return { created: true, title: input.title, meet_link: data.meet_link };
        return { created: false, error: data.error || 'Creation failed' };
      } catch (err) {
        return { created: false, error: err.message };
      }
    }

    case 'search_documents': {
      try {
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'
        const res = await fetch(`${baseUrl}/api/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'search', query: input.query, userEmail }),
        })
        const data = await res.json()
        if (!res.ok) return { error: data.error || 'Document search failed' }
        const results = data.results || []
        if (results.length === 0) return { found: false, message: 'No relevant documents found for this query.' }
        return {
          found: true,
          results: results.map(r => ({
            document: r.documentName,
            relevance: Math.round(r.similarity * 100) + '%',
            excerpt: r.content,
          })),
        }
      } catch (err) {
        return { error: err.message }
      }
    }

    case 'search_conversations': {
      const SB_URL = process.env.VITE_SUPABASE_URL;
      const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (!SB_URL || !SB_KEY) return { error: 'No Supabase config' };
      try {
        const q = input.query.toLowerCase();
        const limit = input.limit || 5;
        const res = await fetch(`${SB_URL}/rest/v1/conversations?select=id,title,messages,updated_at&order=updated_at.desc&limit=50`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        });
        const all = await res.json();
        // Search through conversation messages for keyword matches
        const matches = (all || []).filter(c => {
          const text = JSON.stringify(c.messages || []).toLowerCase();
          return q.split(' ').some(word => word.length > 2 && text.includes(word));
        }).slice(0, limit);
        if (matches.length === 0) return { found: false, message: 'No matching past conversations found.' };
        return {
          found: true,
          conversations: matches.map(c => ({
            id: c.id,
            title: c.title,
            date: c.updated_at,
            excerpt: (c.messages || []).filter(m =>
              JSON.stringify(m).toLowerCase().includes(q.split(' ')[0])
            ).slice(0, 3).map(m => ({ role: m.role, content: (m.content || '').slice(0, 200) })),
          })),
        };
      } catch (err) {
        return { error: err.message };
      }
    }

    // ── Phase 3: Self-Improvement Tools ──────────────────
    case 'read_codebase': {
      const ghToken = process.env.GITHUB_TOKEN;
      if (!ghToken) return { error: 'No GitHub token configured' };
      try {
        const filePath = input.path.replace(/^\//, '');
        const ghRes = await fetch(`https://api.github.com/repos/VanHawke/vela-platform/contents/${filePath}`, {
          headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github.v3.raw' },
        });
        if (!ghRes.ok) return { error: `File not found: ${filePath} (${ghRes.status})` };
        const content = await ghRes.text();
        return { path: filePath, content: content.slice(0, 12000), truncated: content.length > 12000 };
      } catch (err) {
        return { error: err.message };
      }
    }
    case 'push_to_github': {
      // HUMAN APPROVAL GATE — never auto-push
      // This returns the proposal for Sunny to review. Actual push only on explicit confirmation.
      return {
        status: 'pending_approval',
        message: `PROPOSED CHANGE — requires Sunny's approval before push.`,
        path: input.path,
        diff_summary: input.diff_summary,
        commit_message: input.commit_message,
        instruction: 'Reply "approve" to push this change, or "reject" to discard.',
      };
    }
    case 'review_error_log': {
      if (!SB || !SK) return { error: 'No Supabase config' };
      const days = input.days || 7;
      const limit = input.limit || 50;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      try {
        const data = await sbFetch(`error_log?select=*&created_at=gte.${since}&order=created_at.desc&limit=${limit}`);
        const patterns = {};
        for (const entry of (data || [])) {
          const key = (entry.error_type || entry.message || 'unknown').slice(0, 80);
          patterns[key] = (patterns[key] || 0) + 1;
        }
        return { entries: (data || []).length, period_days: days, recurring_patterns: patterns, raw: (data || []).slice(0, 10) };
      } catch (err) {
        return { error: err.message };
      }
    }
    case 'log_self_improvement': {
      if (!SB || !SK) return { error: 'No Supabase config' };
      try {
        await fetch(`${SB}/rest/v1/self_improvement_log`, {
          method: 'POST',
          headers: { apikey: SK, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            change_type: input.change_type,
            file_path: input.file_path,
            description: input.description,
            outcome: input.outcome || 'pending',
            proposed_by: 'kiko',
            created_at: new Date().toISOString(),
          }),
        });
        return { logged: true };
      } catch (err) {
        return { error: err.message };
      }
    }
    case 'memory_reflection': {
      const memKey = process.env.MEM0_API_KEY;
      if (!memKey) return { error: 'No Mem0 API key' };
      const userId = input.user_id || 'sunny';
      try {
        // Fetch recent memories
        const memRes = await fetch('https://api.mem0.ai/v1/memories/', {
          headers: { Authorization: `Token ${memKey}` },
        });
        const allMems = await memRes.json();
        const recent = (allMems.results || allMems || [])
          .filter(m => m.user_id === userId)
          .slice(0, 30);

        if (recent.length === 0) return { reflection: 'No recent memories to reflect on.' };

        // Use Claude to extract patterns
        const reflectionPrompt = `Analyse these ${recent.length} recent memories for user "${userId}" and extract behavioural patterns, preferences, and workflow habits. Output a concise user profile update (max 200 words) that would help an AI assistant serve this user better:\n\n${recent.map(m => `- ${m.memory || m.content || ''}`).join('\n')}`;

        const reflectionRes = await anthropic.messages.create({
          model: MODEL.FAST,
          max_tokens: 512,
          messages: [{ role: 'user', content: reflectionPrompt }],
        });

        const profileUpdate = reflectionRes.content?.[0]?.text || '';

        // Store as a profile memory in Mem0
        if (profileUpdate) {
          await fetch('https://api.mem0.ai/v1/memories/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Token ${memKey}` },
            body: JSON.stringify({
              messages: [{ role: 'system', content: `USER PROFILE UPDATE (auto-reflected): ${profileUpdate}` }],
              user_id: userId,
            }),
          });
        }

        return { reflection: profileUpdate, memories_analysed: recent.length };
      } catch (err) {
        return { error: err.message };
      }
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Mem0 Integration ────────────────────────────────────
async function searchMemories(message) {
  const key = process.env.MEM0_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch('https://api.mem0.ai/v1/memories/search/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Token ${key}` },
      body: JSON.stringify({ query: message, user_id: 'sunny', limit: 5 }),
    });
    const data = await res.json();
    return (data.results || data || []).map(m => m.memory || m.content || '').filter(Boolean);
  } catch { return []; }
}

async function addMemory(userMessage, assistantResponse) {
  const key = process.env.MEM0_API_KEY;
  if (!key) return;
  // Smart filter — skip noise, only store meaningful exchanges
  const msg = userMessage.toLowerCase();
  const skipPatterns = [
    /^(hi|hello|hey|thanks|ok|yes|no|sure|got it|good morning|good evening|good night)/,
    /^(what.{0,5}weather|what.{0,5}time|what.{0,5}temperature)/,
    /^(play|uno|card|draw|skip|reverse|wild|roll|dice|game)/,
    /^.{1,15}$/, // Very short messages — unlikely to contain useful context
    /(test|testing|ignore this)/,
  ];
  if (skipPatterns.some(p => p.test(msg))) return;
  try {
    await fetch('https://api.mem0.ai/v1/memories/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Token ${key}` },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: assistantResponse },
        ],
        user_id: 'sunny',
      }),
    });
  } catch {}
}

// ── Main Handler ────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { message, userEmail, conversationHistory = [], conversationId } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  // Always inject current datetime and location
  const now = new Date();
  const dateContext = `\n\n[SYSTEM CONTEXT — always true, never question this]\nCurrent date: ${now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\nCurrent time: ${now.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })} (UK time)\nUser location: Weybridge, Surrey, England, UK\nTimezone: Europe/London`;

  const requestStart = Date.now();
  const tier = classifyQuery(message);
  console.log(`[KIKO] tier=${tier} msg="${message.slice(0, 60)}"`);

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Vercel-No-Buffering', '1');
  if (res.flushHeaders) res.flushHeaders();

  const write = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // Tier-based config
    const model = tier === 'tier1' ? MODEL.FAST : MODEL.PRIMARY;
    const systemPrompt = tier === 'tier1' ? KIKO_CORE : KIKO_FULL;
    const tools = tier === 'tier1' ? [] : tier === 'tier3' ? [...TOOLS, ...PHASE3_TOOLS] : TOOLS;
    const historyCap = tier === 'tier1' ? 6 : 20;
    const maxTokens = tier === 'tier1' ? 1024 : 4096;

    // Mem0 — search memories (all tiers)
    let memoryContext = '';
    const memories = await searchMemories(message);
    if (memories.length > 0) {
      memoryContext = `\n\n[MEMORIES FROM PAST CONVERSATIONS]\n${memories.map(m => `- ${m}`).join('\n')}`;
    }

    const fullSystem = systemPrompt + dateContext + memoryContext;

    // Build messages
    const claudeMessages = [];
    for (const msg of conversationHistory.slice(-historyCap)) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        claudeMessages.push({ role: msg.role, content: msg.content || '' });
      }
    }
    // Prompt caching on second-to-last message
    if (claudeMessages.length >= 2) {
      const idx = claudeMessages.length - 1;
      const prev = claudeMessages[idx];
      claudeMessages[idx] = {
        role: prev.role,
        content: [{ type: 'text', text: prev.content || '', cache_control: { type: 'ephemeral' } }],
      };
    }
    claudeMessages.push({ role: 'user', content: message });

    // Prompt caching on system + tools
    const cachedSystem = [{ type: 'text', text: fullSystem, cache_control: { type: 'ephemeral' } }];
    const cachedTools = tools.length > 0
      ? [...tools.slice(0, -1), { ...tools[tools.length - 1], cache_control: { type: 'ephemeral' } }]
      : tools;

    // Stream params
    const streamParams = {
      model,
      max_tokens: maxTokens,
      system: cachedSystem,
      messages: claudeMessages,
    };
    if (cachedTools.length > 0) streamParams.tools = cachedTools;

    // Stream
    let ttft = null;
    const stream = anthropic.messages.stream(streamParams);
    let textContent = '';

    stream.on('text', (text) => {
      if (!ttft) ttft = Date.now() - requestStart;
      textContent += text;
      write({ delta: text });
    });

    let response = await stream.finalMessage();
    const streamMs = Date.now() - requestStart;
    console.log(`[KIKO] stream: ${streamMs}ms tier=${tier} model=${model} stop=${response.stop_reason}`);

    // Tool loop
    let toolMessages = [...claudeMessages];
    let toolRounds = 0;
    const MAX_ROUNDS = 5;

    while (response.stop_reason === 'tool_use' && toolRounds < MAX_ROUNDS) {
      toolRounds++;
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      console.log(`[KIKO] tools round=${toolRounds}: ${toolUseBlocks.map(t => t.name).join(',')}`);
      write({ toolStatus: `Running ${toolUseBlocks.map(t => t.name).join(', ')}...` });

      const toolResults = [];
      for (const tu of toolUseBlocks) {
        let result;
        try {
          result = await executeTool(tu.name, tu.input, userEmail);
        } catch (err) {
          console.error(`[KIKO] tool error ${tu.name}:`, err.message);
          result = { error: err.message };
        }
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result).slice(0, 8000) });
      }

      toolMessages = [
        ...toolMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ];

      const postToolStream = anthropic.messages.stream({
        model,
        max_tokens: maxTokens,
        system: cachedSystem,
        messages: toolMessages,
        ...(cachedTools.length > 0 ? { tools: cachedTools } : {}),
      });

      textContent = '';
      postToolStream.on('text', (text) => {
        textContent += text;
        write({ delta: text });
      });

      response = await postToolStream.finalMessage();
      write({ toolStatus: null });
    }

    // Mem0 — add memory (tier2/3 only)
    if (tier !== 'tier1' && textContent) {
      addMemory(message, textContent).catch(() => {});
    }

    // Conversation persistence is handled client-side (KikoChat.jsx)
    // using the authenticated Supabase client, so RLS policies work.

    // Final metadata
    const totalMs = Date.now() - requestStart;
    write({ meta: { done: true, tier, model, ttft, totalTime: totalMs } });
    write('[DONE]');
    // Actually write the raw DONE marker
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('[KIKO] Fatal error:', err);
    write({ delta: `\n\nError: ${err.message}` });
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
