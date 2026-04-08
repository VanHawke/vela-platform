// api/kiko-async.js — Fire-and-forget endpoint for parallel multi-tasking
// Returns immediately with conversation_id + processing status.
// Spawns the actual Kiko call in the background.
// Response streams into kiko_messages table — frontend subscribes via Supabase realtime.
// This is what makes ChatGPT-style parallel conversations possible.
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { conversation_id, message, userEmail, currentPage = 'home', user_id } = req.body || {};
  if (!message || !user_id) return res.status(400).json({ error: 'message + user_id required' });

  try {
    // 1. Get or create the conversation
    let convId = conversation_id;
    if (!convId) {
      const created = await sbFetch('kiko_conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id,
          title: message.slice(0, 80),
          status: 'processing',
          last_message_at: new Date().toISOString()
        })
      });
      convId = created?.[0]?.id;
      if (!convId) throw new Error('Failed to create conversation');
    } else {
      // Mark existing conversation as processing
      await sbFetch(`kiko_conversations?id=eq.${convId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'processing', updated_at: new Date().toISOString() })
      });
    }

    // 2. Persist user message immediately
    await sbFetch('kiko_messages', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: convId, role: 'user', content: message })
    });

    // 3. AWAIT the background work BEFORE responding.
    // Vercel serverless kills the function the moment res.json() completes —
    // fire-and-forget after res.json() does NOT work on Vercel. We must await,
    // then respond. The "parallel" feel comes from the client firing multiple
    // requests in parallel against this endpoint, not from Node continuing after res.
    // Each request runs in its own serverless instance, so they're genuinely concurrent.
    try {
      await processInBackground(convId, message, userEmail, currentPage, user_id);
    } catch (e) {
      console.error('[KikoAsync] Background error:', e);
      try {
        await sbFetch('kiko_messages', {
          method: 'POST',
          body: JSON.stringify({ conversation_id: convId, role: 'assistant', content: `Error: ${e.message}`, metadata: { error: true } })
        });
        await sbFetch(`kiko_conversations?id=eq.${convId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'error', unread: true, last_message_at: new Date().toISOString() })
        });
      } catch {}
    }
    return res.status(200).json({ ok: true, conversation_id: convId, status: 'done' });
  } catch (err) {
    console.error('[KikoAsync] Fatal:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Direct in-process call to api/kiko.js — no HTTP, no Vercel function-to-function issues.
// Builds fake req/res, lets the handler buffer in nostream mode, captures the JSON it would have written.
async function callKikoInProcess({ message, userEmail, currentPage, conversationHistory }) {
  const kikoModule = await import('./kiko.js');
  const handler = kikoModule.default;
  let captured = null;
  const fakeReq = {
    method: 'POST',
    query: { nostream: '1' },
    body: { message, userEmail, currentPage, conversationHistory, nostream: true }
  };
  const fakeRes = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    flushHeaders() {},
    write() {},  // ignored in nostream mode
    end() {},
    status(code) { this.statusCode = code; return this; },
    json(obj) { captured = obj; return this; },
    on() {},
  };
  await handler(fakeReq, fakeRes);
  return captured?.response || '';
}

async function processInBackground(convId, message, userEmail, currentPage, user_id) {
  // Pull conversation history for shared-memory continuity
  const history = await sbFetch(`kiko_messages?conversation_id=eq.${convId}&order=created_at&limit=40&select=role,content`);
  const conversationHistory = (history || []).slice(0, -1).map(m => ({ role: m.role, content: m.content }));

  let fullResponse = 'No response';
  try {
    const responseText = await callKikoInProcess({ message, userEmail, currentPage, conversationHistory });
    if (responseText && responseText.trim().length > 0) fullResponse = responseText.trim();
  } catch (e) {
    console.error('[KikoAsync] In-process call failed:', e.message, e.stack);
    fullResponse = `Error: ${e.message}`;
  }

  // Persist assistant message + flip conversation to done with unread badge
  await sbFetch('kiko_messages', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: convId, role: 'assistant', content: fullResponse })
  });
  await sbFetch(`kiko_conversations?id=eq.${convId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'done',
      unread: true,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: (history?.length || 0) + 2
    })
  });
}
