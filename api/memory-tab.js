// api/memory-tab.js — Backend for the Memory tab in Settings
// Sunny spec 2026-04-12 v0.0.39: visualise what Kiko remembers, edit/delete facts.
//
// GET ?user_id=xxx&category=optional&q=optional&limit=100&offset=0
//   → list rows from kiko_personal_context for that user
//
// POST { user_id, category, key, value }
//   → add a manual fact (source='manual')
//
// PATCH { id, value }
//   → update a fact's value
//
// DELETE ?id=xxx
//   → delete a single fact

import { sbFetch } from './kiko-tools.js';


function isUuid(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const userId = req.query?.user_id;
      const category = req.query?.category;
      const q = req.query?.q;
      const limit = Math.min(parseInt(req.query?.limit || '100', 10), 500);
      const offset = parseInt(req.query?.offset || '0', 10);
      if (!isUuid(userId)) return res.status(400).json({ error: 'invalid user_id' });

      let url = `kiko_personal_context?user_id=eq.${userId}&select=id,category,key,value,source,created_at,updated_at&order=updated_at.desc&limit=${limit}&offset=${offset}`;
      if (category && category !== 'all') url += `&category=eq.${encodeURIComponent(category)}`;
      if (q) url += `&value=ilike.${encodeURIComponent('%' + q + '%')}`;

      const rows = await sbFetch(url);

      // Aggregate counts per category for the sidebar
      const allRows = await sbFetch(`kiko_personal_context?user_id=eq.${userId}&select=category`);
      const counts = {};
      for (const r of (allRows || [])) {
        counts[r.category] = (counts[r.category] || 0) + 1;
      }

      return res.status(200).json({
        rows: Array.isArray(rows) ? rows : [],
        counts,
        total: (allRows || []).length,
      });
    }

    if (req.method === 'POST') {
      const { user_id, category, key, value } = req.body || {};
      if (!isUuid(user_id)) return res.status(400).json({ error: 'invalid user_id' });
      if (!category || !key || !value) return res.status(400).json({ error: 'category, key, value required' });
      if (typeof value !== 'string' || value.length < 3 || value.length > 1000) {
        return res.status(400).json({ error: 'value must be 3-1000 chars' });
      }
      const inserted = await sbFetch('kiko_personal_context', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id, category, key: key.slice(0, 50), value, source: 'manual',
        }),
      });
      return res.status(201).json({ ok: true, row: Array.isArray(inserted) ? inserted[0] : inserted });
    }

    if (req.method === 'PATCH') {
      const { id, value } = req.body || {};
      if (!isUuid(id)) return res.status(400).json({ error: 'invalid id' });
      if (!value || typeof value !== 'string' || value.length < 3 || value.length > 1000) {
        return res.status(400).json({ error: 'value must be 3-1000 chars' });
      }
      await sbFetch(`kiko_personal_context?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ value, updated_at: new Date().toISOString() }),
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      // Single delete: ?id=xxx
      // Bulk delete:   ?ids=uuid1,uuid2,uuid3  (max 200 per call)
      const id = req.query?.id;
      const idsParam = req.query?.ids;

      if (idsParam) {
        const ids = String(idsParam).split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length === 0) return res.status(400).json({ error: 'no ids provided' });
        if (ids.length > 200) return res.status(400).json({ error: 'max 200 ids per bulk delete' });
        if (!ids.every(isUuid)) return res.status(400).json({ error: 'all ids must be valid uuids' });
        const idList = ids.join(',');
        await sbFetch(`kiko_personal_context?id=in.(${idList})`, { method: 'DELETE' });
        return res.status(200).json({ ok: true, deleted: ids.length });
      }

      if (!isUuid(id)) return res.status(400).json({ error: 'invalid id' });
      await sbFetch(`kiko_personal_context?id=eq.${id}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[memory-tab] error:', err);
    return res.status(500).json({ error: err?.message || 'unknown' });
  }
}
