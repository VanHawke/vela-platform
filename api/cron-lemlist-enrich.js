// api/cron-lemlist-enrich.js — Lemlist Enrichment Sync
import { cronHeartbeat } from './kiko-tools.js';
// Pulls LinkedIn URLs + missing emails from Lemlist enrichment API
// Runs weekly (Monday 6:15am) — uses Lemlist credits
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const LEMLIST_KEY = process.env.LEMLIST_KEY;
const headers = { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`:${LEMLIST_KEY}`).toString('base64')}` };

async function enrichContact(contact) {
  // Build enrichment request — Lemlist needs at least firstName + lastName + companyName
  const body = {};
  if (contact.email) body.email = contact.email;
  if (contact.firstName) body.firstName = contact.firstName;
  if (contact.lastName) body.lastName = contact.lastName;
  if (contact.company) body.companyName = contact.company;
  
  if (!body.email && (!body.firstName || !body.companyName)) return null;

  try {
    const res = await fetch('https://api.lemlist.com/api/enrich', {
      method: 'POST', headers, body: JSON.stringify(body)
    });
    if (!res.ok) { console.log(`[LemlistEnrich] API ${res.status} for ${contact.firstName}`); return null; }
    const data = await res.json();
    return data.id; // enrichment ID — results are async
  } catch (e) { console.error('[LemlistEnrich] Request error:', e.message); return null; }
}

async function getEnrichmentResult(enrichmentId) {
  try {
    const res = await fetch(`https://api.lemlist.com/api/enrich/${enrichmentId}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.data || null;
  } catch { return null; }
}

async function updateContact(contactId, existingData, enrichResult) {
  const updates = { ...existingData };
  let changed = false;

  // Email
  if (!existingData.email && enrichResult.find_email?.email) {
    updates.email = enrichResult.find_email.email;
    changed = true;
  }

  // LinkedIn — extract from enrichment position data
  if (!existingData.linkedinUrl) {
    const linkedin = enrichResult.linkedin_enrichment;
    if (linkedin?.linkedinUrl) { updates.linkedinUrl = linkedin.linkedinUrl; changed = true; }
    // Also try to get from profile URL pattern
    if (!updates.linkedinUrl && linkedin?.positionGroups?.[0]?.company?.linkedinUrl) {
      // Person's LinkedIn might be in a different field — check publicIdentifier
      if (linkedin.publicIdentifier) {
        updates.linkedinUrl = `https://www.linkedin.com/in/${linkedin.publicIdentifier}`;
        changed = true;
      }
    }
  }

  // Title update if we got a better one
  if (enrichResult.linkedin_enrichment?.positionGroups?.[0]?.profilePositions?.[0]?.title) {
    const newTitle = enrichResult.linkedin_enrichment.positionGroups[0].profilePositions[0].title;
    if (!existingData.title || existingData.title.length < newTitle.length) {
      updates.title = newTitle;
      changed = true;
    }
  }

  if (changed) {
    await supabase.from('contacts').update({ data: updates, updated_at: new Date().toISOString() }).eq('id', contactId);
  }
  return changed;
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-lemlist-enrich', 'started');
  try {
  console.log('[LemlistEnrich] Starting enrichment sync...');
  
  // Get contacts missing LinkedIn or email — prioritise deal-linked contacts
  const { data: dealCompanies } = await supabase.from('deals')
    .select('data->>company').not('data->>status', 'in', '("won","lost")');
  const dealCompanyNames = new Set((dealCompanies || []).map(d => d.company).filter(Boolean));

  const { data: contacts } = await supabase.from('contacts')
    .select('id, data')
    .or('data->>linkedinUrl.is.null,data->>linkedinUrl.eq.,data->>email.is.null,data->>email.eq.')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (!contacts?.length) { await cronHeartbeat('cron-lemlist-enrich', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 }); return res.json({ ok: true, message: 'No contacts need enrichment', enriched: 0 }); }

  // Prioritise: deal-linked contacts first, then others
  const sorted = (contacts || []).sort((a, b) => {
    const aIsDeal = dealCompanyNames.has(a.data?.company) ? 1 : 0;
    const bIsDeal = dealCompanyNames.has(b.data?.company) ? 1 : 0;
    return bIsDeal - aIsDeal;
  });

  const batch = sorted.slice(0, 20); // Max 20 per run to manage credits
  let submitted = 0, enriched = 0, failed = 0;
  const enrichmentIds = [];

  // Phase 1: Submit enrichment requests
  for (const ct of batch) {
    const d = ct.data || {};
    const enrichId = await enrichContact({
      email: d.email, firstName: d.firstName, lastName: d.lastName, company: d.company
    });
    if (enrichId) {
      enrichmentIds.push({ contactId: ct.id, enrichId, data: d });
      submitted++;
    } else { failed++; }
    await new Promise(r => setTimeout(r, 500)); // Rate limit
  }

  // Phase 2: Wait 10s for async results, then poll
  await new Promise(r => setTimeout(r, 10000));

  for (const item of enrichmentIds) {
    const result = await getEnrichmentResult(item.enrichId);
    if (result) {
      const updated = await updateContact(item.contactId, item.data, result);
      if (updated) enriched++;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  const summary = { submitted, enriched, failed, total_checked: batch.length, timestamp: new Date().toISOString() };
  console.log('[LemlistEnrich] Complete:', JSON.stringify(summary));

  if (enriched > 0) {
    await supabase.from('kiko_alerts').insert({
      type: 'data_enrichment', severity: 'low',
      title: `Lemlist enrichment: ${enriched} contacts updated (LinkedIn/email)`,
      detail: JSON.stringify(summary), entity_type: 'system', entity_name: 'Lemlist Enrichment',
      metadata: summary, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  await cronHeartbeat('cron-lemlist-enrich', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: summary.enriched || 0 });
  return res.json({ ok: true, ...summary });
  } catch (__hbErr) {
    await cronHeartbeat('cron-lemlist-enrich', 'error', { heartbeatId: __hbId, errorMessage: __hbErr?.message || 'unknown' });
    return res.status(200).json({ ok: false, error: __hbErr?.message });
  }
}
