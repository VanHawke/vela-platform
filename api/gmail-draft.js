// api/gmail-draft.js — Creates Gmail draft silently using stored Google OAuth tokens
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function refreshToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  const data = await res.json()
  return data.access_token
}

function buildRawEmail({ from, to, subject, body }) {
  // Clean subject — replace all special dashes
  const cleanSubject = (subject || '')
    .replace(/[\u2014\u2013\u2015\u2012\u2010\u2011]/g, '-')
    .replace(/â€"/g, '-')
  // Build RFC 2822 email with HTML body for Helvetica 12pt
  const htmlBody = `<div style="font-family: Helvetica, Arial, sans-serif; font-size: 12pt; color: #000;">${body.replace(/\n/g, '<br>')}</div>`
  const boundary = 'boundary_' + Date.now()
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${cleanSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    body,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    htmlBody,
    ``,
    `--${boundary}--`
  ]
  const raw = lines.join('\r\n')
  return Buffer.from(raw).toString('base64url')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { to, subject, body } = req.body || {}
  if (!subject || !body) return res.status(400).json({ error: 'Missing subject or body' })

  try {
    // Get stored Google token
    const { data: tokens } = await supabase
      .from('user_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_email', 'sunny@vanhawke.com')
      .eq('provider', 'google')
      .single()
    if (!tokens) return res.status(401).json({ error: 'No Google token' })

    // Refresh if expired
    let accessToken = tokens.access_token
    if (new Date(tokens.expires_at) < new Date()) {
      accessToken = await refreshToken(tokens.refresh_token)
      // Update stored token
      await supabase.from('user_tokens').update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + 3600000).toISOString()
      }).eq('user_email', 'sunny@vanhawke.com').eq('provider', 'google')
    }

    // Build email with vanhawke.agency alias
    const raw = buildRawEmail({
      from: 'Sunny Sidhu <sunny@vanhawke.agency>',
      to: to || '',
      subject,
      body
    })

    // Create Gmail draft
    const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: { raw } })
    })
    const result = await gmailRes.json()
    if (!gmailRes.ok) {
      console.error('[gmail-draft] API error:', result)
      return res.status(gmailRes.status).json({ error: result.error?.message || 'Gmail API error' })
    }
    // Track draft for edit-delta learning (Phase 16)
    try {
      await supabase.from('kiko_draft_tracking').insert({
        gmail_draft_id: result.id,
        gmail_message_id: result.message?.id,
        original_content: (body || '').slice(0, 2000),
        recipient: to,
        subject: subject || '',
        status: 'drafted'
      })
    } catch (trackErr) { console.error('[gmail-draft] Tracking insert failed:', trackErr.message) }
    return res.status(200).json({ success: true, draftId: result.id })
  } catch (e) {
    console.error('[gmail-draft] Error:', e)
    return res.status(500).json({ error: e.message })
  }
}
