// api/track.js — Open + Click tracking (single endpoint to conserve function slots)
// GET /api/track?t=o&q=<queueId>          → log open, return 1x1 transparent GIF
// GET /api/track?t=c&q=<queueId>&u=<b64u> → log click, 302 redirect to decoded URL
//
// Defensive: NEVER throws on caller. If logging fails, the GIF/redirect still works.
// Otherwise recipients see broken images or broken links.

import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 10 };

// 1x1 transparent GIF (43 bytes)
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

function decodeUrl(b64) {
  if (!b64) return null;
  try {
    // base64url → base64 → utf8
    const b64std = b64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64std + '='.repeat((4 - (b64std.length % 4)) % 4);
    const url = Buffer.from(padded, 'base64').toString('utf8');
    // Validate it's a real http(s) URL
    if (!/^https?:\/\//i.test(url)) return null;
    return url;
  } catch {
    return null;
  }
}

async function logOpen(queueId) {
  if (!queueId) return;
  try {
    // Fetch current row to read opens_count + opened_at
    const rows = await sbFetch(`kiko_outreach_queue?id=eq.${queueId}&select=id,opens_count,opened_at,enrollment_id&limit=1`);
    const row = rows?.[0];
    if (!row) return;
    const now = new Date().toISOString();
    const patch = {
      last_opened_at: now,
      opens_count: (row.opens_count || 0) + 1,
    };
    if (!row.opened_at) patch.opened_at = now;
    await sbFetch(`kiko_outreach_queue?id=eq.${queueId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    // Log to learning log on first open (high signal)
    if (!row.opened_at && row.enrollment_id) {
      await sbFetch('kiko_learning_log', {
        method: 'POST',
        body: JSON.stringify({
          category: 'email_opened',
          entity_name: queueId,
          content: `Email opened (queue ${queueId}, enrollment ${row.enrollment_id})`,
        }),
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[track] open log failed:', err.message);
  }
}

async function logClick(queueId, url) {
  if (!queueId) return;
  try {
    const rows = await sbFetch(`kiko_outreach_queue?id=eq.${queueId}&select=id,clicks_count,clicked_at,opened_at,enrollment_id&limit=1`);
    const row = rows?.[0];
    if (!row) return;
    const now = new Date().toISOString();
    const patch = {
      last_clicked_at: now,
      clicks_count: (row.clicks_count || 0) + 1,
      last_clicked_url: url || null,
    };
    if (!row.clicked_at) patch.clicked_at = now;
    // A click also implies an open — backfill if missing
    if (!row.opened_at) {
      patch.opened_at = now;
      patch.last_opened_at = now;
      patch.opens_count = 1;
    }
    await sbFetch(`kiko_outreach_queue?id=eq.${queueId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    // Click is a much stronger intent signal than open — always log
    if (row.enrollment_id) {
      await sbFetch('kiko_learning_log', {
        method: 'POST',
        body: JSON.stringify({
          category: 'email_clicked',
          entity_name: queueId,
          content: `Email link clicked (queue ${queueId}, enrollment ${row.enrollment_id}): ${url || 'unknown'}`,
        }),
      }).catch(() => {});
      // First click → high-priority alert
      if (!row.clicked_at) {
        await sbFetch('kiko_alerts', {
          method: 'POST',
          body: JSON.stringify({
            type: 'email_clicked',
            severity: 'high',
            entity_name: queueId,
            title: `Lead clicked an email link`,
            detail: `Queue ${queueId} → ${url || 'link'}. This is a high-intent signal — consider a follow-up within 24h.`,
            dismissed: false,
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          }),
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[track] click log failed:', err.message);
  }
}

export default async function handler(req, res) {
  const t = req.query?.t;
  const q = req.query?.q;

  // ── OPEN ──
  if (t === 'o') {
    // Fire-and-forget log; don't await — return GIF immediately for fastest pixel load
    logOpen(q).catch(() => {});
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Content-Length', TRANSPARENT_GIF.length);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).send(TRANSPARENT_GIF);
  }

  // ── CLICK ──
  if (t === 'c') {
    const url = decodeUrl(req.query?.u);
    // Log async
    logClick(q, url).catch(() => {});
    if (url) {
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, url);
    }
    // No valid URL — fail gracefully
    return res.status(400).send('Invalid tracking link');
  }

  // ── Unknown type ──
  return res.status(400).json({ error: 'Invalid tracking type' });
}
