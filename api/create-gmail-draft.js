// api/create-gmail-draft.js — Create a draft in any team member's Gmail
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 15, api: { bodyParser: { sizeLimit: '4mb' } } };

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function forceRefreshToken(email) {
  // Always refresh — never use cached token
  const { data: rows } = await sb.from('user_tokens').select('refresh_token').eq('user_email', email).eq('provider', 'google').limit(1);
  if (!rows?.[0]?.refresh_token) { console.error(`[gmail-draft] No refresh_token for ${email}`); return null; }
  
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: rows[0].refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) { console.error(`[gmail-draft] Token refresh failed for ${email}:`, JSON.stringify(data)); return null; }
  
  // Update stored token
  await sb.from('user_tokens').update({
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_email', email).eq('provider', 'google');
  
  return data.access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  
  const { to, subject, body, htmlBody, draftFor } = req.body;
  const targetEmail = draftFor || 'sunny@vanhawke.com';
  
  if (!to || !subject) return res.status(400).json({ error: 'to and subject required' });
  
  try {
    // Force refresh token every time — never use stale tokens
    const token = await forceRefreshToken(targetEmail);
    if (!token) return res.status(400).json({ error: `Could not refresh Gmail token for ${targetEmail}. Re-authenticate in Settings.` });
    
    // Clean body — remove sign-offs, names, analysis commentary
    let cleanBody = (htmlBody || body || '').replace(/\n/g, '<br>')
      .replace(/<br\s*\/?>\s*(Best regards|Kind regards|Warm regards|Regards|Sincerely|Cheers|Thanks|Thank you|Best|Yours|All the best),?(\s*<br\s*\/?>)*/gi, '')
      .replace(/<br\s*\/?>\s*(Sunny\s*Sidhu|Matt\s*Smith)(\s*<br\s*\/?>)*/gi, '')
      .replace(/<br\s*\/?>\s*(CEO|CRO|COO|CFO|Managing Director|Director|Van\s*Hawke\s*(Group|Agency|Maison)?\s*(Inc\.?)?|vanhawke\.com)(\s*<br\s*\/?>)*/gi, '')
      .replace(/<br\s*\/?>\s*---+\s*(<br\s*\/?>)*.*/gis, '')
      .replace(/<br\s*\/?>\s*(This references|This approach|Sound right|This email|This draft|This positions|This reengagement|I've framed|I'd recommend|The tone).*$/gis, '')
      .replace(/(<br\s*\/?>){3,}/gi, '<br><br>')
      .replace(/(<br\s*\/?>)+$/i, '')
      .trim();
    
    if (!cleanBody) cleanBody = body || 'Draft content';
    
    // Build RFC 2822 email — Gmail handles signatures automatically
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
    const headers = [
      `From: ${targetEmail}`,
      `To: ${Array.isArray(to) ? to.join(', ') : to}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
    ].join('\r\n');
    
    const encodedBody = Buffer.from(cleanBody, 'utf-8').toString('base64');
    const rawMessage = `${headers}\r\n\r\n${encodedBody}`;
    const encodedMessage = Buffer.from(rawMessage).toString('base64url');
    
    const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw: encodedMessage } }),
    });
    
    const data = await gmailRes.json();
    if (data.error) return res.status(400).json({ error: data.error.message || 'Gmail API error' });
    
    return res.status(200).json({ ok: true, draftId: data.id, draftFor: targetEmail, subject, to: Array.isArray(to) ? to.join(', ') : to });
  } catch (err) {
    console.error('[gmail-draft] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
