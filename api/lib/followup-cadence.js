// api/lib/followup-cadence.js
// Adaptive follow-up cadence engine (v1). Designed with Kiko.
// Principle: cadence is a read on the person and the moment, never a timer.
// Locked spec (Kiko): recency-weighted MEDIAN latency, baseline only at n>=3; four
// temperature states with opens EXCLUDED (Apple MPP false opens) and clicks kept;
// GOING COLD x1.5 with a hard 2-follow-up cap to parked; seniority floor SUPREME over
// the temperature floor; premise reconciliation upstream; hard approval gate (never sends).

const DAY_MS = 86400000
const daysBetween = (a, b) => (new Date(b) - new Date(a)) / DAY_MS

const LATENCY_MIN = 2, LATENCY_MAX = 14, BASELINE_MIN_N = 3, MAX_UNANSWERED_FOLLOWUPS = 2

// Recency-weighted median. values + ages (days, older = less weight). Half-life in days.
function recencyWeightedMedian(values, ages, halfLifeDays = 90) {
  if (!values || !values.length) return null
  const lambda = Math.LN2 / halfLifeDays
  const items = values.map((v, i) => ({ v, w: Math.exp(-lambda * Math.max(0, ages[i] || 0)) }))
                      .sort((a, b) => a.v - b.v)
  const total = items.reduce((s, it) => s + it.w, 0)
  if (total <= 0) return items[Math.floor(items.length / 2)].v
  let cum = 0
  for (const it of items) { cum += it.w; if (cum >= total / 2) return it.v }
  return items[items.length - 1].v
}

// Reply-latency samples (days) + sample age (days), from tracking rows that were replied to.
function replyLatencySamples(rows, now = new Date()) {
  const out = []
  for (const r of (rows || [])) {
    if (r.sent_at && r.replied_at && !r.bounced_at) {
      const lat = daysBetween(r.sent_at, r.replied_at)
      if (lat >= 0 && lat <= 120) out.push({ latency: lat, ageDays: daysBetween(r.replied_at, now) })
    }
  }
  return out
}

const SENIORITY = [
  { rx: /\b(ceo|cfo|coo|cto|cmo|cro|chief|founder|co-?founder|owner|president|managing director|chair(man|woman|person)?|board)\b/i, tier: 'c_suite', floor: 7 },
  { rx: /\b(vp|vice president|svp|evp|director|head of|general manager)\b/i, tier: 'senior', floor: 4 },
]
function classifySeniority(title) {
  const t = (title || '').toString()
  for (const s of SENIORITY) if (s.rx.test(t)) return { tier: s.tier, floor: s.floor }
  return { tier: 'standard', floor: 2 }
}

// States: GOING_COLD x1.5 (replied before, our last sends unanswered) -> checked first;
// HOT x0.7 (last inbound was their reply AND they asked); WARM x1.0; COOLING x1.3 (CLICK, no reply).
// Opens are never a signal.
function classifyTemperature({ everReplied, lastInboundIsReply, askedQuestion, clickedNoReply, unansweredFollowups }) {
  if (everReplied && unansweredFollowups >= 1) return { state: 'going_cold', mult: 1.5 }
  if (lastInboundIsReply && askedQuestion) return { state: 'hot', mult: 0.7 }
  if (lastInboundIsReply) return { state: 'warm', mult: 1.0 }
  if (clickedNoReply) return { state: 'cooling', mult: 1.3 }
  return { state: 'warm', mult: 1.0 }
}

function defaultPrior(seniorityTier, sectorSpeed) {
  if (seniorityTier === 'c_suite' || sectorSpeed === 'slow') return 7
  if (seniorityTier === 'standard' && sectorSpeed === 'fast') return 4
  return 5
}

function computeCadence(input) {
  const now = input.now ? new Date(input.now) : new Date()
  const rows = input.rows || []
  const cur = input.currentThread || {}
  const contact = input.contact || {}
  const sen = classifySeniority(contact.title)

  // ---- GATE ----
  if (cur.bounced_at) return { gate_passed: false, park: false, reason: 'bounced' }
  const everReplied = rows.some(r => r.replied_at && !r.bounced_at) || !!cur.ever_replied
  const sanctionedCampaign = !!cur.enrollment_active
  if (!everReplied && !sanctionedCampaign)
    return { gate_passed: false, park: true, park_reason: 'cold_no_reply', reason: 'No two-way touch on record. Parked, not chased.' }

  const unanswered = cur.unanswered_followups || 0
  if (everReplied && unanswered >= MAX_UNANSWERED_FOLLOWUPS)
    return { gate_passed: false, park: true, park_reason: 're_engage_later', reason: `${unanswered} follow-ups unanswered. Parked to re-engage later, not nagged.` }

  // ---- latency baseline (recency-weighted median; n>=3 to be a baseline) ----
  const samples = replyLatencySamples(rows, now)
  const n = samples.length
  let baseDays, latencyConfidence, baselineDays = null
  if (n >= 1) {
    baselineDays = recencyWeightedMedian(samples.map(s => s.latency), samples.map(s => s.ageDays))
    if (n >= BASELINE_MIN_N) { baseDays = baselineDays; latencyConfidence = 'high' }
    else { baseDays = (baselineDays + defaultPrior(sen.tier, contact.sector_speed)) / 2; latencyConfidence = 'low' }
  } else { baseDays = defaultPrior(sen.tier, contact.sector_speed); latencyConfidence = 'prior' }

  // ---- temperature (opens excluded) ----
  const temp = classifyTemperature({
    everReplied,
    lastInboundIsReply: !!cur.last_inbound_is_reply,
    askedQuestion: !!cur.asked_question,
    clickedNoReply: !!cur.clicked && !cur.replied_at,
    unansweredFollowups: unanswered,
  })

  // ---- compose, clamp, then seniority floor SUPREME ----
  let interval = baseDays * temp.mult
  interval = Math.max(LATENCY_MIN, Math.min(LATENCY_MAX, interval))
  interval = Math.max(interval, sen.floor) // hard floor wins even if HOT tightened below it
  interval = Math.round(interval)

  const anchor = cur.sent_at ? new Date(cur.sent_at) : now
  const recommended = new Date(anchor.getTime() + interval * DAY_MS)
  const confidence = n >= BASELINE_MIN_N ? 'high' : (n >= 1 ? 'medium' : 'low')

  return {
    gate_passed: true, park: false,
    interval_days: interval,
    recommended_date: recommended.toISOString(),
    temperature: temp.state, temperature_mult: temp.mult,
    latency: { baseline_days: baselineDays != null ? Math.round(baselineDays * 10) / 10 : null, n, confidence: latencyConfidence },
    seniority: sen,
    unanswered_followups: unanswered,
    confidence,
  }
}

// Build the kiko_draft_actions payload. ctx carries pre-computed plain-words context.
function buildCardPayload(c, ctx = {}) {
  const now = ctx.now ? new Date(ctx.now) : new Date()
  const cur = ctx.currentThread || {}
  const daysSinceSend = cur.sent_at ? Math.round(daysBetween(cur.sent_at, now)) : null

  let cost
  if (c.latency && c.latency.baseline_days != null && daysSinceSend != null) {
    const closed = Math.round(daysSinceSend - c.latency.baseline_days)
    cost = `No touch in ${daysSinceSend}d. Typical reply window ${closed > 0 ? `closed ${closed}d ago` : `closes in ${-closed}d`}.`
  } else if (daysSinceSend != null) cost = `No touch in ${daysSinceSend}d. No reply-time history to bracket it.`
  else cost = 'No recent touch on record.'

  let relationship
  if (c.latency && c.latency.n >= 3) relationship = `${ctx.exchangeCount ?? 'Several'} emails exchanged; replied to your last ${ctx.recentReplyStreak ?? 'few'}.`
  else if (c.latency && c.latency.n >= 1) relationship = `${c.latency.n} reply on record${ctx.lastReplyAgo ? `, last ${ctx.lastReplyAgo}` : ''}.`
  else relationship = 'No reply on record yet (campaign-sanctioned first touch).'

  return {
    entity: `${ctx.contact?.name || cur.recipient_name || 'Contact'}${ctx.contact?.company ? ' / ' + ctx.contact.company : ''}`,
    contact_id: ctx.contact?.id || null,
    thread_id: cur.gmail_thread_id || null,
    recommended_date: c.recommended_date,
    interval_days: c.interval_days,
    cost_line: cost,
    why: `${(c.temperature || '').replace('_', ' ')} thread; ${c.latency && c.latency.baseline_days != null ? `replies in ~${c.latency.baseline_days}d (n=${c.latency.n})` : 'no latency history'}; ${c.seniority?.tier} floor ${c.seniority?.floor}d.`,
    relationship,
    reply_latency_baseline: c.latency && c.latency.baseline_days != null ? `Typical reply ~${c.latency.baseline_days}d (${c.latency.n} thread${c.latency.n === 1 ? '' : 's'})` : 'No reply-time history',
    thread_temperature: c.temperature,
    last_inbound: ctx.lastInbound || null,
    external_anchor: null,
    confidence: c.confidence,
    draft: ctx.draft || null,
    actions: ['approve', 'park', 'dismiss'],
    override_allowed: true,
    provenance: { trigger: 'adaptive_followup_scan', signals_used: ['reply_latency', 'thread_temperature', 'seniority', ctx.clicked ? 'clicks' : null].filter(Boolean), reconciled_at: now.toISOString() },
  }
}

export { computeCadence, buildCardPayload, recencyWeightedMedian, classifySeniority, classifyTemperature, defaultPrior, replyLatencySamples }
