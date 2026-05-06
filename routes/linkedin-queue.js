import { Router } from 'express';
import * as cookieStore from '../lib/cookieStore.js';
import * as engine from '../lib/linkedinEngine.js';

const router = Router();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sbFetch(path, opts = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, { ...opts, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...opts.headers } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text().catch(() => '')}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

// syncCookies function REMOVED — was destroying LinkedIn sessions

router.post('/process', async (req, res) => {
  const startTime = Date.now();
  try {
    // DO NOT call syncCookies here — it runs on its own cron (/sync-cookies).
    // Calling it before every send was destroying full cookie sets captured by linkedin-connect.
    const allIdentities = cookieStore.list().filter(i => !i.stale).map(i => i.identity);
    if (!allIdentities.length) return res.json({ ok: true, sent: 0, message: 'No LinkedIn identities with cookies' });

    const pending = await sbFetch("kiko_linkedin_queue?status=eq.pending&order=priority.desc,created_at.asc&limit=5&select=id,enrollment_id,contact_name,company,linkedin_url,message_type,message,context");
    if (!pending?.length) return res.json({ ok: true, sent: 0, message: 'No pending LinkedIn actions' });

    let sent = 0, failed = 0;
    const results = [];
    const identity = allIdentities[0];

    for (const row of pending) {
      try {
        if (!row.linkedin_url) {
          await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', actioned_at: new Date().toISOString() }) });
          failed++; results.push({ id: row.id, status: 'failed', reason: 'no linkedin_url' }); continue;
        }

        let useIdentity = identity;
        if (row.context) { try { const ctx = JSON.parse(row.context); if (ctx.sender) { const si = ctx.sender.split('@')[0].toLowerCase(); if (allIdentities.includes(si)) { useIdentity = si; } else { const altCookies = cookieStore.load(si); if (altCookies && !altCookies.stale) { useIdentity = si; console.log("[linkedin-queue] Using cookieStore identity: " + si); } } } } catch {} }

        let result;
        if (row.message_type === 'invite' || row.message_type === 'connection') {
          result = await engine.sendConnection(useIdentity, row.linkedin_url, (row.message || '').slice(0, 300) || null);
        } else if (row.message_type === 'message' || row.message_type === 'dm') {
          result = await engine.sendMessage(useIdentity, row.linkedin_url, row.message || '');
        } else {
          result = await engine.sendConnection(useIdentity, row.linkedin_url, (row.message || '').slice(0, 300) || null);
        }

        console.log(`[linkedin-queue] Result for ${row.contact_name}:`, JSON.stringify(result));

        if (result?.ok) {
          await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'sent', actioned_at: new Date().toISOString() }) });
          sent++;
          results.push({ id: row.id, status: 'sent', contact: row.contact_name, via: useIdentity, detail: result });
          console.log(`[linkedin-queue] ✓ ${row.message_type} to ${row.contact_name} via ${useIdentity}`);
        } else {
          await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', actioned_at: new Date().toISOString() }) });
          failed++;
          results.push({ id: row.id, status: 'failed', contact: row.contact_name, error: result?.error || result?.status });
          console.log(`[linkedin-queue] ✗ ${row.contact_name}: ${result?.error || result?.status}`);
        }

        if (sent + failed < pending.length) await new Promise(r => setTimeout(r, 30000 + Math.random() * 30000));
      } catch (err) {
        console.error(`[linkedin-queue] Exception for ${row.contact_name}:`, err.message);
        await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', actioned_at: new Date().toISOString() }) }).catch(() => {});
        failed++;
        results.push({ id: row.id, status: 'error', contact: row.contact_name, error: err.message });
      }
    }

    res.json({ ok: true, sent, failed, duration_ms: Date.now() - startTime, results });
  } catch (err) {
    console.error('[linkedin-queue] Fatal:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});


export default router;
