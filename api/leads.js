// api/leads.js — Lemlist-style lead management
// Endpoints:
//   GET    /api/leads?action=search&q=...&limit=50    → search master contacts pool
//   GET    /api/leads?action=get&id=c123               → full lead detail
//   POST   /api/leads?action=create                    → create new lead {firstName, lastName, email, title, linkedin, company, phone}
//   PATCH  /api/leads?action=update&id=c123            → update lead fields
//   POST   /api/leads?action=enrich&id=c123            → Sonnet+web_search to fill missing fields
//   POST   /api/leads?action=enroll                    → bulk enroll contacts into a sequence {sequence_id, contact_ids: []}
//   POST   /api/leads?action=remove_enrollment         → unenroll {enrollment_id}
//   POST   /api/leads?action=import_csv                → bulk import {rows: [{firstName,lastName,email,...}]}
//
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

function genId() { return 'lead_' + Math.random().toString(36).slice(2, 11); }

function normalizeLead(body) {
  return {
    firstName: body.firstName || body.first_name || '',
    lastName: body.lastName || body.last_name || '',
    email: (body.email || '').trim().toLowerCase(),
    title: body.title || body.job_title || '',
    linkedin: body.linkedin || body.linkedin_url || '',
    company: body.company || '',
    companyId: body.companyId || body.company_id || null,
    phone: body.phone || '',
    location: body.location || '',
    industry: body.industry || '',
    notes: body.notes || '',
    source: body.source || 'manual',
    status: 'Active',
    dnc: false,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}


export default async function handler(req, res) {
  try {
    const action = req.query.action || 'search';

    // ─── SEARCH master contacts pool ───
    if (action === 'search' && req.method === 'GET') {
      const q = (req.query.q || '').trim().toLowerCase();
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const hasEmail = req.query.has_email === 'true';
      const hasLinkedin = req.query.has_linkedin === 'true';
      const incomplete = req.query.incomplete === 'true';

      let query = supabase.from('contacts').select('id, data').limit(limit);
      const { data: rows, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      let results = (rows || []).map(r => ({ id: r.id, ...r.data }));
      if (q) {
        results = results.filter(r => {
          const blob = `${r.firstName || ''} ${r.lastName || ''} ${r.email || ''} ${r.company || ''} ${r.title || ''}`.toLowerCase();
          return blob.includes(q);
        });
      }
      if (hasEmail) results = results.filter(r => r.email && r.email.includes('@'));
      if (hasLinkedin) results = results.filter(r => r.linkedin);
      if (incomplete) results = results.filter(r => !r.email || !r.linkedin || !r.title);
      return res.status(200).json({ results: results.slice(0, limit), total: results.length });
    }

    // ─── GET single lead with all detail ───
    if (action === 'get' && req.method === 'GET') {
      const { id } = req.query;
      const { data: row, error } = await supabase.from('contacts').select('id, data').eq('id', id).maybeSingle();
      if (error || !row) return res.status(404).json({ error: 'not found' });
      // Pull active enrollments for this contact
      const { data: enrolls } = await supabase
        .from('kiko_sequence_enrollments')
        .select('id, sequence_id, status, current_step, enrolled_at, next_send_at')
        .eq('contact_id', id);
      return res.status(200).json({ lead: { id: row.id, ...row.data }, enrollments: enrolls || [] });
    }


    // ─── CREATE new lead ───
    if (action === 'create' && req.method === 'POST') {
      const lead = normalizeLead(req.body);
      if (!lead.firstName && !lead.email) return res.status(400).json({ error: 'firstName or email required' });
      const id = genId();
      const { error } = await supabase
        .from('contacts')
        .insert({ id, data: { id, ...lead }, org_id: ORG_ID });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, id, lead: { id, ...lead } });
    }

    // ─── UPDATE lead ───
    if (action === 'update' && req.method === 'PATCH') {
      const { id } = req.query;
      const { data: existing } = await supabase.from('contacts').select('data').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'not found' });
      const merged = { ...existing.data, ...req.body, id, updatedAt: new Date().toISOString() };
      const { error } = await supabase.from('contacts').update({ data: merged }).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, lead: { id, ...merged } });
    }

    // ─── ENRICH lead via Sonnet + web_search ───
    if (action === 'enrich' && req.method === 'POST') {
      const { id } = req.query;
      const { data: row } = await supabase.from('contacts').select('data').eq('id', id).maybeSingle();
      if (!row) return res.status(404).json({ error: 'not found' });
      const lead = row.data;
      const missing = [];
      if (!lead.email) missing.push('email');
      if (!lead.linkedin) missing.push('linkedin URL');
      if (!lead.title) missing.push('current job title');
      if (!lead.location) missing.push('city/country');
      if (!lead.industry) missing.push('industry');
      if (missing.length === 0) return res.status(200).json({ ok: true, message: 'already complete', lead });

      const prompt = `Find the following missing details for this person and return STRICT JSON only.

Person: ${lead.firstName} ${lead.lastName}
Company: ${lead.company || 'unknown'}
Known title: ${lead.title || 'unknown'}
Known email: ${lead.email || 'none'}
Known LinkedIn: ${lead.linkedin || 'none'}

Missing fields to find: ${missing.join(', ')}

Use your knowledge to provide best-guess values. If you cannot find a value with confidence, return empty string for that field. NEVER fabricate an email — only return one if you can derive it from a known company email pattern.

Return ONLY this JSON:
{"email":"","linkedin":"","title":"","location":"","industry":"","confidence":"low|medium|high","reasoning":"one sentence"}`;

      const result = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = result.content[0]?.text || '{}';
      const match = text.match(/\{[\s\S]*\}/);
      let parsed = {};
      try { parsed = JSON.parse(match ? match[0] : text); } catch (e) { parsed = {}; }

      const updates = {};
      ['email','linkedin','title','location','industry'].forEach(k => {
        if (parsed[k] && !lead[k]) updates[k] = parsed[k];
      });
      const merged = { ...lead, ...updates, lastEnrichedAt: new Date().toISOString(), enrichmentReasoning: parsed.reasoning };
      await supabase.from('contacts').update({ data: merged }).eq('id', id);
      return res.status(200).json({ ok: true, updated: Object.keys(updates), lead: merged, confidence: parsed.confidence });
    }


    // ─── BULK ENROLL contacts into a sequence ───
    if (action === 'enroll' && req.method === 'POST') {
      const { sequence_id, contact_ids } = req.body;
      if (!sequence_id || !Array.isArray(contact_ids) || contact_ids.length === 0) {
        return res.status(400).json({ error: 'sequence_id and contact_ids[] required' });
      }
      const { data: contacts } = await supabase
        .from('contacts').select('id, data').in('id', contact_ids);
      if (!contacts || contacts.length === 0) return res.status(404).json({ error: 'no contacts found' });

      const rows = contacts
        .filter(c => c.data?.email && !c.data?.dnc)
        .map(c => ({
          sequence_id,
          contact_id: c.id,
          contact_email: c.data.email,
          contact_name: `${c.data.firstName || ''} ${c.data.lastName || ''}`.trim(),
          company: c.data.company || null,
          title: c.data.title || null,
          linkedin_url: c.data.linkedin || null,
          phone: c.data.phone || null,
          status: 'active',
          current_step: 0,
          enrolled_at: new Date().toISOString(),
          enrolled_via: 'manual',
        }));

      if (rows.length === 0) return res.status(400).json({ error: 'no enrollable contacts (missing email or DNC)' });
      const { error, data } = await supabase
        .from('kiko_sequence_enrollments')
        .insert(rows)
        .select('id, contact_email');
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, enrolled: rows.length, skipped: contact_ids.length - rows.length, enrollments: data });
    }

    // ─── REMOVE enrollment ───
    if (action === 'remove_enrollment' && req.method === 'POST') {
      const { enrollment_id } = req.body;
      const { error } = await supabase.from('kiko_sequence_enrollments').delete().eq('id', enrollment_id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // ─── BULK CSV IMPORT ───
    if (action === 'import_csv' && req.method === 'POST') {
      const { rows } = req.body;
      if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows[] required' });
      const inserts = rows.map(r => {
        const lead = normalizeLead(r);
        const id = genId();
        return { id, data: { id, ...lead, source: 'csv_import' }, org_id: ORG_ID };
      });
      const { error } = await supabase.from('contacts').insert(inserts);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, imported: inserts.length });
    }

    return res.status(400).json({ error: 'unknown action: ' + action });
  } catch (err) {
    console.error('leads api error:', err);
    return res.status(500).json({ error: err.message });
  }
}
