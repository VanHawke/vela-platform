import Anthropic from '@anthropic-ai/sdk';

export const config = { supportsResponseStreaming: true };

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_KEY,
  defaultHeaders: {
    'anthropic-beta': 'prompt-caching-2024-07-31'
  }
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
const KIKO_CORE = `You are Kiko, the AI for Van Hawke Group. Sunny is the CEO. Van Hawke has three verticals: sponsorship advisory (introducing agency for Haas F1 Team, Formula E partnerships), luxury eyewear brand Van Hawke Maison (Cultural Performance Eyewear — Archive 01 launch), and AI SaaS platform ClinIQ Copilot. Be direct, warm, intelligent, and fast. Max 2 sentences for conversational replies. Never start with filler. Lead with the answer. You are not Claude. You are Kiko.`;

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
Before making any tool call, ask: does this query actually need live data? If it's conversational, factual from context, or answerable from session history — answer directly. Only call tools when the query explicitly needs current CRM data, live web results, memory lookup, or calendar/email data.`;

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
    description: 'Create a new Google Calendar event.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start datetime (ISO 8601)' },
        end: { type: 'string', description: 'End datetime (ISO 8601)' },
        description: { type: 'string', description: 'Event description' },
      },
      required: ['title', 'start', 'end'],
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
      if (!SB || !SK) return { saved: false, reason: 'No Supabase config' };
      await fetch(`${SB}/rest/v1/ai_memory`, {
        method: 'POST',
        headers: { apikey: SK, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          content: input.content,
          type: input.category || 'fact',
          importance_score: 0.8,
          user_id: userEmail,
          created_at: new Date().toISOString(),
        }),
      });
      return { saved: true };
    }
    case 'search_web': {
      try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
        const res = await openai.responses.create({
          model: 'gpt-4o-mini',
          tools: [{ type: 'web_search_preview' }],
          input: input.query,
        });
        const text = res.output?.filter(o => o.type === 'message')?.map(o => o.content?.map(c => c.text).join('')).join('\n') || 'No results found.';
        return { results: text };
      } catch (err) {
        return { error: err.message };
      }
    }
    case 'get_realtime_data': {
      if (input.type === 'weather') {
        const loc = input.query || 'Weybridge,UK';
        const key = process.env.OPENWEATHER_API_KEY;
        if (!key) return { error: 'No weather API key' };
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(loc)}&appid=${key}&units=metric`);
        return await res.json();
      }
      if (input.type === 'time') {
        return { time: new Date().toISOString(), timezone: 'UTC' };
      }
      return { info: `Realtime ${input.type} not yet implemented` };
    }
    case 'send_email':
      return { status: 'placeholder', message: 'Email sending will be implemented in api/gmail.js' };
    case 'get_calendar':
      return { status: 'placeholder', message: 'Calendar will be implemented in api/calendar.js' };
    case 'create_calendar_event':
      return { status: 'placeholder', message: 'Calendar creation will be implemented in api/calendar.js' };
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
    const tools = tier === 'tier1' ? [] : TOOLS;
    const historyCap = tier === 'tier1' ? 6 : 20;
    const maxTokens = tier === 'tier1' ? 1024 : 4096;

    // Mem0 — search memories (tier2/3 only)
    let memoryContext = '';
    if (tier !== 'tier1') {
      const memories = await searchMemories(message);
      if (memories.length > 0) {
        memoryContext = `\n\n[MEMORY CONTEXT — weave naturally, never say "I remember"]\n${memories.join('\n')}`;
      }
    }

    const fullSystem = systemPrompt + memoryContext;

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

    // Save conversation to Supabase
    const SB = process.env.VITE_SUPABASE_URL;
    const SK = process.env.VITE_SUPABASE_ANON_KEY;
    if (SB && SK && userEmail) {
      const allMessages = [
        ...conversationHistory,
        { role: 'user', content: message },
        { role: 'assistant', content: textContent },
      ];
      const title = conversationHistory.length === 0 ? message.slice(0, 60) : undefined;

      if (conversationId) {
        fetch(`${SB}/rest/v1/conversations?id=eq.${conversationId}`, {
          method: 'PATCH',
          headers: { apikey: SK, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ messages: allMessages, updated_at: new Date().toISOString() }),
        }).catch(() => {});
      } else {
        const newConv = {
          user_id: userEmail,
          title: title || 'New conversation',
          messages: allMessages,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        fetch(`${SB}/rest/v1/conversations`, {
          method: 'POST',
          headers: { apikey: SK, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify(newConv),
        }).then(r => r.json()).then(data => {
          if (data?.[0]?.id) write({ conversationId: data[0].id });
        }).catch(() => {});
      }
    }

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
