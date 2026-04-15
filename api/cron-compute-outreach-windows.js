// api/cron-compute-outreach-windows.js
// Nightly cron: compute optimum outreach windows from historical reply patterns.
// Powers Calendar's "Optimum outreach windows" sidebar + per-prospect best-time hints.
//
// Logic:
//  1. For each user, pull their reply activities (type='reply') from past 90 days
//  2. Cluster replies by contact_id × day-of-week × hour-of-day
//  3. Compute per-contact best window (highest-frequency dow/hour combo) → optimum_outreach_windows
//  4. Aggregate top 4 batch-send windows for the user × race-context boost (14-21d before F1 race) → outreach_window_suggestions
//
// STANDALONE — if this fails, Calendar still renders with hardcoded fallback.

import { sbFetch, cronHeartbeat } from './kiko-tools.js'

export const config = { maxDuration: 60 }

// F1 2026 calendar (mirror of CommercialCalendar.jsx for race-context boost)
const F1_2026 = [
  { round: 4,  name: 'Miami GP',         date: '2026-05-01' },
  { round: 5,  name: 'Canadian GP',      date: '2026-05-22' },
  { round: 6,  name: 'Monaco GP',        date: '2026-06-05' },
  { round: 7,  name: 'Barcelona GP',     date: '2026-06-12' },
  { round: 8,  name: 'Austrian GP',      date: '2026-06-26' },
  { round: 9,  name: 'British GP',       date: '2026-07-03' },
  { round: 10, name: 'Belgian GP',       date: '2026-07-17' },
  { round: 11, name: 'Hungarian GP',     date: '2026-07-24' },
  { round: 12, name: 'Dutch GP',         date: '2026-08-21' },
]

function daysUntil(targetDate, fromDate) {
  return Math.round((new Date(targetDate) - new Date(fromDate)) / 86400000)
}

function nextRaceInPeakWindow(today) {
  return F1_2026.find(r => {
    const d = daysUntil(r.date, today)
    return d >= 14 && d <= 21
  })
}


export default async function handler(req, res) {
  const __hbStart = Date.now()
  const __hbId = await cronHeartbeat('cron-compute-outreach-windows', 'started')
  try {
    // Get all users with at least one reply activity
    const users = await sbFetch('user_config?select=user_id&order=created_at.desc')
    const userIds = (Array.isArray(users) ? users : []).map(u => u.user_id).filter(Boolean)

    if (!userIds.length) {
      await cronHeartbeat('cron-compute-outreach-windows', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 })
      return res.status(200).json({ ok: true, message: 'No users to process', processed: 0 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()
    const peakRace = nextRaceInPeakWindow(today)

    let totalContactsProcessed = 0
    let totalWindowsWritten = 0

    for (const userId of userIds) {
      // Pull all reply activities for this user in last 90 days
      const replies = await sbFetch(`activities?select=contact_id,created_at&user_id=eq.${userId}&type=eq.reply&created_at=gte.${ninetyDaysAgo}&limit=2000`)
      const safeReplies = Array.isArray(replies) ? replies : []
      if (!safeReplies.length) continue

      // Group by contact: { contact_id: [{ dow, hour }] }
      const byContact = {}
      for (const r of safeReplies) {
        if (!r.contact_id) continue
        const d = new Date(r.created_at)
        const dow = (d.getUTCDay() + 6) % 7  // 0 = Mon, 6 = Sun
        const hour = d.getUTCHours()
        if (!byContact[r.contact_id]) byContact[r.contact_id] = []
        byContact[r.contact_id].push({ dow, hour })
      }

      // For each contact, find best (dow, hour) cluster
      for (const [contactId, replyTimes] of Object.entries(byContact)) {
        const counts = {}
        for (const { dow, hour } of replyTimes) {
          const key = `${dow}-${hour}`
          counts[key] = (counts[key] || 0) + 1
        }
        const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
        if (!best) continue
        const [bestDow, bestHour] = best[0].split('-').map(Number)
        const confidence = Math.min(1, replyTimes.length / 5)  // 5+ replies = full confidence
        const reasoning = `Last ${replyTimes.length} replies clustered around DOW ${bestDow} hour ${bestHour}`

        await sbFetch(`optimum_outreach_windows?on_conflict=contact_id,user_id`, {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            contact_id: contactId,
            user_id: userId,
            best_dow: bestDow,
            best_hour: bestHour,
            best_timezone: 'Europe/London',
            confidence,
            reasoning,
            reply_count: replyTimes.length,
            computed_at: new Date().toISOString(),
          }),
        })
        totalContactsProcessed++
      }


      // Aggregate top 4 batch-send windows for this user
      // Cluster by (dow, hour) across all contacts → batch suggestions
      const allWindows = await sbFetch(`optimum_outreach_windows?select=contact_id,best_dow,best_hour&user_id=eq.${userId}`)
      const safeWindows = Array.isArray(allWindows) ? allWindows : []
      const batches = {}
      for (const w of safeWindows) {
        const key = `${w.best_dow}-${w.best_hour}`
        if (!batches[key]) batches[key] = { dow: w.best_dow, hour: w.best_hour, contacts: [] }
        batches[key].contacts.push(w.contact_id)
      }

      // Sort by contact count, take top 4
      const topBatches = Object.values(batches)
        .sort((a, b) => b.contacts.length - a.contacts.length)
        .slice(0, 4)

      // Wipe previous suggestions for this user, write fresh
      await sbFetch(`outreach_window_suggestions?user_id=eq.${userId}`, { method: 'DELETE' })

      const dowNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      for (let rank = 0; rank < topBatches.length; rank++) {
        const b = topBatches[rank]
        // Compute next occurrence of this (dow, hour)
        const now = new Date()
        const currentDow = (now.getUTCDay() + 6) % 7
        let daysAhead = (b.dow - currentDow + 7) % 7
        if (daysAhead === 0 && now.getUTCHours() >= b.hour) daysAhead = 7
        const windowStart = new Date(now)
        windowStart.setUTCDate(now.getUTCDate() + daysAhead)
        windowStart.setUTCHours(b.hour, 0, 0, 0)
        const windowEnd = new Date(windowStart)
        windowEnd.setUTCHours(b.hour + 2)

        // Race-context boost: if peak race coming up, mention it
        const raceContext = peakRace
          ? `Pre-${peakRace.name} · ${daysUntil(peakRace.date, today)}d out · peak window`
          : `${dowNames[b.dow]} ${b.hour}:00 — ${b.hour + 2}:00 UK`

        // Predicted reply rate: scale with batch size (more contacts in same window = stronger signal)
        const predictedReplyRate = Math.min(0.85, 0.40 + (b.contacts.length * 0.05))

        await sbFetch('outreach_window_suggestions', {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId,
            window_start: windowStart.toISOString(),
            window_end: windowEnd.toISOString(),
            prospect_count: b.contacts.length,
            predicted_reply_rate: predictedReplyRate,
            reasoning: `${b.contacts.length} prospects historically reply on ${dowNames[b.dow]} ${b.hour}:00 UK`,
            race_context: raceContext,
            rank: rank + 1,
            contact_ids: b.contacts,
            computed_at: new Date().toISOString(),
          }),
        })
        totalWindowsWritten++
      }
    }

    await cronHeartbeat('cron-compute-outreach-windows', 'finished', {
      heartbeatId: __hbId,
      durationMs: Date.now() - __hbStart,
      recordsProcessed: totalContactsProcessed,
    })

    return res.status(200).json({
      ok: true,
      users_processed: userIds.length,
      contacts_with_windows: totalContactsProcessed,
      batch_suggestions_written: totalWindowsWritten,
      duration_ms: Date.now() - __hbStart,
    })
  } catch (err) {
    console.error('[cron-compute-outreach-windows] error:', err)
    await cronHeartbeat('cron-compute-outreach-windows', 'failed', {
      heartbeatId: __hbId,
      durationMs: Date.now() - __hbStart,
      errorMessage: err.message,
    })
    return res.status(500).json({ ok: false, error: err.message })
  }
}
