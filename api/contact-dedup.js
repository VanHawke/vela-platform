// api/contact-dedup.js — Find and merge duplicate contacts
// Finds duplicates by: same email, or same name + company
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

export default async function handler(req, res) {
  try {
    // GET — find duplicate groups
    if (req.method === 'GET') {
      const { data: contacts } = await supabase
        .from('contacts').select('id, data, updated_at')
        .eq('org_id', ORG_ID).limit(5000);
      if (!contacts) return res.json({ groups: [] });

      const emailMap = {};
      const nameMap = {};
      for (const c of contacts) {
        const d = c.data || {};
        const email = (d.email || '').toLowerCase().trim();
        const name = [d.firstName, d.lastName].filter(Boolean).join(' ').toLowerCase().trim();
        const company = (d.company || '').toLowerCase().trim();
        const nameKey = name && company ? `${name}@${company}` : '';

        if (email) {
          if (!emailMap[email]) emailMap[email] = [];
          emailMap[email].push(c);
        }
        if (nameKey) {
          if (!nameMap[nameKey]) nameMap[nameKey] = [];
          nameMap[nameKey].push(c);
        }
      }

      // Collect duplicate groups (2+ contacts with same key)
      const seen = new Set();
      const groups = [];
      for (const [key, group] of Object.entries(emailMap)) {
        if (group.length < 2) continue;
        const ids = group.map(c => c.id).sort().join(',');
        if (seen.has(ids)) continue;
        seen.add(ids);
        groups.push({ reason: `Same email: ${key}`, contacts: group.map(c => ({ id: c.id, ...c.data, updated_at: c.updated_at })) });
      }
      for (const [key, group] of Object.entries(nameMap)) {
        if (group.length < 2) continue;
        const ids = group.map(c => c.id).sort().join(',');
        if (seen.has(ids)) continue;
        seen.add(ids);
        groups.push({ reason: `Same name+company: ${key}`, contacts: group.map(c => ({ id: c.id, ...c.data, updated_at: c.updated_at })) });
      }
      return res.json({ groups, total: groups.length });
    }

    // POST — merge two contacts (keep primary, delete secondary)
    if (req.method === 'POST') {
      const { keepId, deleteId } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!keepId || !deleteId) return res.status(400).json({ error: 'keepId and deleteId required' });

      // Get both contacts
      const { data: keep } = await supabase.from('contacts').select('id, data').eq('id', keepId).single();
      const { data: del } = await supabase.from('contacts').select('id, data').eq('id', deleteId).single();
      if (!keep || !del) return res.status(404).json({ error: 'Contact not found' });

      // Merge: keep contact gets any missing fields from delete contact
      const merged = { ...keep.data };
      for (const [k, v] of Object.entries(del.data || {})) {
        if (v && !merged[k]) merged[k] = v;
      }

      // Update deals referencing the deleted contact
      await supabase.from('deals').update({ contact_id: keepId }).eq('contact_id', deleteId);

      // Update keep contact with merged data
      await supabase.from('contacts').update({ data: merged, updated_at: new Date().toISOString() }).eq('id', keepId);

      // Delete the duplicate
      await supabase.from('contacts').delete().eq('id', deleteId);

      return res.json({ ok: true, merged: keepId, deleted: deleteId });
    }

    return res.status(405).json({ error: 'GET or POST' });
  } catch (err) {
    console.error('[contact-dedup]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
