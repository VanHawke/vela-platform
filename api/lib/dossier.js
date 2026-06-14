// api/lib/dossier.js
// Shared engine for the Archive re-engagement dossier.
// Imported by BOTH the POST /api/archive/dossier route and Kiko's chat tool.
// v1: ring-fenced, thread-deduped correspondence timeline. v2 adds the AI brief.
// Ring-fence reviewed + hardened (Kiko audit): Gmail scoped by OWNERSHIP not mailbox;
// dedupe decoupled from the view filter; resolution company-guarded.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const lc = (s) => (s || '').toString().toLowerCase().trim();
const dayKey = (d) => (d || '').toString().slice(0, 10);
const compMatch = (a, b) => { a = lc(a); b = lc(b); return !!a && !!b && (a.includes(b) || b.includes(a)); };
const MAX_ITEMS = 300;

// Verified viewer -> { userId, role, mailboxes[] }. Multi-row safe; resolves to
// the HIGHEST-privilege row so a user can never be silently downgraded.
export async function resolveViewer(verifiedEmail) {
  const email = lc(verifiedEmail);
  if (!email) return null;
  const { data: matches } = await supabase
    .from('kiko_user_config').select('user_id, role').ilike('email', email).eq('active', true);
  if (!matches || !matches.length) return null;
  const rank = (r) => (r === 'super_admin' ? 2 : 1);
  const best = [...matches].sort((a, b) => rank(b.role) - rank(a.role))[0];
  const { data: rows } = await supabase
    .from('kiko_user_config').select('email').eq('user_id', best.user_id).eq('active', true);
  const mailboxes = [...new Set((rows || []).map(r => lc(r.email)).filter(Boolean))];
  return { userId: best.user_id, role: best.role || 'user', mailboxes };
}

// Deal -> prospect identity. Defensive AND company-guarded so a name collision
// ("James Smith") can't pull another prospect's correspondence into this dossier.
export async function resolveProspect(deal, dealId) {
  const d = (deal && deal.data) || {};
  const company = d.company || d.companyName || null;
  const name = d.contact || d.contactName || null;
  const emails = new Set();
  const enrollmentIds = new Set();
  const threadIds = new Set();
  let linkedin = d.linkedinUrl || d.linkedin || null;

  // A: enrollments linked directly to the deal (cleanest when present)
  const { data: enrByDeal } = await supabase
    .from('kiko_sequence_enrollments').select('id').eq('deal_id', dealId);
  (enrByDeal || []).forEach(e => e.id && enrollmentIds.add(e.id));

  // B: outreach queue by contact name, GUARDED by company
  if (name) {
    const { data: oq } = await supabase
      .from('kiko_outreach_queue').select('to_email, enrollment_id, gmail_thread_id, company').ilike('to_name', name);
    (oq || []).forEach(r => {
      if (company && r.company && !compMatch(r.company, company)) return; // company guard
      if (r.to_email) emails.add(lc(r.to_email));
      if (r.enrollment_id) enrollmentIds.add(r.enrollment_id);
      if (r.gmail_thread_id) threadIds.add(r.gmail_thread_id);
    });
  }

  // C: contacts by first name, then exact full-name + company match in JS (no silent truncation)
  if (name) {
    const first = name.trim().split(/\s+/)[0];
    const { data: cs } = await supabase
      .from('contacts').select('data').ilike('data->>firstName', first).limit(100);
    (cs || []).forEach(c => {
      const cd = c.data || {};
      const fullOk = lc(`${cd.firstName || ''} ${cd.lastName || ''}`) === lc(name);
      const compOk = !company || !cd.company || compMatch(cd.company, company);
      if (fullOk && compOk) {
        if (cd.email) emails.add(lc(cd.email));
        if (cd.linkedinUrl && !linkedin) linkedin = cd.linkedinUrl;
      }
    });
  }

  return { name, company, linkedin, emails: [...emails], enrollmentIds: [...enrollmentIds], threadIds: [...threadIds] };
}

// Non-admin ring-fence: which enrollments did THIS viewer send?
// enrollment -> sequence -> send_from_user_id.
export async function allowedEnrollmentsFor(viewer, enrollmentIds) {
  if (!enrollmentIds.length) return new Set();
  const { data: enr } = await supabase
    .from('kiko_sequence_enrollments').select('id, sequence_id').in('id', enrollmentIds);
  const seqIds = [...new Set((enr || []).map(e => e.sequence_id).filter(Boolean))];
  const senderBySeq = {};
  if (seqIds.length) {
    const { data: seqs } = await supabase
      .from('kiko_sequences').select('id, send_from_user_id').in('id', seqIds);
    (seqs || []).forEach(s => { senderBySeq[s.id] = s.send_from_user_id; });
  }
  const allowed = new Set();
  (enr || []).forEach(e => { if (senderBySeq[e.sequence_id] === viewer.userId) allowed.add(e.id); });
  return allowed;
}

export async function buildDossier({ dealId, viewerEmail }) {
  const viewer = await resolveViewer(viewerEmail);
  if (!viewer) return { error: 'unauthorized', timeline: [] };
  const isAdmin = viewer.role === 'super_admin';

  const { data: deal } = await supabase
    .from('deals').select('id, data').eq('id', dealId).maybeSingle();
  if (!deal) return { error: 'deal_not_found', timeline: [] };

  const prospect = await resolveProspect(deal, dealId);
  const allowed = isAdmin ? null : await allowedEnrollmentsFor(viewer, prospect.enrollmentIds);

  const items = [];
  const seenThreads = new Set();   // dedupe: every campaign thread, regardless of view
  const ownedThreads = new Set();  // threads the viewer is allowed to see
  const seenReplyKeys = new Set();  // null-thread dedupe: address|day

  // 1) Campaign sends + campaign-detected replies. Record threads BEFORE filtering view.
  if (prospect.enrollmentIds.length) {
    const { data: oq } = await supabase
      .from('kiko_outreach_queue')
      .select('to_email,to_name,company,channel,subject,body_plain,step_number,scheduled_for,status,sent_at,gmail_thread_id,reply_snippet,reply_received_at,reply_type,enrollment_id,created_at')
      .in('enrollment_id', prospect.enrollmentIds);
    for (const r of (oq || [])) {
      const canSee = isAdmin || allowed.has(r.enrollment_id);
      if (r.gmail_thread_id) {
        seenThreads.add(r.gmail_thread_id);
        if (canSee) ownedThreads.add(r.gmail_thread_id);
      }
      if (!canSee) continue;
      const when = r.sent_at || r.scheduled_for || r.created_at;
      items.push({ date: when, channel: r.channel || 'email', direction: 'outbound', source: 'campaign',
        who: r.to_name || r.to_email, subject: r.subject || null, snippet: (r.body_plain || '').slice(0, 200),
        status: r.status, step: r.step_number, threadId: r.gmail_thread_id || null });
      if (r.reply_received_at || r.reply_snippet) {
        const rk = `${lc(r.to_email)}|${dayKey(r.reply_received_at || when)}`;
        seenReplyKeys.add(rk);
        items.push({ date: r.reply_received_at || when, channel: r.channel || 'email', direction: 'inbound',
          source: 'campaign_reply', who: r.to_name || r.to_email, subject: r.subject ? `Re: ${r.subject}` : null,
          snippet: (r.reply_snippet || '').slice(0, 200), replyType: r.reply_type || null, threadId: r.gmail_thread_id || null });
      }
    }
  }

  // 2) Raw Gmail replies from the prospect. Non-admin sees a reply ONLY on a thread
  // they OWN (mailbox alone is not ownership). Deduped vs campaign by thread + address|day.
  if (prospect.emails.length) {
    let qb = supabase.from('emails')
      .select('from_address,to_addresses,subject,snippet,thread_id,date,user_email')
      .in('from_address', prospect.emails).order('date', { ascending: true }).limit(100);
    if (!isAdmin) qb = qb.in('user_email', viewer.mailboxes);
    const { data: em } = await qb;
    for (const e of (em || [])) {
      if (!isAdmin && !(e.thread_id && ownedThreads.has(e.thread_id))) continue; // ownership ring-fence
      if (e.thread_id && seenThreads.has(e.thread_id)) continue;                  // dedupe by thread
      const rk = `${lc(e.from_address)}|${dayKey(e.date)}`;
      if (seenReplyKeys.has(rk)) continue;                                        // dedupe null-thread twins
      items.push({ date: e.date, channel: 'email', direction: 'inbound', source: 'gmail',
        who: e.from_address, subject: e.subject || null, snippet: (e.snippet || '').slice(0, 200),
        threadId: e.thread_id || null, mailbox: e.user_email });
      if (e.thread_id) seenThreads.add(e.thread_id);
      seenReplyKeys.add(rk);
    }
  }

  // 3) LinkedIn touches, same enrollment ownership ring-fence
  if (prospect.enrollmentIds.length) {
    const { data: li } = await supabase
      .from('kiko_linkedin_queue')
      .select('contact_name,company,linkedin_url,message_type,message,status,created_at,actioned_at,enrollment_id')
      .in('enrollment_id', prospect.enrollmentIds);
    for (const r of (li || [])) {
      if (!isAdmin && !allowed.has(r.enrollment_id)) continue;
      items.push({ date: r.actioned_at || r.created_at, channel: 'linkedin',
        direction: r.message_type === 'reply' ? 'inbound' : 'outbound', source: 'linkedin',
        who: r.contact_name, snippet: (r.message || '').slice(0, 200), status: r.status, threadId: null });
    }
  }

  // 4) Manual activity log, scoped by created_by for non-admins
  {
    let qa = supabase.from('activities')
      .select('type,subject,body,direction,status,completed_at,created_at,created_by')
      .eq('deal_id', dealId).order('created_at', { ascending: true });
    if (!isAdmin) qa = qa.eq('created_by', viewer.userId);
    const { data: acts } = await qa;
    for (const a of (acts || [])) {
      items.push({ date: a.completed_at || a.created_at, channel: a.type || 'activity',
        direction: a.direction || 'note', source: 'activity', who: prospect.name,
        subject: a.subject || null, snippet: (a.body || '').slice(0, 200), status: a.status });
    }
  }

  items.sort((x, y) => new Date(x.date || 0) - new Date(y.date || 0));
  const truncated = items.length > MAX_ITEMS;
  const timeline = truncated ? items.slice(-MAX_ITEMS) : items;

  return {
    deal: { id: deal.id, company: prospect.company, title: deal.data?.title, value: deal.data?.value,
      stage: deal.data?.stage, status: deal.data?.status, contact: prospect.name,
      assignedTo: deal.data?.assigned_to, archiveReason: deal.data?.archive_reason,
      archivedAt: deal.data?.archived_at, lastActivity: deal.data?.lastActivityDate },
    prospect: { name: prospect.name, company: prospect.company, emails: prospect.emails, linkedin: prospect.linkedin },
    viewer: { role: viewer.role, scoped: !isAdmin },
    counts: { total: timeline.length, truncated,
      outbound: timeline.filter(i => i.direction === 'outbound').length,
      replies: timeline.filter(i => i.direction === 'inbound').length },
    timeline
  };
}

export default { buildDossier, resolveViewer, resolveProspect, allowedEnrollmentsFor };
