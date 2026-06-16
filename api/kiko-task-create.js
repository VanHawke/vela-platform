// api/kiko-task-create.js — Create + run a background (async) task.
// POST { conversation_id?, query, user_id }  → { id, status:'running' }
//
// Lifecycle (this file is the entry + the worker — there is no separate cron):
//   1. Insert a kiko_background_tasks row (status 'running') and return its id
//      immediately so the frontend can begin streaming via kiko-task-stream.js.
//   2. Fire-and-forget: drive the REAL brain (api/kiko.js) and persist its output.
//      The brain is an HTTP handler that streams SSE `{ delta }` events via
//      res.write, terminated by `[DONE]` / res.end. We pass it a constructed req
//      (mapping query -> message, resolving userEmail) and a MOCK res that
//      intercepts those writes, appending delta text into streaming_progress and
//      finalising result_text / status / elapsed_seconds. Zero brain-logic duplication.
//
// Siblings: kiko-task-stream.js (SSE poll of streaming_progress), kiko-task-status.js,
//           kiko-task-result.js, kiko-task-dismiss.js. Table: kiko_background_tasks.
import { randomUUID } from 'crypto';
import { sbFetch } from './kiko-tools.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { conversation_id = null, query, user_id } = req.body || {};
  if (!query || !String(query).trim()) return res.status(400).json({ error: 'query required' });
  if (!user_id || !UUID_RE.test(String(user_id))) return res.status(400).json({ error: 'valid user_id required' });

  const taskId = randomUUID();
  const startedAt = new Date().toISOString();

  // 1) Create the task row (status running).
  try {
    const ins = await sbFetch('kiko_background_tasks', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        id: taskId,
        user_id: String(user_id),
        conversation_id: (conversation_id && UUID_RE.test(String(conversation_id))) ? String(conversation_id) : null,
        query: String(query),
        status: 'running',
        started_at: startedAt,
        streaming_progress: '',
        streaming_mode: true,
      }),
    });
    if (!Array.isArray(ins) || !ins[0]?.id) {
      throw new Error(ins?.message || 'insert returned no row');
    }
  } catch (e) {
    return res.status(500).json({ error: 'failed to create task: ' + (e?.message || String(e)) });
  }

  // 2) Respond immediately — frontend starts streaming on this id.
  res.status(200).json({ id: taskId, status: 'running' });

  // 3) Fire-and-forget execution. Any unexpected throw → mark the row errored.
  runTask({ taskId, startedAt, query: String(query), user_id: String(user_id) }).catch(async (err) => {
    try {
      await sbFetch(`kiko_background_tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'error',
          error_message: String(err?.message || err).slice(0, 1000),
          completed_at: new Date().toISOString(),
        }),
      });
    } catch {}
  });
}

// Resolve the brain's userEmail from the task's user_id (falls back to the owner account).
async function resolveEmail(user_id) {
  try {
    const rows = await sbFetch(`kiko_user_config?user_id=eq.${user_id}&select=email&limit=1`);
    if (Array.isArray(rows) && rows[0]?.email) return rows[0].email;
  } catch {}
  return 'sunny@vanhawke.com';
}

async function runTask({ taskId, startedAt, query, user_id }) {
  const userEmail = await resolveEmail(user_id);

  let fullText = '';
  let lastFlush = 0;
  let finalized = false;
  const toolsUsed = [];
  // toolStatus values the brain emits that are NOT a specific tool (skip these).
  const GENERIC_STATUS = new Set(['', 'Connecting...', 'Deep analysis...', 'Still working...']);

  const patch = async (body) => {
    try {
      await sbFetch(`kiko_background_tasks?id=eq.${taskId}`, { method: 'PATCH', body: JSON.stringify(body) });
    } catch {}
  };

  // Debounced persistence of the growing transcript (stream endpoint polls every 300ms).
  const flush = (force) => {
    const now = Date.now();
    if (!force && now - lastFlush < 400) return;
    lastFlush = now;
    patch({ streaming_progress: fullText }); // fire-and-forget; text is append-only so writes converge
  };

  const finalize = async (status, errorMessage) => {
    if (finalized) return;
    finalized = true;
    const elapsed = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
    const body = {
      status,
      streaming_progress: fullText,
      completed_at: new Date().toISOString(),
      elapsed_seconds: elapsed,
    };
    if (status === 'done') body.result_text = fullText;
    if (toolsUsed.length) body.tools_used = toolsUsed;
    if (errorMessage) body.error_message = String(errorMessage).slice(0, 1000);
    await patch(body);
  };

  // Parse one SSE write ("data: {json}\n\n") and accumulate delta text.
  const onWrite = (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        if (typeof obj.delta === 'string') fullText += obj.delta;
        else if (typeof obj.toolStatus === 'string') {
          const s = obj.toolStatus.trim();
          if (s && !GENERIC_STATUS.has(s) && !toolsUsed.includes(s)) toolsUsed.push(s);
        }
      } catch {}
    }
    flush(false);
  };

  const mockRes = {
    setHeader() {},
    flushHeaders() {},
    headersSent: false,
    status() { return this; },
    json(obj) {
      // Brain only json()s on early-exit paths (errors / rate-limit / title).
      if (obj && obj.error) finalize('error', obj.error);
      else if (obj && typeof obj.title === 'string') { fullText = obj.title; finalize('done'); }
      else if (obj) { try { fullText += JSON.stringify(obj); } catch {} finalize('done'); }
      return this;
    },
    write(chunk) { try { onWrite(chunk); } catch {} return true; },
    end() { finalize('done'); return this; },
  };

  const brainReq = {
    method: 'POST',
    headers: {},
    body: {
      message: query,
      userEmail,
      conversationHistory: [],
      currentPage: 'home',
      timezone: 'Europe/London',
    },
  };

  try {
    const { default: brainHandler } = await import('./kiko.js');
    await brainHandler(brainReq, mockRes);
    await finalize('done'); // safety net if the brain returned without calling end()
  } catch (err) {
    await finalize('error', err?.message || String(err));
  }
}
