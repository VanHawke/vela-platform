// api/gmail-draft.js — Creates Gmail draft (or sends test email) using stored Google OAuth tokens
// Signature is pulled from the user's actual Gmail signature via the sendAs API — not hardcoded.
import { createClient } from '@supabase/supabase-js'
import { wrapEmailBody, loadUserSignatures, buildMimeWithInlineImages } from './lib/email-format.js'
import { getGoogleToken } from './google-token.js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function sbFetch(path, opts = {}) {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/${path}`
  const r = await fetch(url, {
    ...opts,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {})
    }
  })
  if (!r.ok) throw new Error(`sbFetch ${path}: ${r.status}`)
  return r.json()
}

function buildRawEmail({ from, to, subject, htmlBody, plainBody }) {
  // Clean subject — replace special dashes, encode × properly for email
  const cleanSubject = (subject || '')
    .replace(/[\u2014\u2013\u2015\u2012\u2010\u2011]/g, '-')
    .replace(/\u00D7/g, 'x')
    .replace(/â€"/g, '-')
  const encodedSubject = /^[\x20-\x7E]*$/.test(cleanSubject) ? cleanSubject : `=?UTF-8?B?${Buffer.from(cleanSubject).toString('base64')}?=`
  const boundary = 'boundary_' + Date.now()
  const lines = [
    `From: ${from}`,
    ...[`To: ${to || 'undisclosed-recipients:;'}`],
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    plainBody,
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
  const { to, subject, body, send = false, contactStatus = 'cold', senderEmail, sender, draftFor } = req.body || {}
  const resolvedSenderEmail = senderEmail || sender || draftFor
  if (!subject && !body) return res.status(400).json({ error: 'Missing subject or body' })

  try {
    // Resolve sender — use senderEmail/sender/draftFor, otherwise default to Sunny
    const resolvedSender = resolvedSenderEmail || 'sunny@vanhawke.agency'
    // Token lookup must use .com (how Google tokens are stored)
    const tokenLookupEmail = resolvedSender.replace('@vanhawke.agency', '@vanhawke.com')
    const accessToken = await getGoogleToken(tokenLookupEmail)
    if (!accessToken) return res.status(401).json({ error: `No Google token for ${resolvedSender}` })

    // Resolve user_id and from_address for this sender
    const senderConfig = await sbFetch(`kiko_user_config?email=eq.${encodeURIComponent(resolvedSender)}&select=user_id,email,display_name&limit=1`).catch(() => [])
    const senderUserId = senderConfig?.[0]?.user_id || '9f486437-4bf5-4111-abfe-fe19bfa76063'
    // Use .agency address for sending if available, otherwise .com
    const fromAddress = resolvedSender.replace('@vanhawke.com', '@vanhawke.agency')
    const signatures = await loadUserSignatures(sbFetch, senderUserId, accessToken, fromAddress).catch(() => ({ signature: '', coldSignature: '' }))
    const { html: htmlBody, text: plainBody } = wrapEmailBody(body, {
      contactStatus,
      signature: signatures.signature,
      coldSignature: signatures.coldSignature
    })

    // Build email with vanhawke.agency alias.
    // If signature has inline cid: images, build multipart/related MIME so the
    // images render correctly in the recipient's inbox.
    const cleanSubject = (subject || '')
      .replace(/[\u2014\u2013\u2015\u2012\u2010\u2011]/g, '-')
      .replace(/\u00D7/g, 'x')
      .replace(/â€"/g, '-')
    const encodedSubject = /^[\x20-\x7E]*$/.test(cleanSubject) ? cleanSubject : `=?UTF-8?B?${Buffer.from(cleanSubject).toString('base64')}?=`

    // Resolve sender display name
    const senderDisplayName = senderConfig?.[0]?.display_name || resolvedSender.split('@')[0].split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

    const raw = buildMimeWithInlineImages({
      from: `${senderDisplayName} <${fromAddress}>`,
      to: to || fromAddress,
      subject: encodedSubject,
      htmlBody,
      plainBody,
      inlineImages: signatures.inlineImages || [],
    })
    console.log('[gmail-draft] MIME built:', { to, fromAddress, resolvedTo: to || fromAddress, send })

    // Send OR Draft depending on `send` flag
    const endpoint = send
      ? 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
      : 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'
    const payload = send ? { raw } : { message: { raw } }

    const callGmail = async (tok) => {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      return { r, j: await r.json() }
    }
    let { r: gmailRes, j: result } = await callGmail(accessToken)
    if (gmailRes.status === 401) {
      // Cached Google token was invalidated by Google despite not being expired -> force refresh + retry once
      console.warn('[gmail-draft] 401 from Gmail API - forcing token refresh + retry for', tokenLookupEmail)
      try {
        const freshToken = await getGoogleToken(tokenLookupEmail, true)
        ;({ r: gmailRes, j: result } = await callGmail(freshToken))
      } catch (refreshErr) {
        console.error('[gmail-draft] forced refresh failed for', tokenLookupEmail, refreshErr.message)
        return res.status(401).json({ error: `Token refresh failed for ${resolvedSender}` })
      }
    }
    if (!gmailRes.ok) {
      console.error('[gmail-draft] API error:', result)
      return res.status(gmailRes.status).json({ error: result.error?.message || 'Gmail API error' })
    }
    // Track draft for edit-delta learning (Phase 16) — only when drafting, not sending
    if (!send) {
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
    }
    return res.status(200).json({ success: true, mode: send ? 'sent' : 'drafted', id: result.id, signatureSource: signatures.source || 'unknown' })
  } catch (e) {
    console.error('[gmail-draft] Error:', e)
    return res.status(500).json({ error: e.message })
  }
}
