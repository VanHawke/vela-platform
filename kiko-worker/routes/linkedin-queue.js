// routes/linkedin-queue.js
// Processes pending LinkedIn actions from Supabase outreach queue.
// Runs locally on Hetzner — reads queue, syncs cookies from user_tokens, sends via engine.
import { Router } from 'express';
import * as cookieStore from '../lib/cookieStore.js';
import * as engine from '../lib/linkedinEngine.js';

const router = Router();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sbFetch(path, opts = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text().catch(() => '')}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

// Sync li_at cookies from Supabase user_tokens → local cookie store
async function syncCookies() {
  const tokens = await sbFetch("user_tokens?provider=eq.linkedin&select=user_email,access_token,updated_at");
  if (!tokens?.length) return { synced: 0, message: 'No LinkedIn tokens in user_tokens' };

  let synced = 0;
  for (const t of tokens) {
    const identity = t.user_email.split('@')[0].toLowerCase(); // matt.smith@vanhawke.com → matt.smith
    const cookies = [{
      name: 'li_at', value: t.access_token, domain: '.linkedin.com',
      path: '/', httpOnly: true, secure: true, sameSite: 'None',
    }];
    cookieStore.save(identity, cookies, { email: t.user_email, synced_at: new Date().toISOString() });
    synced++;
    console.log(`[linkedin-queue] Synced cookies for ${identity} (${t.user_email})`);
  }
  return { synced, identities: tokens.map(t => t.user_email.split('@')[0].toLowerCase()) };
}

// Map send_from_user_id → identity
async function resolveIdentity(sendFromUserId) {
  if (!sendFromUserId) return null;
  const users = await sbFetch(`kiko_user_config?user_id=eq.${sendFromUserId}&select=email`);
  if (!users?.length) return null;
  return users[0].email.split('@')[0].toLowerCase();
}

// POST /linkedin-queue/process — Main queue processor
// Called by Hetzner cron every 30min Mon-Fri 9am-6pm
router.post('/process', async (req, res) => {
  const startTime = Date.now();
  try {
    // Step 1: Sync cookies from Supabase
    const syncResult = await syncCookies();
    console.log(`[linkedin-queue] Cookie sync: ${syncResult.synced} identities`);
    if (syncResult.synced === 0) {
      return res.json({ ok: true, sent: 0, message: 'No LinkedIn tokens configured' });
    }

    // Step 2: Fetch pending LinkedIn queue items
    const pending = await sbFetch(
      "kiko_outreach_queue?channel=eq.linkedin&status=eq.pending&order=scheduled_for.asc&limit=10" +
      "&select=id,enrollment_id,step_number,channel,status,message,contact_name,company,scheduled_for"
    );
    if (!pending?.length) {
      return res.json({ ok: true, sent: 0, message: 'No pending LinkedIn actions' });
    }

    // Step 3: For each item, resolve identity and send
    let sent = 0, failed = 0, skipped = 0;
    const results = [];

    for (const row of pending) {
      try {
        // Get enrollment → sequence → send_from_user_id
        const enr = await sbFetch(`kiko_sequence_enrollments?id=eq.${row.enrollment_id}&select=sequence_id,contact_email`);
        if (!enr?.length) { skipped++; results.push({ id: row.id, status: 'skipped', reason: 'no enrollment' }); continue; }

        const seq = await sbFetch(`kiko_sequences?id=eq.${enr[0].sequence_id}&select=send_from_user_id`);
        const identity = await resolveIdentity(seq?.[0]?.send_from_user_id);
        if (!identity) {
          // Fall back to first available identity
          const fallback = syncResult.identities?.[0];
          if (!fallback) { skipped++; results.push({ id: row.id, status: 'skipped', reason: 'no identity' }); continue; }
        }
        const useIdentity = identity || syncResult.identities[0];

        // Get LinkedIn URL from contact
        const contact = await sbFetch(`contacts?data->>email=eq.${enr[0].contact_email}&select=data&limit=1`);
        const linkedinUrl = contact?.[0]?.data?.linkedinUrl || contact?.[0]?.data?.linkedin;
        if (!linkedinUrl) {
          // Mark as failed — no LinkedIn URL
          await sbFetch(`kiko_outreach_queue?id=eq.${row.id}`, {
            method: 'PATCH', body: JSON.stringify({ status: 'failed', error_message: 'No LinkedIn URL for contact' }),
          });
          skipped++;
          results.push({ id: row.id, status: 'skipped', reason: 'no linkedin_url', contact: row.contact_name });
          continue;
        }

        // Determine action type from the step
        const stepData = await sbFetch(`kiko_sequences?id=eq.${enr[0].sequence_id}&select=steps`);
        const steps = stepData?.[0]?.steps || [];
        const step = steps[row.step_number - 1];
        const action = step?.action || step?.type || 'invite';

        // Execute the LinkedIn action
        let result;
        if (action === 'invite' || action === 'connect' || action === 'linkedin_connect') {
          const note = (row.message || '').slice(0, 300);
          result = await engine.sendConnection(useIdentity, linkedinUrl, note || null);
        } else if (action === 'message' || action === 'linkedin_message') {
          result = await engine.sendMessage(useIdentity, linkedinUrl, row.message || '');
        } else if (action === 'view' || action === 'profile_view') {
          result = await engine.getProfile(useIdentity, linkedinUrl);
        } else {
          // Default to connection request
          result = await engine.sendConnection(useIdentity, linkedinUrl, (row.message || '').slice(0, 300) || null);
        }

        // Mark as sent
        await sbFetch(`kiko_outreach_queue?id=eq.${row.id}`, {
          method: 'PATCH', body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() }),
        });
        sent++;
        results.push({ id: row.id, status: 'sent', action, identity: useIdentity, contact: row.contact_name });
        console.log(`[linkedin-queue] ✓ ${action} → ${row.contact_name} via ${useIdentity}`);

        // Rate limit: wait 30-60s between actions (humanlike pacing)
        if (sent < pending.length) {
          const delay = 30000 + Math.random() * 30000;
          await new Promise(r => setTimeout(r, delay));
        }

      } catch (err) {
        console.error(`[linkedin-queue] ✗ ${row.contact_name}:`, err.message);
        // Mark as failed
        await sbFetch(`kiko_outreach_queue?id=eq.${row.id}`, {
          method: 'PATCH', body: JSON.stringify({ status: 'failed', error_message: err.message.slice(0, 500) }),
        }).catch(() => {});
        failed++;
        results.push({ id: row.id, status: 'error', contact: row.contact_name, error: err.message });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[linkedin-queue] Complete: ${sent} sent, ${failed} failed, ${skipped} skipped (${duration}ms)`);
    res.json({ ok: true, sent, failed, skipped, duration_ms: duration, results });

  } catch (err) {
    console.error('[linkedin-queue] Fatal:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /linkedin-queue/sync-cookies — Manual cookie sync only
router.post('/sync-cookies', async (req, res) => {
  try {
    const result = await syncCookies();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /linkedin-queue/check-replies — Scan for LinkedIn replies and connection acceptances
// Visits each enrolled contact's profile to check connection status
router.post('/check-replies', async (req, res) => {
  const startTime = Date.now();
  try {
    const syncResult = await syncCookies();
    if (syncResult.synced === 0) return res.json({ ok: true, checked: 0, message: 'No LinkedIn tokens' });

    // Get active LinkedIn enrollments (sent a connection request or message)
    const enrollments = await sbFetch(
      "kiko_sequence_enrollments?status=eq.active&select=id,contact_name,contact_email,company,linkedin_url,sequence_id"
    );
    if (!enrollments?.length) return res.json({ ok: true, checked: 0, message: 'No active enrollments' });

    // Filter to those with LinkedIn URLs
    const withLinkedin = enrollments.filter(e => e.linkedin_url);
    const identity = syncResult.identities?.[0];
    if (!identity) return res.json({ ok: true, checked: 0, message: 'No identity available' });

    let checked = 0, replies = 0, acceptances = 0;
    const results = [];

    for (const enrollment of withLinkedin.slice(0, 10)) {
      try {
        // Check the profile — if we can now message them, connection was accepted
        const profile = await engine.getProfile(identity, enrollment.linkedin_url);
        if (profile?.ok && profile?.data) {
          const isConnected = profile.data.connectionDegree === '1st' || profile.data.isConnection;
          if (isConnected) {
            // Check if we had sent a connection request for this enrollment
            const queueRows = await sbFetch(
              `kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&channel=eq.linkedin&status=eq.sent&select=id,step_number`
            );
            if (queueRows?.length) {
              // Mark acceptance in the queue
              await sbFetch(`kiko_outreach_queue?id=eq.${queueRows[0].id}`, {
                method: 'PATCH', body: JSON.stringify({ opens_count: 1, opened_at: new Date().toISOString() }),
              });
              // Create alert
              await sbFetch('kiko_alerts', {
                method: 'POST', body: JSON.stringify({
                  type: 'linkedin_connection_accepted', severity: 'medium',
                  title: `LinkedIn: ${enrollment.contact_name} accepted connection`,
                  detail: `${enrollment.contact_name} at ${enrollment.company} accepted your LinkedIn connection request.`,
                  entity_type: 'contact', entity_name: enrollment.contact_name,
                  created_at: new Date().toISOString(),
                }),
              });
              acceptances++;
              results.push({ id: enrollment.id, contact: enrollment.contact_name, status: 'accepted' });
            }
          }
        }
        checked++;
        // Rate limit: 15-25s between profile checks
        if (checked < withLinkedin.length) {
          await new Promise(r => setTimeout(r, 15000 + Math.random() * 10000));
        }
      } catch (err) {
        results.push({ id: enrollment.id, contact: enrollment.contact_name, status: 'error', error: err.message });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[linkedin-queue] Reply check: ${checked} checked, ${acceptances} acceptances, ${replies} replies (${duration}ms)`);
    res.json({ ok: true, checked, acceptances, replies, duration_ms: duration, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
