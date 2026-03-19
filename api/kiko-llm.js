// api/kiko-llm.js — OpenAI-compatible chat completion endpoint for ElevenLabs Custom LLM
// ElevenLabs sends requests here in OpenAI format, we call Claude via kiko.js and stream back
// CRITICAL: Must respond within ~2s or ElevenLabs drops the connection

export const config = { supportsResponseStreaming: true, maxDuration: 60 };

// Generate OpenAI-compatible SSE chunk
function sseChunk(content, finishReason = null, isFirst = false) {
  let delta;
  if (finishReason) {
    delta = {};
  } else if (isFirst) {
    delta = { role: 'assistant' };  // first chunk: role only, no content
  } else {
    delta = { content };
  }
  const chunk = {
    id: `chatcmpl-kiko-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'kiko-claude',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
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
    const userMessages = (messages || []).filter(m => m.role === 'user');
    const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';

    if (!lastUserMsg) return res.status(400).json({ error: 'No user message' });

    console.log('[KIKO-LLM] Query:', lastUserMsg.slice(0, 80));

    // CRITICAL: Set headers and send first chunk IMMEDIATELY
    // ElevenLabs drops connection if no response within ~3 seconds
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();  // Force headers out immediately

    // Send role chunk + buffer word instantly — prevents ElevenLabs timeout
    res.write(sseChunk('', null, true));  // role: assistant
    res.write(sseChunk('... '));          // buffer word: "Hmm..."

    // Build conversation history for kiko.js
    const history = (messages || [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map(m => ({ role: m.role === 'assistant' ? 'kiko' : 'user', text: m.content }));

    // Call kiko.js — streams response via SSE
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
      res.write(sseChunk('Sorry, I had trouble processing that. Could you try again?'));
      res.write(sseChunk(null, 'stop'));
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // Stream kiko.js SSE → OpenAI SSE format
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
          if (parsed.delta) {
            // Strip markdown for voice output
            let text = parsed.delta
              .replace(/\*\*/g, '')
              .replace(/^#{1,3}\s+/gm, '')
              .replace(/^[-•]\s+/gm, '')
              .replace(/\n{2,}/g, '. ');
            if (text.trim()) res.write(sseChunk(text));
          }
          if (parsed.toolStatus) {
            res.write(sseChunk('... '));  // buffer word during tool calls
          }
        } catch {}
      }
    }

    // Finish
    res.write(sseChunk(null, 'stop'));
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('[KIKO-LLM] Error:', err);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    try {
      res.write(sseChunk('', null, true));
      res.write(sseChunk('Sorry, something went wrong. Please try again.'));
      res.write(sseChunk(null, 'stop'));
      res.write('data: [DONE]\n\n');
    } catch {}
    res.end();
  }
}
