// api/kiko-task-create.js — Background task creation endpoint
// POST: { conversation_id, query, user_id }
// Returns { task_id, status: 'queued' } in <100ms
// Fires the actual Kiko call via waitUntil (runs after response)
import { waitUntil } from '@vercel/functions';
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 300 };

// Reuse kiko-async's in-process call pattern — same tools, same memory, same KIKO_BIBLE
async function callKikoInProcess({ message, userEmail, currentPage, conversationHistory }) {
  const kikoModule = await import('./kiko.js');
  const handler = kikoModule.default;
  let captured = null;
  const fakeReq = {
    method: 'POST',
    query: { nostream: '1' },
    headers: {},
    body: { message, userEmail, currentPage, conversationHistory, nostream: true },
  };
  const fakeRes = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    flushHeaders() {},
    write() {},
    end() {},
    status(code) { this.statusCode = code; return this; },
    json(obj) { captured = obj; return this; },
    on() {},
  };
  await handler(fakeReq, fakeRes);
  return { response: captured?.response || '', events: captured?.buffered_events || 0 };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { conversation_id, query, user_id } = req.body || {};

  // Validate
  if (!user_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id)) {
    return res.status(400).json({ error: 'valid user_id required' });
  }
  if (!query || typeof query !== 'string' || query.length < 1 || query.length > 8000) {
    return res.status(400).json({ error: 'query required (1-8000 chars)' });
  }
  if (conversation_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversation_id)) {
    return res.status(400).json({ error: 'invalid conversation_id' });
  }

  try {
    // INSERT row — status='queued'
    const rows = await sbFetch('kiko_background_tasks', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id,
        conversation_id: conversation_id || null,
        query,
        status: 'queued',
      }),
    });
    const task = rows?.[0];
    if (!task?.id) throw new Error('Failed to insert task');

    // Return immediately — <100ms
    res.status(200).json({ task_id: task.id, status: 'queued' });

    // Fire background work via waitUntil — runs after response is sent
    waitUntil(executeTask(task.id, query, user_id, conversation_id));
  } catch (err) {
    console.error('[kiko-task-create] error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function executeTask(taskId, query, userId, conversationId) {
  const startTime = Date.now();
  try {
    // Mark as running
    await sbFetch(`kiko_background_tasks?id=eq.${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'running', started_at: new Date().toISOString() }),
    });

    // Get user email for Kiko config
    let userEmail = 'sunny@vanhawke.com';
    try {
      const configs = await sbFetch(`kiko_user_config?user_id=eq.${userId}&select=email&limit=1`);
      if (configs?.[0]?.email) userEmail = configs[0].email;
    } catch {}

    // Get conversation history if conversation_id provided
    let conversationHistory = [];
    if (conversationId) {
      try {
        const msgs = await sbFetch(`kiko_messages?conversation_id=eq.${conversationId}&order=created_at&limit=20&select=role,content`);
        conversationHistory = (msgs || []).map(m => ({ role: m.role, content: m.content }));
      } catch {}
    }

    // Call Kiko with full tools — same as foreground
    const result = await callKikoInProcess({
      message: query,
      userEmail,
      currentPage: 'home',
      conversationHistory,
    });

    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    // Mark as done
    await sbFetch(`kiko_background_tasks?id=eq.${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'done',
        result_text: (result.response || '').slice(0, 50000),
        elapsed_seconds: elapsed,
        completed_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.error('[kiko-task-create] background error:', err);
    try {
      await sbFetch(`kiko_background_tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'error',
          error_message: (err.message || 'Unknown error').slice(0, 2000),
          elapsed_seconds: elapsed,
          completed_at: new Date().toISOString(),
        }),
      });
    } catch {}
  }
}
