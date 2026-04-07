// api/lemlist-drain.js — CHUNKED LEMLIST DRAIN
// Each call stays under 10s (Vercel free function default).
// Client orchestrates: list campaigns → drain people db pages → drain each campaign pages.
//
// GET  /api/lemlist-drain?action=campaigns                    → list all campaigns + lead counts
// POST /api/lemlist-drain?action=people&offset=0              → drain one page of people db (100 leads)
// POST /api/lemlist-drain?action=campaign&id=X&offset=0       → drain one page of one campaign
// POST /api/lemlist-drain?action=summary                      → write final summary alert
// GET  /api/lemlist-drain?action=status                       → last drain stats from kiko_alerts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const LEMLIST_KEY = process.env.LEMLIST_KEY;
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';
const headers = { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`:${LEMLIST_KEY}`).toString('base64')}` };
const PAGE = 100;

async function fetchJSON(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Lemlist ${res.status} on ${url}`);
  return res.json();
}

function mapLead(l, source) {
  return {
    firstName: l.firstName || l.first_name || '',
    lastName: l.lastName || l.last_name || '',
    email: (l.email || '').trim().toLowerCase(),
    title: l.jobTitle || l.title || l.position || '',
    company: l.companyName || l.company || '',
    linkedin: l.linkedinUrl || l.linkedin_url || l.linkedIn || '',
    phone: l.phone || l.phoneNumber || '',
    location: l.location || [l.city, l.country].filter(Boolean).join(', ') || '',
    industry: l.industry || '',
    picture: l.picture || l.pictureUrl || '',
    companyLinkedin: l.companyLinkedinUrl || l.companyLinkedin || '',
    companyDomain: l.companyDomain || l.domain || '',
    source: 'lemlist',
    lemlistId: l._id || l.id || null,
    lemlistSource: source,
    lastSyncedFromLemlistAt: new Date().toISOString(),
  };
}


async function mergeLead(mapped, dryRun) {
  if (!mapped.email && !mapped.lemlistId) return { action: 'skipped' };

  let existing = null;
  if (mapped.email) {
    const { data } = await supabase
      .from('contacts').select('id, data').eq('data->>email', mapped.email).limit(1);
    if (data && data[0]) existing = data[0];
  }
  if (!existing && mapped.firstName && mapped.lastName) {
    const { data } = await supabase
      .from('contacts').select('id, data')
      .eq('data->>firstName', mapped.firstName)
      .eq('data->>lastName', mapped.lastName)
      .limit(1);
    if (data && data[0]) existing = data[0];
  }

  if (existing) {
    const merged = { ...existing.data };
    let filled = 0;
    ['firstName','lastName','email','title','company','linkedin','phone','location','industry','picture','companyLinkedin','companyDomain'].forEach(k => {
      if (!merged[k] && mapped[k]) { merged[k] = mapped[k]; filled++; }
    });
    merged.lemlistId = mapped.lemlistId || merged.lemlistId;
    merged.lastSyncedFromLemlistAt = mapped.lastSyncedFromLemlistAt;
    if (filled === 0) return { action: 'unchanged' };
    if (!dryRun) {
      await supabase.from('contacts').update({ data: merged, updated_at: new Date().toISOString() }).eq('id', existing.id);
    }
    return { action: 'updated', filled };
  }

  const id = 'lem_' + (mapped.lemlistId || Math.random().toString(36).slice(2, 11));
  if (!dryRun) {
    await supabase.from('contacts').insert({ id, data: { id, ...mapped }, org_id: ORG_ID });
  }
  return { action: 'created' };
}

async function processBatch(arr, source, dryRun) {
  const stats = { created: 0, updated: 0, unchanged: 0, skipped: 0, fieldsFilled: 0, errors: [] };
  for (const l of arr) {
    try {
      const r = await mergeLead(mapLead(l, source), dryRun);
      stats[r.action] = (stats[r.action] || 0) + 1;
      if (r.filled) stats.fieldsFilled += r.filled;
    } catch (e) { stats.errors.push(e.message); }
  }
  return stats;
}


export default async function handler(req, res) {
  if (!LEMLIST_KEY) return res.status(500).json({ error: 'LEMLIST_KEY env var missing' });
  const action = req.query.action;
  const dryRun = req.query.dry === 'true';

  try {
    // ─── LIST CAMPAIGNS ───
    if (action === 'campaigns' && req.method === 'GET') {
      const data = await fetchJSON('https://api.lemlist.com/api/campaigns');
      const arr = Array.isArray(data) ? data : (data?.data || []);
      return res.json({
        ok: true,
        campaigns: arr.map(c => ({ id: c._id || c.id, name: c.name || 'Untitled', status: c.status }))
      });
    }

    // ─── DRAIN ONE PAGE OF PEOPLE DB ───
    if (action === 'people' && req.method === 'POST') {
      const offset = parseInt(req.query.offset) || 0;
      let arr = [];
      try {
        const page = await fetchJSON(`https://api.lemlist.com/api/team/people?limit=${PAGE}&offset=${offset}`);
        arr = Array.isArray(page) ? page : (page?.data || page?.people || []);
      } catch (e) {
        return res.json({ ok: true, fetched: 0, done: true, note: 'people db endpoint unavailable: ' + e.message, ...emptyStats() });
      }
      const stats = await processBatch(arr, 'people_db', dryRun);
      return res.json({ ok: true, fetched: arr.length, done: arr.length < PAGE, ...stats });
    }

    // ─── DRAIN ONE PAGE OF ONE CAMPAIGN ───
    if (action === 'campaign' && req.method === 'POST') {
      const id = req.query.id;
      const offset = parseInt(req.query.offset) || 0;
      if (!id) return res.status(400).json({ error: 'id required' });
      const page = await fetchJSON(`https://api.lemlist.com/api/campaigns/${id}/leads?limit=${PAGE}&offset=${offset}`);
      const arr = Array.isArray(page) ? page : (page?.data || []);
      const stats = await processBatch(arr, `campaign:${id}`, dryRun);
      return res.json({ ok: true, fetched: arr.length, done: arr.length < PAGE, ...stats });
    }

    // ─── PERSIST FINAL SUMMARY ALERT ───
    if (action === 'summary' && req.method === 'POST') {
      const summary = req.body || {};
      summary.timestamp = new Date().toISOString();
      await supabase.from('kiko_alerts').insert({
        type: 'lemlist_drain', severity: 'medium',
        title: `Lemlist drain complete: ${summary.created || 0} new + ${summary.updated || 0} updated`,
        detail: JSON.stringify(summary), entity_type: 'system', entity_name: 'Lemlist Drain',
        metadata: summary, expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      });
      return res.json({ ok: true });
    }

    // ─── STATUS ───
    if (action === 'status' && req.method === 'GET') {
      const { data } = await supabase
        .from('kiko_alerts').select('*').eq('type', 'lemlist_drain')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      return res.json({ lastDrain: data });
    }

    return res.status(400).json({ error: 'unknown action: ' + action });
  } catch (err) {
    console.error('[Drain] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

function emptyStats() { return { created: 0, updated: 0, unchanged: 0, skipped: 0, fieldsFilled: 0, errors: [] }; }
