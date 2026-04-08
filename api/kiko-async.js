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

  // Call /api/kiko via internal fetch — collect ALL chunks to completion
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://vela-platform-one.vercel.app';
  console.log('[KikoAsync] calling internal kiko with msg:', message?.slice(0, 80));
  const r = await fetch(`${baseUrl}/api/kiko`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify({ message, userEmail, currentPage, conversationHistory })
  });
  console.log('[KikoAsync] response status:', r.status, 'has body:', !!r.body);

  let fullResponse = '';
  let chunkCount = 0;

  if (r.body && typeof r.body.getReader === 'function') {
    // Streaming path
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunkCount++;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data: ')) continue;
        const p = t.slice(6);
        if (p === '[DONE]') continue;
        try {
          const parsed = JSON.parse(p);
          if (parsed.delta) fullResponse += parsed.delta;
        } catch {}
      }
    }
    if (buffer.trim().startsWith('data: ')) {
      try {
        const parsed = JSON.parse(buffer.trim().slice(6));
        if (parsed.delta) fullResponse += parsed.delta;
      } catch {}
    }
  } else {
    // Fallback: read as text (for runtimes that don't expose body reader)
    const text = await r.text();
    chunkCount = text.split('\n').length;
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('data: ')) continue;
      const p = t.slice(6);
      if (p === '[DONE]') continue;
      try {
        const parsed = JSON.parse(p);
        if (parsed.delta) fullResponse += parsed.delta;
      } catch {}
    }
  }

  console.log('[KikoAsync] collected response:', fullResponse.length, 'chars from', chunkCount, 'chunks');
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
