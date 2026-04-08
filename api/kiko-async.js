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

async function processInBackground(convId, message, userEmail, currentPage, user_id) {
  // Pull conversation history for shared-memory continuity
  const history = await sbFetch(`kiko_messages?conversation_id=eq.${convId}&order=created_at&limit=40&select=role,content`);
  const conversationHistory = (history || []).slice(0, -1).map(m => ({ role: m.role, content: m.content }));

  // Call /api/kiko via internal fetch — properly consume the SSE stream
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://vela-platform-one.vercel.app';
  const r = await fetch(`${baseUrl}/api/kiko`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, userEmail, currentPage, conversationHistory })
  });

  // Read the SSE stream chunk by chunk until done
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullResponse = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Split on newlines, keep last incomplete line in buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.delta) fullResponse += parsed.delta;
      } catch {}
    }
  }
  // Process any remaining buffered line
  if (buffer.trim().startsWith('data: ')) {
    try {
      const parsed = JSON.parse(buffer.trim().slice(6));
      if (parsed.delta) fullResponse += parsed.delta;
    } catch {}
  }
  fullResponse = fullResponse.trim() || 'No response';

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
