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
import { computeCadence, buildCardPayload, replyLatencySamples } from '../api/lib/followup-cadence.js'

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

// OOO / auto-reply / left-company patterns. These are not engagement; they must not pass the gate.
const NOT_GENUINE = /out of office|automatic reply|auto-?reply|away from (the |my )?(office|desk)|on (leave|vacation|holiday|annual leave|maternity|paternity|parental)|currently (away|out of)|will be back|back in the office|no longer (with|at)|has left|i am out|i'm out|return(ing)? (on|to)/i
const isGenuineReply = (r) => !!r.replied_at && !r.bounced_at && !NOT_GENUINE.test(r.reply_snippet || '')

async function classifyIntent(replyText) {
  const t = (replyText || '').trim()
  if (!t) return 'awaiting_them'
  if (hasQuestion(t)) return 'awaiting_us'
  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 8,
      system: 'Classify the sender\'s last email. Reply EXACTLY one token: awaiting_us (they asked or requested something from us), awaiting_them (ball is with them), or closing (they signalled a stop, decline, or not now). No other text.',
      messages: [{ role: 'user', content: t.slice(0, 600) }],
    })
    const out = (r.content?.[0]?.text || '').trim().toLowerCase()
    return ['awaiting_us', 'awaiting_them', 'closing'].includes(out) ? out : 'awaiting_them'
  } catch { return 'awaiting_them' }
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

export async function runFollowUpMonitor(opts = {}) {
  const dryRun = !!opts.dryRun
  const now = new Date()
  const since = new Date(now - LOOKBACK_DAYS * DAY).toISOString()
  console.log(`[follow-up-scan] start ${dryRun ? '(DRY RUN)' : ''} ${now.toISOString()}`)

  const rows = await sbFetch(`kiko_email_tracking?sent_at=gt.${since}&select=id,recipient_email,recipient_name,company,subject,gmail_thread_id,sent_at,replied_at,reply_snippet,clicked_at,bounced_at,follow_up_dismissed,contact_id,enrollment_id&order=sent_at.asc`)
  if (!Array.isArray(rows) || !rows.length) { console.log('[follow-up-scan] no tracking rows'); return { dryRun, candidates: 0, cards: [], reengage: 0, skipped: 0 } }

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

    const intent = await classifyIntent(lastReplySnippet)
    if (intent === 'closing') { skipped++; continue } // they signalled stop

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

  const cards = []; let reengage = 0, drafts = 0
  for (const win of Object.values(byContactCand)) {
    if (win.verdict === 'park') {
      await parkReengagement(win, now, dryRun); reengage++
      continue
    }
    const samples = replyLatencySamples(win.cRows, now)
    const repliedCount = win.cRows.filter(isGenuineReply).length
    const ctx = {
      now, contact: { id: win.contactId, name: win.name, company: win.company },
      currentThread: { sent_at: win.latest.sent_at, gmail_thread_id: win.threadId, recipient_name: win.name },
      exchangeCount: win.cRows.length, recentReplyStreak: Math.min(repliedCount, 3),
      lastReplyAgo: `${Math.round(win.daysSinceReply)}d ago`,
      lastInbound: win.lastReplySnippet ? { snippet: win.lastReplySnippet.slice(0, 200), at: win.lastInboundReplyAt.toISOString() } : null,
      clicked: win.clicked, scenario: win.intent === 'awaiting_us' ? 'respond' : 'follow_up', subject: win.latest.subject, name: win.name, company: win.company,
      relationship: samples.length >= 3 ? `${win.cRows.length} emails exchanged; they replied ${Math.round(win.daysSinceReply)}d ago` : `${repliedCount} repl${repliedCount === 1 ? 'y' : 'ies'} on record; last ${Math.round(win.daysSinceReply)}d ago`,
    }
    const payload = buildCardPayload(win.cad, ctx)
    payload.scenario = ctx.scenario
    if (ctx.scenario === 'respond') {
      // Ball is with us: frame the cost as our silence, and admit the delay once it has run long (Kiko's copy note).
      const d = Math.round(win.daysSinceReply)
      payload.cost_line = `They replied ${d}d ago and are waiting on us.${d >= 10 ? ' We have gone quiet, so acknowledge the delay.' : ''}`
      payload.why = `Ball is with us. They last wrote ${d}d ago and expect a reply.`
    }

    if (dryRun) { cards.push({ to: win.name, company: win.company, scenario: ctx.scenario, interval: win.cad.interval_days, temp: win.cad.temperature, conf: win.cad.confidence, repliedAgo: Math.round(win.daysSinceReply), cost: payload.cost_line }); continue }

    // idempotency: one card per thread. If Sunny already actioned a card here, leave it; refresh a pending one; else create.
    const prior = await sbFetch(`kiko_draft_actions?action_type=eq.follow_up&payload->>thread_id=eq.${encodeURIComponent(win.threadId)}&select=id,status&order=created_at.desc&limit=1`)
    const priorRow = Array.isArray(prior) ? prior[0] : null
    if (priorRow && priorRow.status !== 'pending') { skipped++; continue }
    if (drafts < MAX_DRAFTS_PER_RUN) { payload.draft = await generateDraft(ctx); drafts++ }
    if (priorRow) await sbFetch(`kiko_draft_actions?id=eq.${priorRow.id}`, { method: 'PATCH', body: JSON.stringify({ payload, created_at: now.toISOString() }) })
    else await sbFetch('kiko_draft_actions', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), action_type: 'follow_up', payload, status: 'pending', user_id: SUNNY, created_at: now.toISOString() }) })
    cards.push({ to: win.name, scenario: ctx.scenario, interval: win.cad.interval_days, temp: win.cad.temperature })
  }

  console.log(`[follow-up-scan] done. threads=${Object.keys(byThread).length} contacts=${Object.keys(byContactCand).length} cards=${cards.length} reengage=${reengage} skipped=${skipped}${dryRun ? ' (DRY RUN, nothing written)' : ''}`)
  return { dryRun, candidates: Object.keys(byThread).length, cards, reengage, skipped }
}
