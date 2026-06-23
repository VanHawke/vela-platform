// api/campaign-conflicts.js — Session 72: cross-campaign conflict engine for the
// campaign builder prospects step. POST { emails: [], companies: [], exclude_sequence_id? }
// Returns person-level conflicts (active enrollment in another live sequence) and
// company-level overlaps (same company live elsewhere). Enrollments whose sequence
// finished/archived, or that ended >90 days ago, do not count — prospects become
// approachable again.
import { sbFetch } from './kiko-tools.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const emails = (body.emails || []).map(e => String(e).toLowerCase()).filter(Boolean).slice(0, 1000);
    const companies = (body.companies || []).map(c => String(c).toLowerCase().trim()).filter(Boolean).slice(0, 1000);
    const excludeSeq = body.exclude_sequence_id || null;

    const seqs = await sbFetch('kiko_sequences?select=id,name,is_active,archived');
    const liveSeqIds = new Set((seqs || []).filter(s => s.is_active && !s.archived && s.id !== excludeSeq).map(s => s.id));
    const seqName = Object.fromEntries((seqs || []).map(s => [s.id, s.name]));

    // No date filter on the fetch: an ACTIVE enrollment in a live sequence is a
    // conflict at any age (Kiko review, 12 Jun). The 90-day window applies only
    // to finished contacts, surfaced separately as recent_contacts.
    const cutoff = Date.now() - 90 * 86400000;
    const enrollments = await sbFetch(
      'kiko_sequence_enrollments?select=sequence_id,contact_email,company,status,current_step,created_at,completed_at,reply_detected_at&limit=5000'
    );

    const TERMINAL = ['replied', 'bounced', 'stopped', 'completed', 'unsubscribed'];
    const personConflicts = [];
    const companyConflicts = [];
    const recentContacts = [];
    const seenCompany = new Set();
    for (const e of (enrollments || [])) {
      const em = String(e.contact_email || '').toLowerCase();
      const co = String(e.company || '').toLowerCase().trim();
      const status = String(e.status || '').toLowerCase();
      const isTerminal = TERMINAL.includes(status);
      if (!isTerminal && liveSeqIds.has(e.sequence_id)) {
        // Blank/unknown status on a live sequence counts as a conflict on purpose —
        // excluded-by-default is the safe direction for clean messaging.
        if (em && emails.includes(em)) {
          personConflicts.push({ email: em, campaign: seqName[e.sequence_id] || e.sequence_id, step: e.current_step || 1 });
        }
        if (co && companies.includes(co) && !seenCompany.has(co + e.sequence_id)) {
          seenCompany.add(co + e.sequence_id);
          companyConflicts.push({ company: e.company, campaign: seqName[e.sequence_id] || e.sequence_id });
        }
      } else if (isTerminal && em && emails.includes(em)) {
        const endedAt = new Date(e.reply_detected_at || e.completed_at || e.created_at || 0).getTime();
        if (endedAt >= cutoff) {
          recentContacts.push({ email: em, campaign: seqName[e.sequence_id] || e.sequence_id, status, ended: new Date(endedAt).toISOString().slice(0, 10) });
        }
      }
    }
    // Category-vs-partnership reverse check (Kiko): if this campaign's category — or an overlapping
    // one — is already held by a CONFIRMED partnership at the target team, surface it. This is the
    // launch-time mirror of the confirmed-add conflict alert. Only confirmed partnerships count
    // (verified=true, status=active), so a pending scanner detection never blocks a launch. Runs
    // only when the caller passes category + team_id; otherwise behaviour is unchanged.
    const categoryConflicts = [];
    const cat = String(body.category || '').trim();
    const teamId = String(body.team_id || '').trim();
    if (cat && teamId) {
      const [ov1, ov2] = await Promise.all([
        sbFetch(`category_overlaps?primary_category=eq.${encodeURIComponent(cat)}&select=blocking_category`).catch(() => []),
        sbFetch(`category_overlaps?blocking_category=eq.${encodeURIComponent(cat)}&select=primary_category`).catch(() => []),
      ]);
      const expanded = new Set([cat, ...(ov1 || []).map(o => o.blocking_category), ...(ov2 || []).map(o => o.primary_category)].filter(Boolean));
      const parts = await sbFetch(`f1_partnerships?team_id=eq.${encodeURIComponent(teamId)}&status=eq.active&verified=is.true&select=partner_name,category_id,related_categories`).catch(() => []);
      for (const p of (parts || [])) {
        const hit = (p.category_id && expanded.has(p.category_id)) || (Array.isArray(p.related_categories) && p.related_categories.some(rc => expanded.has(rc)));
        if (hit) categoryConflicts.push({ partner: p.partner_name, category: p.category_id, team_id: teamId });
      }
    }
    return res.json({
      ok: true,
      person_conflicts: personConflicts,
      company_conflicts: companyConflicts,
      category_conflicts: categoryConflicts,
      recent_contacts: recentContacts,
      checked: { emails: emails.length, companies: companies.length, live_sequences: liveSeqIds.size },
    });
  } catch (e) {
    console.error('[campaign-conflicts]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
