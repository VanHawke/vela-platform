// api/segments.js — Lead segment CRUD + matching engine
// Evaluates criteria JSONB against contacts + companies, returns matching IDs.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

// Apply a single rule to a contact row
function evalRule(rule, contact) {
  const path = rule.field || '';
  let val;
  if (path.startsWith('company.')) {
    val = contact.company_data?.[path.slice(8)];
  } else if (path.startsWith('data.')) {
    val = contact.data?.[path.slice(5)];
  } else {
    val = contact.data?.[path] ?? contact[path];
  }
  if (val === undefined || val === null) val = '';
  const target = rule.value ?? '';
  const sv = String(val).toLowerCase();
  const st = String(target).toLowerCase();
  switch (rule.op) {
    case 'is': return sv === st;
    case 'is_not': return sv !== st;
    case 'contains': return sv.includes(st);
    case 'not_contains': return !sv.includes(st);
    case 'starts_with': return sv.startsWith(st);
    case 'exists': return sv.length > 0;
    case 'not_exists': return sv.length === 0;
    case 'gt': return parseFloat(val) > parseFloat(target);
    case 'lt': return parseFloat(val) < parseFloat(target);
    case 'gte': return parseFloat(val) >= parseFloat(target);
    case 'lte': return parseFloat(val) <= parseFloat(target);
    default: return false;
  }
}

function evalCriteria(criteria, contact) {
  if (!criteria || typeof criteria !== 'object') return true;
  if (criteria.and) return criteria.and.every(r => r.and || r.or ? evalCriteria(r, contact) : evalRule(r, contact));
  if (criteria.or) return criteria.or.some(r => r.and || r.or ? evalCriteria(r, contact) : evalRule(r, contact));
  return evalRule(criteria, contact);
}

async function matchSegment(criteria, limit = 5000) {
  // Pull all contacts (cap at limit) joined with company intel
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, data, company_id')
    .limit(limit);
  if (!contacts) return [];
  // Pull company intel for the matched company_ids
  const companyIds = [...new Set(contacts.map(c => c.company_id).filter(Boolean))];
  let companyMap = {};
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, data')
      .in('id', companyIds);
    if (companies) companyMap = Object.fromEntries(companies.map(c => [c.id, c.data || {}]));
  }
  // Attach company_data to each contact and evaluate
  const enriched = contacts.map(c => ({ ...c, company_data: companyMap[c.company_id] || {} }));
  return enriched.filter(c => evalCriteria(criteria, c));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const action = req.query.action || 'list';
      if (action === 'list') {
        const { data, error } = await supabase.from('kiko_lead_segments').select('*').order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ segments: data || [] });
      }
      if (action === 'preview') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id required' });
        const { data: seg } = await supabase.from('kiko_lead_segments').select('criteria').eq('id', id).single();
        if (!seg) return res.status(404).json({ error: 'not found' });
        const matches = await matchSegment(seg.criteria, 1000);
        return res.status(200).json({ count: matches.length, sample: matches.slice(0, 10).map(c => ({ id: c.id, name: c.data?.name, email: c.data?.email, company: c.data?.company, title: c.data?.title })) });
      }
      if (action === 'preview_criteria') {
        // Preview an unsaved criteria object passed as ?criteria=<urlencoded JSON>
        try {
          const criteria = JSON.parse(decodeURIComponent(req.query.criteria || '{}'));
          const matches = await matchSegment(criteria, 1000);
          return res.status(200).json({ count: matches.length, sample: matches.slice(0, 10).map(c => ({ id: c.id, name: c.data?.name, email: c.data?.email, company: c.data?.company, title: c.data?.title })) });
        } catch (e) { return res.status(400).json({ error: 'invalid criteria JSON' }); }
      }
    }

    if (req.method === 'POST') {
      const body = req.body;
      const row = {
        name: body.name,
        description: body.description || null,
        criteria: body.criteria || { and: [] },
        sequence_id: body.sequence_id || null,
        auto_enroll: !!body.auto_enroll,
        org_id: ORG_ID,
      };
      const { data, error } = await supabase.from('kiko_lead_segments').insert(row).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ segment: data });
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      const { data, error } = await supabase.from('kiko_lead_segments').update({ ...req.body, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ segment: data });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await supabase.from('kiko_lead_segments').delete().eq('id', id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('[Segments] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

export { matchSegment };
