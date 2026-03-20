// api/kiko-llm.js — OpenAI-compatible endpoint for ElevenLabs Custom LLM
// Routes: email queries → /api/kiko (has Gmail), everything else → Claude Haiku direct
// Responds instantly with buffer words to prevent ElevenLabs timeout

export const config = { supportsResponseStreaming: true, maxDuration: 30 };

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;

const KIKO_SYSTEM = `You are Kiko, the AI operating assistant for Vela — a sponsorship intelligence platform for Van Hawke Group. Speaking out loud via voice.
Rules: Under 3 sentences for simple queries. No markdown. Natural sentences. Warm but professional. You work for a CEO named Sunny.`;

const EMAIL_WORDS = ['email','emails','correspondence','communic','replied','responded','wrote','contacted','outreach','heard from','in touch','follow up','message from','inbox','sent mail'];

function isEmailQuery(text) { return EMAIL_WORDS.some(w => text.toLowerCase().includes(w)); }

function sseChunk(content, finishReason = null, isFirst = false) {
  let delta;
  if (finishReason) delta = {};
  else if (isFirst) delta = { role: 'assistant' };
  else delta = { content };
  return `data: ${JSON.stringify({
    id: `chatcmpl-kiko-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'kiko-claude',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

function startStream(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  res.write(sseChunk('', null, true));
}

function endStream(res) {
  res.write(sseChunk(null, 'stop'));
  res.write('data: [DONE]\n\n');
  res.end();
}

// Stream from a fetch response (kiko.js SSE or Claude SSE) → OpenAI SSE
async function streamResponse(fetchRes, res, isKiko = false) {
  const reader = fetchRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]' || !data) continue;
      try {
        const evt = JSON.parse(data);
        if (isKiko && evt.delta) {
          // kiko.js format: strip markdown for voice
          let text = evt.delta.replace(/\*\*/g, '').replace(/^#{1,3}\s+/gm, '').replace(/^[-•]\s+/gm, '').replace(/\n{2,}/g, '. ');
          if (text.trim()) res.write(sseChunk(text));
        } else if (isKiko && evt.toolStatus) {
          res.write(sseChunk('... '));
        } else if (!isKiko && evt.type === 'content_block_delta' && evt.delta?.text) {
          // Claude format
          res.write(sseChunk(evt.delta.text));
        }
      } catch {}
    }
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { messages } = req.body;
    const userMsgs = (messages || []).filter(m => m.role === 'user');
    const lastMsg = userMsgs[userMsgs.length - 1]?.content || '';
    if (!lastMsg) return res.status(400).json({ error: 'No user message' });

    console.log('[KIKO-LLM] Query:', lastMsg.slice(0, 80));
    startStream(res);

    if (isEmailQuery(lastMsg)) {
      // EMAIL PATH: Route through /api/kiko which has Gmail access
      console.log('[KIKO-LLM] Email query → routing to /api/kiko');
      res.write(sseChunk('... '));  // buffer word while kiko.js processes
      const history = (messages || []).filter(m => m.role === 'user' || m.role === 'assistant').slice(-6)
        .map(m => ({ role: m.role === 'assistant' ? 'kiko' : 'user', text: m.content }));
      const kikoRes = await fetch(`https://${req.headers.host}/api/kiko`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: lastMsg, currentPage: 'voice', userEmail: 'sunny@vanhawke.com', conversationHistory: history }),
      });
      if (!kikoRes.ok) {
        res.write(sseChunk('Sorry, I had trouble accessing email data. Try again?'));
        return endStream(res);
      }
      await streamResponse(kikoRes, res, true);

    } else {
      // FAST PATH: Call Claude Haiku directly (no Vercel hop)
      const claudeMsgs = (messages || []).filter(m => m.role === 'user' || m.role === 'assistant').slice(-10)
        .map(m => ({ role: m.role, content: m.content }));
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, system: KIKO_SYSTEM, stream: true, messages: claudeMsgs }),
      });
      if (!claudeRes.ok) {
        const err = await claudeRes.text();
        console.error('[KIKO-LLM] Claude error:', claudeRes.status, err.slice(0, 200));
        res.write(sseChunk('Sorry, something went wrong. Try again?'));
        return endStream(res);
      }
      await streamResponse(claudeRes, res, false);
    }

    endStream(res);
  } catch (err) {
    console.error('[KIKO-LLM] Error:', err.message || err);
    if (!res.headersSent) startStream(res);
    res.write(sseChunk('Something went wrong. Please try again.'));
    endStream(res);
  }
}
