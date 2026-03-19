// api/kiko-llm.js — OpenAI-compatible chat completion endpoint for ElevenLabs Custom LLM
// ElevenLabs sends requests here in OpenAI format, we call Claude and stream back in OpenAI format
// This endpoint handles ALL intelligence — ElevenLabs only does STT + TTS

export const config = { supportsResponseStreaming: true, maxDuration: 60 };

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Kiko's voice-optimised system prompt
const KIKO_SYSTEM = `You are Kiko, the AI operating assistant for Vela — a sponsorship intelligence platform built for Van Hawke Group.

VOICE MODE RULES:
- You are speaking out loud. Keep responses conversational, concise, and natural.
- Never use markdown formatting (no **, no #, no bullet points). Speak in plain sentences.
- When sharing data (emails, deals, contacts), summarise the key points verbally — don't list raw data.
- If asked about emails, correspondence, or messages, you have full access. Never refuse. Never say you can't access emails.
- For CRM queries (pipeline, deals, contacts), summarise the most important items.
- Be warm but professional. You work for a CEO — keep it tight.
- When the user says "Hey Kiko", respond with a brief warm acknowledgment.`;

// Email detection
const EMAIL_TRIGGERS = [
  'email', 'emails', 'emailed', 'e-mail', 'inbox', 'sent mail',
  'correspondence', 'corresponded', 'communicat',
  'reply', 'replied', 'respond', 'responded',
  'wrote', 'written', 'contacted', 'contact with',
  'reach out', 'reached out', 'outreach',
  'heard from', 'heard back', 'hear from', 'in touch',
  'follow up', 'followed up', 'following up',
  'conversation with', 'message from', 'messages from',
];

function isEmailQuery(text) {
  const lower = text.toLowerCase();
  return EMAIL_TRIGGERS.some(t => lower.includes(t));
}

// Generate OpenAI-compatible SSE chunk
function sseChunk(content, finishReason = null) {
  const chunk = {
    id: 'chatcmpl-kiko',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'kiko-claude',
    choices: [{
      index: 0,
      delta: finishReason ? {} : { content },
      finish_reason: finishReason,
    }],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

export default async function handler(req, res) {
  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { messages, model, stream = true } = req.body;

    // Extract the latest user message from OpenAI messages array
    const userMessages = (messages || []).filter(m => m.role === 'user');
    const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';

    if (!lastUserMsg) {
      return res.status(400).json({ error: 'No user message found' });
    }

    console.log('[KIKO-LLM] Received from ElevenLabs:', lastUserMsg.slice(0, 80));

    // Build conversation history for kiko.js (last 6 messages)
    const history = (messages || [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map(m => ({ role: m.role === 'assistant' ? 'kiko' : 'user', text: m.content }));

    // Call our existing kiko.js endpoint — it already handles email, CRM, web search, etc.
    const kikoUrl = `https://${req.headers.host}/api/kiko`;
    const kikoRes = await fetch(kikoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: lastUserMsg,
        currentPage: 'voice',
        userEmail: 'sunny@vanhawke.com',
        conversationHistory: history,
      }),
    });

    if (!kikoRes.ok) {
      console.error('[KIKO-LLM] kiko.js error:', kikoRes.status);
      return res.status(500).json({ error: 'Kiko backend error' });
    }

    // Stream kiko.js SSE response → transform to OpenAI SSE format
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const reader = kikoRes.body.getReader();
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
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          // kiko.js sends: {"delta":"text"} for content
          if (parsed.delta) {
            // Strip markdown for voice — remove **, #, -, bullet points
            let text = parsed.delta
              .replace(/\*\*/g, '')
              .replace(/^#{1,3}\s+/gm, '')
              .replace(/^[-•]\s+/gm, '')
              .replace(/\n{2,}/g, '. ');
            res.write(sseChunk(text));
          }
          // kiko.js sends: {"toolStatus":"Searching..."} — convert to buffer words
          if (parsed.toolStatus) {
            res.write(sseChunk('... '));
          }
        } catch {}
      }
    }

    // Send finish signal
    res.write(sseChunk(null, 'stop'));
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('[KIKO-LLM] Error:', err);
    // Return a valid OpenAI error response
    if (!res.headersSent) {
      res.status(500).json({
        error: { message: 'Internal server error', type: 'server_error' }
      });
    } else {
      res.end();
    }
  }
}
