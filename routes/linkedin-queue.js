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

    const pending = await sbFetch("kiko_linkedin_queue?status=eq.pending&order=priority.desc,created_at.asc&limit=8&select=id,enrollment_id,contact_name,company,linkedin_url,message_type,message,context");
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


// Check for connection acceptances — runs 3x daily via cron
router.post('/check-replies', async (req, res) => {
  const startTime = Date.now();
  try {
    // Get all sent invites that haven't been checked recently
    const sent = await sbFetch('kiko_linkedin_queue?status=eq.sent&message_type=in.(invite,connection)&order=actioned_at.asc&limit=20');
    if (!sent?.length) return res.json({ ok: true, checked: 0, message: 'No pending invites to check' });

    let accepted = 0, checked = 0;
    
    for (const row of sent) {
      if (!row.linkedin_url) continue;
      try {
        const profile = await engine.getProfile('matt.smith', row.linkedin_url);
        checked++;
        
        if (profile?.ok && profile?.connectionDegree === '1st') {
          // They accepted! Update queue status
          await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, { 
            method: 'PATCH', 
            body: JSON.stringify({ status: 'accepted', result: 'accepted', actioned_at: new Date().toISOString() }) 
          });
          accepted++;
          console.log(`[linkedin-replies] ✓ ${row.contact_name} ACCEPTED connection`);
          
          // Create alert
          await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
            type: 'linkedin_acceptance', severity: 'high',
            entity_name: row.company || row.contact_name,
            title: `${row.contact_name} accepted LinkedIn connection`,
            detail: `${row.contact_name} at ${row.company || 'N/A'} accepted Matt's connection request. Follow-up messages will now be queued.`,
            dismissed: false,
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
          }) }).catch(() => {});
        }
        
        // Rate limit: 3-5 second delay between profile checks
        if (checked < sent.length) await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
      } catch (err) {
        console.error(`[linkedin-replies] Error checking ${row.contact_name}:`, err.message);
      }
    }

    res.json({ ok: true, checked, accepted, duration_ms: Date.now() - startTime });
  } catch (err) {
    console.error('[linkedin-replies] Fatal:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Sync/rotate cookies after browser sessions
router.post('/sync-cookies', async (req, res) => {
  try {
    // The keepalive cron already handles cookie refresh
    // This route just confirms cookies are still valid
    const identities = ['sunny', 'matt.smith'];
    const results = [];
    for (const id of identities) {
      try {
        const stored = (await import('../lib/cookieStore.js')).load(id);
        results.push({ identity: id, cookies: stored?.cookies?.length || 0, stale: stored?.stale || false });
      } catch (e) {
        results.push({ identity: id, error: e.message });
      }
    }
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
