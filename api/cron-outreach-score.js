// api/cron-outreach-score.js — Daily outreach scoring engine
// Pulls sent emails from last 7 days, checks for replies, classifies messaging approach, scores effectiveness
// Runs once daily at 9am UK via Vercel cron

const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5'

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()

  const SB = process.env.VITE_SUPABASE_URL
  const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SB || !SK) return res.status(500).json({ error: 'Not configured' })
  const h = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' }

  try {
    // Step 1: Get Google token for Gmail API
    const { getGoogleToken } = await import('./google-token.js')
    const token = await getGoogleToken('sunny@vanhawke.com')

    // Step 2: Find sent emails from last 7 days not yet scored
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const gmailQ = `from:me after:${sevenDaysAgo} -in:draft`
    const searchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQ)}&maxResults=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const searchData = await searchRes.json()
    const messageIds = (searchData.messages || []).map(m => m.id)
    if (!messageIds.length) return res.status(200).json({ scored: 0, message: 'No sent emails found' })

    // Step 3: Check which are already scored
    const existingRes = await fetch(`${SB}/rest/v1/outreach_scores?select=email_gmail_id&org_id=eq.${ORG_ID}`, { headers: h })
    const existing = await existingRes.json()
    const scoredIds = new Set((existing || []).map(e => e.email_gmail_id))

    const newIds = messageIds.filter(id => !scoredIds.has(id))
    if (!newIds.length) return res.status(200).json({ scored: 0, message: 'All emails already scored' })

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
      model: 'claude-sonnet-4-20250514', max_tokens: 4000,
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

    return res.status(200).json({ scored, updated, total_emails: messageIds.length })
  } catch (err) {
    console.error('[Outreach Score] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
