// api/pipedrive-import.js — Import Pipedrive CRM data into Vela Supabase tables
// POST /api/pipedrive-import { entity: 'persons'|'organizations'|'deals'|'all' }
// Tables use schema: id TEXT, data JSONB, updated_at TIMESTAMPTZ

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PD_BASE = 'https://vanhawkeagency.pipedrive.com/api/v1';
const BATCH = 500;

// Pipedrive stage_id → Vela stage name
const STAGE_MAP = {
  12: 'Contact made', 24: 'In Dialogue', 13: 'Meeting arranged',
  14: 'Qualified', 15: 'Meeting arranged (brand x RH)', 16: 'Proposal made',
  17: 'Negotiations started', 35: 'To revisit',
  27: 'Contact made', 28: 'In Dialogue', 29: 'Meeting arranged',
  30: 'Qualified', 31: 'Meeting arranged (brand x RH)', 32: 'Proposal made',
  33: 'Negotiations started', 34: 'To revisit',
  18: 'Contact made', 25: 'In Dialogue', 19: 'Meeting arranged',
  20: 'Qualified', 21: 'Meeting arranged (brand x RH)', 22: 'Proposal made',
  23: 'Negotiations started',
  7: 'Contact made', 26: 'In Dialogue', 8: 'Meeting arranged',
  6: 'Qualified', 11: 'Meeting arranged (brand x RH)', 9: 'Proposal made',
  10: 'Negotiations started',
  36: 'Contact made', 37: 'In Dialogue', 38: 'Meeting arranged',
  39: 'Qualified', 40: 'Meeting arranged (brand x RH)', 41: 'Proposal made',
  42: 'Negotiations started', 43: 'To revisit',
};

const PIPELINE_MAP = {
  2: 'ONE Championship', 3: 'Haas F1', 4: 'Formula E', 5: 'Alpine F1', 6: 'Esports',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const key = process.env.PIPEDRIVE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIPEDRIVE_API_KEY not configured' });

  // GET — return current row counts
  if (req.method === 'GET') {
    const [c, co, d] = await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
      supabase.from('companies').select('id', { count: 'exact', head: true }),
      supabase.from('deals').select('id', { count: 'exact', head: true }),
    ]);
    return res.status(200).json({
      contacts: c.count || 0,
      companies: co.count || 0,
      deals: d.count || 0,
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST or GET only' });

  const { entity = 'all' } = req.body || {};

  try {
    const results = {};

    if (entity === 'all' || entity === 'organizations') {
      results.companies = await importAll('organizations', key);
    }
    if (entity === 'all' || entity === 'persons') {
      results.contacts = await importAll('persons', key);
    }
    if (entity === 'all' || entity === 'deals') {
      results.deals = await importAll('deals', key);
    }

    return res.status(200).json({ ok: true, ...results });
  } catch (err) {
    console.error('[PipedriveImport] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function importAll(entity, key) {
  let start = 0;
  let total = 0;
  let hasMore = true;
  let errors = 0;

  while (hasMore) {
    const url = `${PD_BASE}/${entity}?api_token=${key}&limit=${BATCH}&start=${start}`;
    console.log(`[Import] Fetching ${entity} start=${start}`);

    const pdRes = await fetch(url);
    const pdData = await pdRes.json();

    if (!pdData.success || !pdData.data) break;

    const items = pdData.data;
    const pagination = pdData.additional_data?.pagination || {};
    hasMore = pagination.more_items_in_collection === true;
    start = pagination.next_start || start + BATCH;

    // Map and upsert
    let table, rows;

    if (entity === 'persons') {
      table = 'contacts';
      rows = items.filter(p => p.active_flag).map(p => ({
        id: `c${p.id}`,
        data: mapPerson(p),
        updated_at: p.update_time ? new Date(p.update_time).toISOString() : new Date().toISOString(),
      }));
    } else if (entity === 'organizations') {
      table = 'companies';
      rows = items.filter(o => o.active_flag).map(o => ({
        id: `org${o.id}`,
        data: mapOrganization(o),
        updated_at: o.update_time ? new Date(o.update_time).toISOString() : new Date().toISOString(),
      }));
    } else if (entity === 'deals') {
      table = 'deals';
      rows = items.filter(d => !d.deleted).map(d => ({
        id: `deal${d.id}`,
        data: mapDeal(d),
        updated_at: d.update_time ? new Date(d.update_time).toISOString() : new Date().toISOString(),
      }));
    }

    if (rows && rows.length > 0) {
      // Upsert in chunks of 200 to avoid payload size limits
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });
        if (error) {
          console.error(`[Import] ${table} upsert error:`, error.message);
          errors++;
        } else {
          total += chunk.length;
        }
      }
    }

    // Safety: cap at 5500 to stay under 60s timeout
    if (start >= 5500) {
      console.log(`[Import] ${entity}: capped at ${start}, total=${total}`);
      return { upserted: total, capped: true, errors };
    }
  }

  console.log(`[Import] ${entity}: done, total=${total}`);
  return { upserted: total, done: true, errors };
}

function mapPerson(p) {
  const primaryEmail = p.primary_email || p.email?.[0]?.value || '';
  const phone = p.phone?.find(ph => ph.value)?.value || '';
  return {
    id: `c${p.id}`,
    external_id: String(p.id),
    source: 'Pipedrive',
    firstName: p.first_name || '',
    lastName: p.last_name || '',
    email: primaryEmail,
    phone,
    title: p.job_title || '',
    companyId: p.org_id ? `org${p.org_id.value || p.org_id}` : '',
    company: p.org_name || '',
    owner: p.owner_name || 'Sunny Sidhu',
    status: p.active_flag ? 'Active' : 'Inactive',
    linkedin: '',
    notes: '',
    createdAt: p.add_time ? p.add_time.split(' ')[0] : '',
    lastActivity: p.last_activity_date || '',
    activities: [],
    campaigns: [],
    researchNotes: [],
    rightsHolders: [],
    authority: '',
    timezone: '',
    middleName: '',
    preferredContact: 'Email',
    dnc: false,
  };
}

function mapOrganization(o) {
  return {
    id: `org${o.id}`,
    external_id: String(o.id),
    source: 'Pipedrive',
    name: o.name || '',
    industry: o.industry || '',
    website: o.website || '',
    address: o.address_formatted_address || '',
    country: o.address_country || '',
    peopleCount: o.people_count || 0,
    openDeals: o.open_deals_count || 0,
    wonDeals: o.won_deals_count || 0,
    lostDeals: o.lost_deals_count || 0,
    owner: o.owner_name || 'Sunny Sidhu',
    label: o.label || null,
    createdAt: o.add_time ? o.add_time.split(' ')[0] : '',
    lastActivity: o.last_activity_date || '',
    notes: '',
  };
}

function mapDeal(d) {
  let stage = STAGE_MAP[d.stage_id] || 'Contact made';
  if (d.status === 'won') stage = 'Closed Won';
  if (d.status === 'lost') stage = 'Closed Lost';

  const pipeline = PIPELINE_MAP[d.pipeline_id] || '';

  return {
    id: `deal${d.id}`,
    external_id: String(d.id),
    source: 'Pipedrive',
    title: d.title || '',
    company: d.org_name || d.org_id?.name || '',
    companyId: d.org_id ? `org${d.org_id.value || d.org_id}` : '',
    contactName: d.person_name || '',
    contactId: d.person_id ? `c${d.person_id.value || d.person_id}` : '',
    value: d.value || 0,
    currency: d.currency || 'GBP',
    stage,
    status: d.status || 'open',
    pipeline,
    probability: d.probability || null,
    expectedCloseDate: d.expected_close_date || null,
    closeDate: d.close_time ? d.close_time.split(' ')[0] : null,
    wonDate: d.won_time ? d.won_time.split(' ')[0] : null,
    lostDate: d.lost_time ? d.lost_time.split(' ')[0] : null,
    lostReason: d.lost_reason || '',
    origin: d.origin || '',
    channel: d.channel_id || '',
    owner: d.owner_name || 'Sunny Sidhu',
    createdAt: d.add_time ? d.add_time.split(' ')[0] : '',
    lastActivity: d.last_activity_date || '',
    notes: '',
  };
}
