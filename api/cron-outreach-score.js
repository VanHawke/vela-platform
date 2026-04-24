// api/cron-outreach-score.js — Daily outreach scoring engine (multi-user)
import { cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken as getToken } from './cron-utils.js';

const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5'

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-outreach-score', 'started');
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()

  const SB = process.env.VITE_SUPABASE_URL
  const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SB || !SK) return res.status(500).json({ error: 'Not configured' })
  const h = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' }

  try {
    // Multi-user loop
    const users = await getActiveUsers();
    const allResults = [];
    for (const __user of users) {
    const __userId = __user.user_id;
    try {
    // Step 1: Get Google token for Gmail API
    const token = await getToken(__user.email)

    // Step 2: Find sent emails from last 7 days not yet scored
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const gmailQ = `from:me after:${sevenDaysAgo} -in:draft`
    const searchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQ)}&maxResults=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const searchData = await searchRes.json()
    const messageIds = (searchData.messages || []).map(m => m.id)
    if (!messageIds.length) { allResults.push({ user: __user.email, scored: 0 }); continue; }

    // Step 3: Check which are already scored
    const existingRes = await fetch(`${SB}/rest/v1/outreach_scores?select=email_gmail_id&org_id=eq.${ORG_ID}`, { headers: h })
    const existing = await existingRes.json()
    const scoredIds = new Set((existing || []).map(e => e.email_gmail_id))

    const newIds = messageIds.filter(id => !scoredIds.has(id))
    if (!newIds.length) { allResults.push({ user: __user.email, scored: 0 }); continue; }

    // Step 4: Fetch full email details for unscored messages
    const emails = []
    for (const id of newIds.slice(0, 30)) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const msg = await msgRes.json()
      const headers = msg.payload?.headers || []
      const getH = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''

      // Extract body text
      let bodyText = ''
      const parts = msg.payload?.parts || [msg.payload]
      for (const part of parts) {
        if (part?.mimeType === 'text/plain' && part.body?.data) {
          bodyText = Buffer.from(part.body.data, 'base64url').toString('utf-8')
          break
        }
      }
      if (!bodyText && msg.payload?.body?.data) {
        bodyText = Buffer.from(msg.payload.body.data, 'base64url').toString('utf-8')
      }

      emails.push({
        gmail_id: id,
        thread_id: msg.threadId,
        to: getH('To'),
        subject: getH('Subject'),
        date: getH('Date'),
        body: bodyText.slice(0, 2000),
      })
    }

    // Step 5: Check threads for replies (messages in thread NOT from us)
    const threadReplies = {}
    const threadIds = [...new Set(emails.map(e => e.thread_id))]
    for (const tid of threadIds) {
      const tRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${tid}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const thread = await tRes.json()
      const msgs = thread.messages || []
      const replies = msgs.filter(m => {
        const from = (m.payload?.headers || []).find(h => h.name === 'From')?.value || ''
        return !from.includes('vanhawke') && !from.includes('sunny')
      })
      if (replies.length > 0) {
        const replyDate = replies[0].payload?.headers?.find(h => h.name === 'Date')?.value
        threadReplies[tid] = { replied: true, replyDate, replyCount: replies.length, ccAdded: msgs.some(m => {
          const cc = (m.payload?.headers || []).find(h => h.name === 'Cc')?.value
          return cc && !cc.includes('vanhawke')
        })}
      }
    }

    // Step 6: Batch classify with Claude
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })

    const emailBatch = emails.map(e => ({
      gmail_id: e.gmail_id,
      subject: e.subject,
      to: e.to,
      body_preview: e.body.slice(0, 800),
      has_reply: !!threadReplies[e.thread_id],
    }))

    const classifyRes = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 4000,
      messages: [{ role: 'user', content: `Classify these outbound sales/sponsorship emails. For each, return JSON array with objects matching this schema:
{
  "gmail_id": "string",
  "messaging_approach": "authority-led|data-led|scarcity-led|relationship-led|intelligence-led|competitive-led|value-led",
  "opening_hook": "what the first sentence does — e.g. 'competitive reference', 'data point', 'mutual connection', 'direct ask', 'news hook'",
  "cta_type": "meeting-ask|reply-ask|info-share|soft-close|no-cta",
  "persona_seniority": "C-suite|VP|Director|Manager|Unknown",
  "sequence_touch": 1-5 estimate based on subject/content (1=cold first touch, 2+=follow-ups),
  "effectiveness_score": 0-100 based on: subject clarity, opening strength, value prop specificity, CTA directness, brevity
}

Return ONLY valid JSON array, no markdown.

Emails:
${JSON.stringify(emailBatch, null, 1)}` }]
    })

    let classifications = []
    try {
      const raw = classifyRes.content[0]?.text || '[]'
      classifications = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```/g, '').trim())
    } catch { classifications = [] }

    // Step 7: Match with deals and write scores
    let scored = 0
    for (const email of emails) {
      const cls = classifications.find(c => c.gmail_id === email.gmail_id) || {}
      const reply = threadReplies[email.thread_id]
      const sentDate = new Date(email.date)
      const subjectWords = (email.subject || '').split(/\s+/).length
      const bodyWords = (email.body || '').split(/\s+/).length

      // Try to match to a deal by recipient email or company name
      const recipientDomain = (email.to || '').match(/@([^,>\s]+)/)?.[1]?.replace('www.', '') || ''
      const recipientName = (email.to || '').match(/^([^<]+)/)?.[1]?.trim() || ''

      // Extract company from email domain (rough heuristic)
      const companyGuess = recipientDomain?.split('.')[0] || ''

      const outcome = reply?.replied ? 'replied' : 
        (Date.now() - sentDate.getTime() > 72 * 3600000) ? 'silence' : 'pending'

      const score = {
        org_id: ORG_ID,
        email_gmail_id: email.gmail_id,
        thread_id: email.thread_id,
        contact_email: email.to?.match(/[^<\s,]+@[^>\s,]+/)?.[0] || email.to,
        contact_name: recipientName,
        company: companyGuess,
        subject_line: email.subject,
        subject_word_count: subjectWords,
        body_word_count: bodyWords,
        sequence_touch: cls.sequence_touch || 1,
        messaging_approach: cls.messaging_approach || 'unknown',
        opening_hook: cls.opening_hook || null,
        cta_type: cls.cta_type || null,
        persona_title: null,
        persona_seniority: cls.persona_seniority || 'Unknown',
        sent_at: sentDate.toISOString(),
        sent_day_of_week: sentDate.toLocaleDateString('en-US', { weekday: 'long' }),
        sent_hour: sentDate.getUTCHours(),
        outcome,
        reply_received_at: reply?.replyDate ? new Date(reply.replyDate).toISOString() : null,
        time_to_reply_hours: reply?.replied && reply?.replyDate ? 
          Math.round((new Date(reply.replyDate) - sentDate) / 3600000 * 10) / 10 : null,
        reply_cc_added: reply?.ccAdded || false,
        effectiveness_score: cls.effectiveness_score || null,
        scored_at: new Date().toISOString(),
      }

      await fetch(`${SB}/rest/v1/outreach_scores`, {
        method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify(score),
      })
      scored++
    }

    // Step 8: Update pending scores that now have replies (check older entries)
    const pendingRes = await fetch(
      `${SB}/rest/v1/outreach_scores?outcome=eq.pending&sent_at=lt.${new Date(Date.now() - 72 * 3600000).toISOString()}&select=id,thread_id,sent_at`,
      { headers: h }
    )
    const pending = await pendingRes.json()
    let updated = 0
    for (const p of (pending || [])) {
      if (threadReplies[p.thread_id]?.replied) {
        const reply = threadReplies[p.thread_id]
        await fetch(`${SB}/rest/v1/outreach_scores?id=eq.${p.id}`, {
          method: 'PATCH', headers: h,
          body: JSON.stringify({
            outcome: 'replied',
            reply_received_at: reply.replyDate ? new Date(reply.replyDate).toISOString() : null,
            reply_cc_added: reply.ccAdded || false,
            scored_at: new Date().toISOString(),
          }),
        })
        updated++
      } else {
        await fetch(`${SB}/rest/v1/outreach_scores?id=eq.${p.id}`, {
          method: 'PATCH', headers: h,
          body: JSON.stringify({ outcome: 'silence', scored_at: new Date().toISOString() }),
        })
        updated++
      }
    }

    // ── Pattern Learning: analyse what works ──
    try {
      const allScores = await fetch(`${SB}/rest/v1/outreach_scores?select=subject,approach_category,outcome,word_count&scored_at=not.is.null&limit=50&order=scored_at.desc`, { headers: h });
      const scored_emails = await allScores.json();
      if (scored_emails?.length >= 10) {
        const replied = scored_emails.filter(e => e.outcome === 'replied');
        const silence = scored_emails.filter(e => e.outcome === 'silence');
        const replyRate = (replied.length / scored_emails.length * 100).toFixed(0);
        // Analyse patterns
        const avgWordReplied = replied.length ? Math.round(replied.reduce((s, e) => s + (e.word_count || 0), 0) / replied.length) : 0;
        const avgWordSilence = silence.length ? Math.round(silence.reduce((s, e) => s + (e.word_count || 0), 0) / silence.length) : 0;
        const approachStats = {};
        for (const e of scored_emails) {
          const a = e.approach_category || 'unknown';
          if (!approachStats[a]) approachStats[a] = { total: 0, replied: 0 };
          approachStats[a].total++;
          if (e.outcome === 'replied') approachStats[a].replied++;
        }
        let insight = `Outreach patterns (${scored_emails.length} emails): ${replyRate}% reply rate. `;
        insight += `Avg words in replied: ${avgWordReplied}, in silence: ${avgWordSilence}. `;
        for (const [approach, stats] of Object.entries(approachStats)) {
          insight += `${approach}: ${stats.replied}/${stats.total} replied (${(stats.replied/stats.total*100).toFixed(0)}%). `;
        }
        await fetch(`${SB}/rest/v1/kiko_learning_log`, {
          method: 'POST', headers: h,
          body: JSON.stringify({ user_id: __userId, category: 'outreach_patterns', content: insight, entity_name: 'outreach_effectiveness' }),
        });
      }
    } catch {} // Non-blocking

    allResults.push({ user: __user.email, ok: true, scored, updated });
  } catch (userErr) { allResults.push({ user: __user.email, ok: false, error: userErr.message }); }
  } // end user loop
    await cronHeartbeat('cron-outreach-score', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: allResults.length });
    return res.status(200).json({ ok: true, users: allResults })
  } catch (err) {
    console.error('[Outreach Score] Error:', err.message)
    await cronHeartbeat('cron-outreach-score', 'error', { heartbeatId: __hbId, errorMessage: err.message });
    return res.status(200).json({ ok: false, error: err.message })
  }
}
