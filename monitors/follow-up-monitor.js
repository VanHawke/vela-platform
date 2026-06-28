// monitors/follow-up-monitor.js — Adaptive follow-up scan (v1). Designed with Kiko.
// Reads kiko_email_tracking (never writes thread state). Computes per-person cadence via
// api/lib/followup-cadence.js, then applies Kiko's card-surface doctrine:
//   GATE: a genuine inbound human reply on the thread (OOO/auto-replies filtered). Campaign
//         first-touch with no reply is the sequence sender's job, never a card.
//   STALENESS: card only if overdue by <= one interval AND last inbound reply <= 21 days ago.
//   DEDUPE: one live card per contact, the thread with the most recent inbound reply wins.
//   PARK VISIBLY: aged-out / capped warm threads land in the re-engagement queue, not nothing.
// Writes ONE idempotent kiko_draft_actions card per surviving contact behind the hard approval
// gate. Runs once each weekday morning, Doha time.

import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'
import { computeCadence, buildCardPayload, replyLatencySamples } from '../api/lib/followup-cadence.js'
import { getGoogleToken } from '../api/cron-utils.js'

const SUNNY = '9f486437-4bf5-4111-abfe-fe19bfa76063'
const ORG = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5'
const DAY = 86400000
const LOOKBACK_DAYS = 180
const ABSOLUTE_CEILING_DAYS = 21       // last inbound reply older than this -> re-engagement, not follow-up
const MAX_DRAFTS_PER_RUN = 12
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })

async function sbFetch(path, opts = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return []
  const res = await fetch(`${url}/rest/v1/${path}`, { ...opts, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...opts.headers } })
  if (!res.ok) return []
  return res.json().catch(() => [])
}

const daysBetween = (a, b) => (new Date(b) - new Date(a)) / DAY
const hasQuestion = (t) => /\?/.test(t || '')

// Best-effort display name/org when CRM enrichment is absent: prettify the email local-part
// ("mike.kelley" -> "Mike Kelley") and derive an org label from the domain ("ball.com" -> "Ball").
const titleCase = (s) => (s || '').replace(/[._-]+/g, ' ').split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
const displayName = (raw, email) => { let n = (raw || '').trim(); if (!n || n.includes('@')) n = (email || '').split('@')[0] || ''; return /^[a-z0-9._+-]+$/i.test(n) ? titleCase(n) : n }
const GENERIC_MAIL = new Set(['gmail','outlook','hotmail','yahoo','icloud','me','proton','protonmail','aol','live','msn','googlemail'])
const companyFromEmail = (email) => { const label = (((email || '').split('@')[1] || '').toLowerCase().split('.')[0]); return (!label || GENERIC_MAIL.has(label)) ? null : titleCase(label) }
const fingerprintIntent = (threadId, text) => createHash('sha256').update(`${threadId || 'nt'}|${text}`).digest('hex').slice(0, 40)

// OOO / auto-reply / left-company patterns. These are not engagement; they must not pass the gate.
const NOT_GENUINE = /out of office|automatic reply|auto-?reply|away from (the |my )?(office|desk)|on (leave|vacation|holiday|annual leave|maternity|paternity|parental)|currently (away|out of)|will be back|back in the office|no longer (with|at)|has left|i am out|i'm out|return(ing)? (on|to)/i
const isGenuineReply = (r) => !!r.replied_at && !r.bounced_at && !NOT_GENUINE.test(r.reply_snippet || '')

// Deterministic intent. Punctuation and empty replies resolve by rule. A genuinely ambiguous reply is
// classified ONCE by Haiku at temperature 0 (greedy) and the verdict is cached by a fingerprint of the
// exact reply text. Re-runs reuse the cached verdict, so a thread can never flip card<->park between scans.
async function classifyIntent(replyText, threadId) {
  const t = (replyText || '').trim()
  if (!t) return 'awaiting_them'
  if (hasQuestion(t)) return 'awaiting_us'
  const fp = fingerprintIntent(threadId, t)
  const hit = await sbFetch(`kiko_intent_cache?fingerprint=eq.${fp}&select=intent&limit=1`)
  if (Array.isArray(hit) && hit[0]?.intent) return hit[0].intent
  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 8, temperature: 0,
      system: 'Classify the sender\'s last email. Reply EXACTLY one token: awaiting_us (they asked or requested something from us), awaiting_them (ball is with them), or closing (they signalled a stop, decline, or not now). No other text.',
      messages: [{ role: 'user', content: t.slice(0, 600) }],
    })
    const raw = (r.content?.[0]?.text || '').trim().toLowerCase()
    const out = ['awaiting_us', 'awaiting_them', 'closing'].includes(raw) ? raw : 'awaiting_them'
    await sbFetch('kiko_intent_cache', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ fingerprint: fp, thread_id: threadId || null, intent: out, reply_excerpt: t.slice(0, 200) }) })
    return out
  } catch { return 'awaiting_them' } // transient failure: do not cache, retry next run
}

async function generateDraft(ctx) {
  const mode = ctx.scenario === 'respond' ? 'a concise reply that answers what they last asked' : 'a short, warm follow-up nudge that moves it forward without pressure'
  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 320,
      system: `You are drafting an email for Sunny (CEO, Van Hawke Group, F1 sponsorship and luxury advisory). Write ${mode}. Use the recipient's real first name. Under 90 words. No em-dashes. British English. Direct, senior register. Return only the email body, no subject, no preamble.`,
      messages: [{ role: 'user', content: `Recipient: ${ctx.name}${ctx.company ? ' at ' + ctx.company : ''}\nSubject: ${ctx.subject || ''}\nTheir last message to us: "${(ctx.lastInbound?.snippet || '').slice(0, 400)}"\nRelationship: ${ctx.relationship}\nDraft the message.` }],
    })
    return (r.content?.[0]?.text || '').trim()
  } catch { return null }
}

async function parkReengagement(cand, now, dryRun) {
  if (dryRun) return
  const key = `followup:${cand.contact}`
  const existing = await sbFetch(`kiko_parked_intelligence?dedupe_key=eq.${encodeURIComponent(key)}&select=id&limit=1`)
  const body = {
    entity_type: 'contact', name: cand.name, company: cand.company || null, email: cand.contact, contact_id: cand.contactId || null,
    category: 're_engagement', source: 'followup_scan', status: 'parked', dedupe_key: key, org_id: ORG,
    rationale: `Warm thread gone quiet. They last replied ${Math.round(cand.daysSinceReply)}d ago; past the ${ABSOLUTE_CEILING_DAYS}d follow-up window. Re-open with a fresh angle, do not nudge.`,
    signals: { thread_id: cand.threadId, days_since_reply: Math.round(cand.daysSinceReply), interval: cand.cad.interval_days, last_inbound: cand.lastReplySnippet?.slice(0, 160) || null },
  }
  if (Array.isArray(existing) && existing[0]?.id) await sbFetch(`kiko_parked_intelligence?id=eq.${existing[0].id}`, { method: 'PATCH', body: JSON.stringify({ ...body, created_at: undefined }) })
  else await sbFetch('kiko_parked_intelligence', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), created_at: now.toISOString(), ...body }) })
}

// Resolution gate (calendar): does the OWNER already have a live meeting booked with this contact?
// A confirmed, non-declined event that has the contact as organiser/attendee, upcoming or within the
// last day, means the thread is settled -- no chase, no respond card. This is immune to Gmail splitting
// one conversation across separate threads, because the meeting lives on the calendar regardless of
// which email thread produced it. Owner-scoped (each user's own Google token), so it holds for all users.
// Fails OPEN (returns null) on any missing-token / API error, so a calendar hiccup never silences a real
// follow-up; it only ever SUPPRESSES on a positive "meeting exists" signal.
export async function meetingBookedWith(ownerEmail, contactEmail) {
  if (!ownerEmail || !contactEmail) return null
  let token
  try { token = await getGoogleToken(ownerEmail) } catch { return null }
  if (!token) return null
  const c = contactEmail.toLowerCase()
  const timeMin = new Date(Date.now() - 1 * DAY).toISOString()
  const timeMax = new Date(Date.now() + 60 * DAY).toISOString()
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=50&q=${encodeURIComponent(contactEmail)}`
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const data = await res.json()
    const items = Array.isArray(data?.items) ? data.items : []
    for (const ev of items) {
      if (ev.status === 'cancelled') continue
      const att = Array.isArray(ev.attendees) ? ev.attendees : []
      const isParticipant = (ev.organizer?.email || '').toLowerCase() === c || att.some(a => (a.email || '').toLowerCase() === c)
      if (!isParticipant) continue
      const self = att.find(a => a.self)
      if (self && self.responseStatus === 'declined') continue // owner declined -> not a live meeting
      return { id: ev.id, summary: ev.summary || '(no title)', start: ev.start?.dateTime || ev.start?.date || '' }
    }
  } catch { return null }
  return null
}

// Cross-thread interaction read (Gmail): the single most recent message exchanged with this contact
// across ALL threads, including mail sent outside the platform (e.g. a reply from Outlook that never
// hit kiko_email_tracking). Returns { direction, at } or null. 'outbound' = our message is the most
// recent, so we have already replied / are in active contact; 'inbound' = their message is the most
// recent, so they are genuinely waiting on us. This is the authoritative reconciliation the per-thread
// snapshot cannot give, because Gmail routinely splits one conversation across separate threads.
// Fails OPEN (null) on any token/API error so a hiccup never changes the monitor's behaviour.
export async function latestMailWith(ownerEmail, contactEmail) {
  if (!ownerEmail || !contactEmail) return null
  let token
  try { token = await getGoogleToken(ownerEmail) } catch { return null }
  if (!token) return null
  const c = contactEmail.toLowerCase()
  const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
  try {
    const q = encodeURIComponent(`from:${contactEmail} OR to:${contactEmail}`)
    const listRes = await fetch(`${GMAIL}/messages?q=${q}&maxResults=1`, { headers: { Authorization: `Bearer ${token}` } })
    if (!listRes.ok) return null
    const list = await listRes.json()
    const msgId = list?.messages?.[0]?.id
    if (!msgId) return null
    const msgRes = await fetch(`${GMAIL}/messages/${msgId}?format=metadata&metadataHeaders=From`, { headers: { Authorization: `Bearer ${token}` } })
    if (!msgRes.ok) return null
    const msg = await msgRes.json()
    const labels = Array.isArray(msg.labelIds) ? msg.labelIds : []
    const fromVal = ((msg.payload?.headers || []).find(h => (h.name || '').toLowerCase() === 'from')?.value || '').toLowerCase()
    // SENT label is definitive for "we sent this". Fall back to the From line, then the INBOX label.
    const direction = labels.includes('SENT') ? 'outbound' : (fromVal.includes(c) ? 'inbound' : (labels.includes('INBOX') ? 'inbound' : (fromVal ? 'outbound' : 'inbound')))
    const at = msg.internalDate ? new Date(parseInt(msg.internalDate, 10)).toISOString() : null
    return { direction, at }
  } catch { return null }
}

export async function runFollowUpMonitor(opts = {}) {
  const dryRun = !!opts.dryRun
  const now = new Date()
  const since = new Date(now - LOOKBACK_DAYS * DAY).toISOString()
  console.log(`[follow-up-scan] start ${dryRun ? '(DRY RUN)' : ''} ${now.toISOString()}`)

  const rows = await sbFetch(`kiko_email_tracking?sent_at=gt.${since}&select=id,user_id,recipient_email,recipient_name,company,subject,gmail_thread_id,sent_at,replied_at,reply_snippet,clicked_at,bounced_at,follow_up_dismissed,contact_id,enrollment_id&order=sent_at.asc`)
  if (!Array.isArray(rows) || !rows.length) { console.log('[follow-up-scan] no tracking rows'); return { dryRun, candidates: 0, cards: [], reengage: 0, resolvedByCalendar: 0, skipped: 0 } }

  // Owner email map (user_id -> email) for per-user calendar resolution checks. No hardcoding: a card's
  // calendar is always the calendar of the user who owns the thread, so this holds for every user.
  const ucfg = await sbFetch('kiko_user_config?select=user_id,email')
  const emailByUser = {}; for (const u of (Array.isArray(ucfg) ? ucfg : [])) { if (u.user_id && u.email) emailByUser[u.user_id] = u.email }

  // Contacts-table enrichment: prefer real names/companies from kiko_relationships when present
  // (populated from Gmail headers, no model tokens). Falls back to email-derived display values.
  const relRows = await sbFetch('kiko_relationships?select=contact_email,contact_name,company')
  const relMap = {}; for (const rr of (Array.isArray(relRows) ? relRows : [])) { const e = (rr.contact_email || '').toLowerCase(); if (e) relMap[e] = rr }

  const byContact = {}, byThread = {}
  for (const r of rows) {
    const c = (r.recipient_email || '').toLowerCase(); if (!c) continue
    ;(byContact[c] ||= []).push(r)
    const tid = r.gmail_thread_id || `no-thread:${c}:${r.subject || ''}`
    ;(byThread[tid] ||= []).push(r)
  }

  // Phase 1: per-thread analysis -> due candidates (each carries staleness verdict)
  const candidates = []; let skipped = 0, capParked = 0
  for (const [tid, trows] of Object.entries(byThread)) {
    trows.sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at))
    const latest = trows[trows.length - 1]
    if (latest.bounced_at) { skipped++; continue } // NOTE: follow_up_dismissed is the legacy "reply detected" flag (set on every replied row); it is NOT a skip signal here
    const contact = (latest.recipient_email || '').toLowerCase()
    const cRows = byContact[contact] || trows

    // GATE: a genuine inbound reply must exist ON THIS THREAD (campaign-only / cold dropped)
    const threadReplies = trows.filter(isGenuineReply)
    if (!threadReplies.length) { skipped++; continue }
    const lastReply = threadReplies[threadReplies.length - 1]
    const lastInboundReplyAt = new Date(lastReply.replied_at)
    const lastReplySnippet = lastReply.reply_snippet || ''
    const daysSinceReply = daysBetween(lastInboundReplyAt, now)

    const intent = await classifyIntent(lastReplySnippet, latest.gmail_thread_id || tid)
    if (intent === 'closing') {
      // They signalled stop. Skip, and self-heal: retire any pending card so a declined thread leaves nothing live.
      if (!dryRun) await sbFetch(`kiko_draft_actions?action_type=eq.follow_up&status=eq.pending&payload->>thread_id=eq.${encodeURIComponent(latest.gmail_thread_id || tid)}`, { method: 'PATCH', body: JSON.stringify({ status: 'superseded' }) })
      skipped++; continue
    }

    const unansweredFollowups = trows.filter(r => new Date(r.sent_at) > lastInboundReplyAt && !r.replied_at).length
    const cad = computeCadence({
      now, rows: cRows, contact: { id: latest.contact_id, name: latest.recipient_name, company: latest.company, title: null },
      currentThread: {
        sent_at: latest.sent_at, gmail_thread_id: latest.gmail_thread_id, recipient_name: latest.recipient_name,
        ever_replied: true, unanswered_followups: unansweredFollowups,
        last_inbound_is_reply: intent === 'awaiting_us', asked_question: intent === 'awaiting_us' && hasQuestion(lastReplySnippet),
        clicked: !!latest.clicked_at,
      },
    })
    const base = { contact, threadId: latest.gmail_thread_id || tid, cad, lastInboundReplyAt, daysSinceReply, lastReplySnippet, intent, latest, cRows, name: latest.recipient_name, company: latest.company, contactId: latest.contact_id, clicked: !!latest.clicked_at }

    // awaiting_us: ball is with us. Bypass cadence + staleness, surface as a respond card within 21d.
    if (intent === 'awaiting_us') {
      candidates.push({ ...base, verdict: daysSinceReply <= ABSOLUTE_CEILING_DAYS ? 'card' : 'park', parkReason: 're_engage_later' })
      continue
    }

    // awaiting_them: cadence-paced chase, gated by two-part staleness (relative floored at one business week).
    if (cad.park) { candidates.push({ ...base, verdict: 'park', parkReason: cad.park_reason || 're_engage_later' }); continue }
    const ourLastSendAt = new Date(Math.max(...trows.map(r => +new Date(r.sent_at))))
    const latestEventAt = new Date(Math.max(+ourLastSendAt, +lastInboundReplyAt))
    const recommended = new Date(+latestEventAt + cad.interval_days * DAY)
    if (recommended > now) { skipped++; continue } // not yet due
    const overdueDays = daysBetween(recommended, now)
    const relPass = overdueDays <= Math.max(cad.interval_days, 7) // C: never call a thread stale before one business week overdue
    const absPass = daysSinceReply <= ABSOLUTE_CEILING_DAYS
    candidates.push({ ...base, recommended, verdict: (relPass && absPass) ? 'card' : 'park', parkReason: 're_engage_later' })
  }

  // Phase 2: dedupe per contact -> winner = most recent inbound reply
  const byContactCand = {}
  for (const c of candidates) { const k = c.contact; if (!byContactCand[k] || c.lastInboundReplyAt > byContactCand[k].lastInboundReplyAt) byContactCand[k] = c }

  const cards = []; let reengage = 0, drafts = 0, resolvedByCalendar = 0, reconciled = 0
  for (const win of Object.values(byContactCand)) {
    if (win.verdict === 'park') {
      await parkReengagement(win, now, dryRun); reengage++
      // Aged out of the follow-up window: retire any pending card so it lives only in the re-engagement queue.
      if (!dryRun) await sbFetch(`kiko_draft_actions?action_type=eq.follow_up&status=eq.pending&payload->>thread_id=eq.${encodeURIComponent(win.threadId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'superseded' }) })
      continue
    }
    // Owner routing (Kiko): a card belongs to the thread's sender, never a blind default to Sunny.
    // Fail closed on a null owner -- flag and skip, never surface it on anyone's primary surface.
    const ownerId = win.latest.user_id
    if (!ownerId) { console.warn(`[follow-up-scan] unowned thread ${win.threadId} (${win.contact}) -- skipping card (fail-closed)`); skipped++; continue }

    // RESOLUTION GATE (calendar): before surfacing anything, consult the owner's calendar. If a meeting
    // is already booked with this contact, the thread is resolved -- suppress the card and retire any
    // stale pending one. Catches the case Gmail thread-splitting hides (the invite can live in a separate
    // thread, but the meeting is on the calendar regardless). Runs for every user via their own token.
    const ownerEmail = emailByUser[ownerId] || null
    const booked = ownerEmail ? await meetingBookedWith(ownerEmail, win.contact) : null
    if (booked) {
      if (!dryRun) await sbFetch(`kiko_draft_actions?action_type=eq.follow_up&status=eq.pending&payload->>thread_id=eq.${encodeURIComponent(win.threadId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'superseded' }) })
      console.log(`[follow-up-scan] resolved-by-calendar: ${win.contact} has meeting "${booked.summary}" @ ${booked.start} -- suppressing card`)
      resolvedByCalendar++; continue
    }

    // CROSS-THREAD RECONCILIATION (Gmail): the per-thread verdict is a first guess. The true ball-position
    // is the latest message exchanged with this contact across ALL threads (and mail sent outside the
    // platform). If it contradicts the card, trust the full interaction record and suppress.
    const lastMail = ownerEmail ? await latestMailWith(ownerEmail, win.contact) : null
    if (lastMail && lastMail.direction === 'outbound' && win.intent === 'awaiting_us') {
      // Card says the ball is with us, but our message is the most recent: we already replied, possibly in
      // a separate thread. Suppress, and retire any stale pending card on this thread.
      if (!dryRun) await sbFetch(`kiko_draft_actions?action_type=eq.follow_up&status=eq.pending&payload->>thread_id=eq.${encodeURIComponent(win.threadId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'superseded' }) })
      console.log(`[follow-up-scan] reconciled-cross-thread: ${win.contact} -- our reply is latest (${lastMail.at}); ball is not with us -- suppressing respond card`)
      reconciled++; continue
    }
    if (lastMail && lastMail.direction === 'inbound' && win.intent === 'awaiting_them') {
      // Card is chasing them, but their message is the most recent: they already replied, possibly in a
      // separate thread, so chasing is wrong. Suppress the chase; an owed response surfaces fresh next cycle.
      if (!dryRun) await sbFetch(`kiko_draft_actions?action_type=eq.follow_up&status=eq.pending&payload->>thread_id=eq.${encodeURIComponent(win.threadId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'superseded' }) })
      console.log(`[follow-up-scan] reconciled-cross-thread: ${win.contact} -- their reply is latest (${lastMail.at}); do not chase -- suppressing follow-up card`)
      reconciled++; continue
    }
    const samples = replyLatencySamples(win.cRows, now)
    const repliedCount = win.cRows.filter(isGenuineReply).length
    const rel = relMap[win.contact] || null
    const dispName = rel?.contact_name || displayName(win.name, win.contact)
    const dispCompany = rel?.company || win.company || companyFromEmail(win.contact)
    const ctx = {
      now, contact: { id: win.contactId, name: dispName, company: dispCompany },
      currentThread: { sent_at: win.latest.sent_at, gmail_thread_id: win.threadId, recipient_name: dispName },
      exchangeCount: win.cRows.length, recentReplyStreak: Math.min(repliedCount, 3),
      lastReplyAgo: `${Math.round(win.daysSinceReply)}d ago`,
      lastInbound: win.lastReplySnippet ? { snippet: win.lastReplySnippet.slice(0, 200), at: win.lastInboundReplyAt.toISOString() } : null,
      clicked: win.clicked, scenario: win.intent === 'awaiting_us' ? 'respond' : 'follow_up', subject: win.latest.subject, name: dispName, company: dispCompany,
      relationship: samples.length >= 3 ? `${win.cRows.length} emails exchanged; they replied ${Math.round(win.daysSinceReply)}d ago` : `${repliedCount} repl${repliedCount === 1 ? 'y' : 'ies'} on record; last ${Math.round(win.daysSinceReply)}d ago`,
    }
    const payload = buildCardPayload(win.cad, ctx)
    payload.scenario = ctx.scenario
    // Clean fields for the compact Tasks-Due one-liner (Kiko's title doctrine). Full draft opens on tap.
    payload.contact_name = dispName || null
    payload.company = dispCompany || null
    payload.days_since_reply = Math.round(win.daysSinceReply)
    payload.posture = ctx.scenario === 'respond' ? 'respond' : 'chase'
    if (ctx.scenario === 'respond') {
      // Ball is with us: frame the cost as our silence, and admit the delay once it has run long (Kiko's copy note).
      const d = Math.round(win.daysSinceReply)
      payload.cost_line = `They replied ${d}d ago and are waiting on us.${d >= 10 ? ' We have gone quiet, so acknowledge the delay.' : ''}`
      payload.why = `Ball is with us. They last wrote ${d}d ago and expect a reply.`
    }

    if (dryRun) { cards.push({ to: win.name, company: win.company, scenario: ctx.scenario, interval: win.cad.interval_days, temp: win.cad.temperature, conf: win.cad.confidence, repliedAgo: Math.round(win.daysSinceReply), cost: payload.cost_line }); continue }

    // idempotency: one card per thread. If Sunny already actioned a card here, leave it; refresh a pending one; else create.
    const prior = await sbFetch(`kiko_draft_actions?action_type=eq.follow_up&payload->>thread_id=eq.${encodeURIComponent(win.threadId)}&select=id,status,payload&order=created_at.desc&limit=1`)
    const priorRow = Array.isArray(prior) ? prior[0] : null
    if (priorRow && priorRow.status !== 'pending') { skipped++; continue }
    // Freeze the draft: write it once, then reuse the reviewed wording. Metadata (days, cost_line) still
    // refreshes each run, but the email text never silently rewrites itself between scans.
    const existingDraft = priorRow?.payload?.draft
    if (existingDraft) payload.draft = existingDraft
    else if (drafts < MAX_DRAFTS_PER_RUN) { payload.draft = await generateDraft(ctx); drafts++ }
    if (priorRow) await sbFetch(`kiko_draft_actions?id=eq.${priorRow.id}`, { method: 'PATCH', body: JSON.stringify({ payload, user_id: ownerId, created_at: now.toISOString() }) })
    else await sbFetch('kiko_draft_actions', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), action_type: 'follow_up', payload, status: 'pending', user_id: ownerId, created_at: now.toISOString() }) })
    cards.push({ to: win.name, scenario: ctx.scenario, interval: win.cad.interval_days, temp: win.cad.temperature })
  }

  console.log(`[follow-up-scan] done. threads=${Object.keys(byThread).length} contacts=${Object.keys(byContactCand).length} cards=${cards.length} reengage=${reengage} resolvedByCalendar=${resolvedByCalendar} reconciled=${reconciled} skipped=${skipped}${dryRun ? ' (DRY RUN, nothing written)' : ''}`)
  return { dryRun, candidates: Object.keys(byThread).length, cards, reengage, resolvedByCalendar, reconciled, skipped }
}
