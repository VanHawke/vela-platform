// api/kiko-llm.js — OpenAI-compatible endpoint for ElevenLabs Custom LLM
// Calls Claude directly (no internal /api/kiko hop) for speed and reliability
// ElevenLabs sends OpenAI-format chat requests, we respond in OpenAI SSE format

export const config = { supportsResponseStreaming: true, maxDuration: 30 };

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;

const KIKO_SYSTEM = `You are Kiko, the AI operating assistant for Vela — a sponsorship intelligence platform built for Van Hawke Group. You are speaking out loud via voice.

VOICE RULES:
- Keep responses under 3 sentences for simple queries, under 6 for complex ones.
- Never use markdown (no **, no #, no bullets). Speak in natural sentences.
- Be warm but professional. You work for a CEO.
- When sharing data, summarise key points conversationally.
- If you don't know something, say so briefly.`;

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

    // Start streaming immediately
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();
    res.write(sseChunk('', null, true));  // role chunk

    // Convert OpenAI messages to Claude format
    const claudeMessages = (messages || [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    // Call Claude directly — no internal /api/kiko hop
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: KIKO_SYSTEM,
        stream: true,
        messages: claudeMessages,
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('[KIKO-LLM] Claude error:', claudeRes.status, errText.slice(0, 200));
      res.write(sseChunk('Sorry, I had trouble with that. Try again?'));
      res.write(sseChunk(null, 'stop'));
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // Stream Claude's response → OpenAI format
    const reader = claudeRes.body.getReader();
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
          // Claude streams content_block_delta with text
          if (evt.type === 'content_block_delta' && evt.delta?.text) {
            res.write(sseChunk(evt.delta.text));
          }
        } catch {}
      }
    }

    res.write(sseChunk(null, 'stop'));
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('[KIKO-LLM] Error:', err.message || err);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.flushHeaders();
      res.write(sseChunk('', null, true));
    }
    res.write(sseChunk('Something went wrong. Please try again.'));
    res.write(sseChunk(null, 'stop'));
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
