// api/create-gmail-draft.js — Create a draft in any team member's Gmail
// Fetches user's Gmail signature and appends it to the draft body

export const config = { maxDuration: 15, api: { bodyParser: { sizeLimit: '4mb' } } };

const SB_URL = () => process.env.VITE_SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sbGet(path) {
  const res = await fetch(`${SB_URL()}/rest/v1/${path}`, {
    headers: { 'apikey': SB_KEY(), 'Authorization': `Bearer ${SB_KEY()}`, 'Content-Type': 'application/json' },
  });
  return res.json();
}

async function sbPatch(path, body) {
  await fetch(`${SB_URL()}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { 'apikey': SB_KEY(), 'Authorization': `Bearer ${SB_KEY()}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  });
}

async function forceRefreshToken(email) {
  const rows = await sbGet(`user_tokens?user_email=eq.${encodeURIComponent(email)}&provider=eq.google&select=refresh_token&limit=1`);
  if (!Array.isArray(rows) || !rows[0]?.refresh_token) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: rows[0].refresh_token, grant_type: 'refresh_token' }),
  });
  const data = await res.json();
  if (!data.access_token) { console.error('[gmail-draft] Refresh failed:', JSON.stringify(data)); return null; }
  await sbPatch(`user_tokens?user_email=eq.${encodeURIComponent(email)}&provider=eq.google`, {
    access_token: data.access_token, expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(), updated_at: new Date().toISOString(),
  });
  return data.access_token;
}

// Email-to-alias mapping: registered emails → sending aliases
const SEND_AS_ALIAS = {
  'sunny@vanhawke.com': 'sunny@vanhawke.agency',
  'matt.smith@vanhawke.com': 'matt.smith@vanhawke.agency',
};

async function getGmailSignature(token, email) {
  // Try the agency alias first (primary sending identity), fall back to registered email
  const alias = SEND_AS_ALIAS[email] || email;
  const attempts = [alias, email];
  for (const addr of attempts) {
    try {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(addr)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.signature) return { signature: data.signature, sendAs: addr };
    } catch {}
  }
  return { signature: '', sendAs: alias };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { to, subject, body, htmlBody, draftFor, sender } = req.body;
  const targetEmail = draftFor || 'sunny@vanhawke.com';
  const senderEmail = sender || targetEmail; // sender determines From + signature
  if (!to || !subject) { console.error('[gmail-draft] 400: missing to or subject', { to, subject: subject?.slice(0,30) }); return res.status(400).json({ error: 'to and subject required' }); }

  try {
    const token = await forceRefreshToken(targetEmail);
    if (!token) { console.error('[gmail-draft] 400: token refresh failed for', targetEmail); return res.status(400).json({ error: `Token refresh failed for ${targetEmail}` }); }

    // Get signature for the SENDER — needs sender's token if sender != recipient
    let signature = '', sendAs = SEND_AS_ALIAS[senderEmail] || senderEmail;
    if (senderEmail === targetEmail) {
      const sigResult = await getGmailSignature(token, senderEmail);
      signature = sigResult.signature; sendAs = sigResult.sendAs;
    } else {
      const senderToken = await forceRefreshToken(senderEmail);
      if (senderToken) {
        const sigResult = await getGmailSignature(senderToken, senderEmail);
        signature = sigResult.signature; sendAs = sigResult.sendAs;
      }
    }

    // Clean body — strip names, titles, company, analysis commentary
    // BUT keep sign-offs (Best, Thanks, Kind regards, etc.) — user wants these
    let clean = (htmlBody || (body || '').replace(/\n/g, '<br>'))
      .replace(/<br\s*\/?>\s*(Sunny\s*Sidhu|Matt\s*Smith)(\s*<br\s*\/?>)*/gi, '')
      .replace(/<br\s*\/?>\s*(CEO|CRO|COO|CFO|Managing Director|Director)(\s*<br\s*\/?>)*/gi, '')
      .replace(/<br\s*\/?>\s*(Van\s*Hawke\s*(Group|Agency|Maison)?\s*(Inc\.?)?)(\s*<br\s*\/?>)*/gi, '')
      .replace(/<br\s*\/?>\s*vanhawke\.(com|agency)(\s*<br\s*\/?>)*/gi, '')
      .replace(/<br\s*\/?>\s*---+.*/gis, '')
      .replace(/<br\s*\/?>\s*(This references|This approach|Sound right|This email|This draft|This positions|The tone).*$/gis, '')
      .replace(/(<br\s*\/?>){3,}/gi, '<br><br>')
      .replace(/(<br\s*\/?>)+$/i, '').trim();
    if (!clean) clean = body || 'Draft';

    // Append signature with separator
    const emailContent = signature ? `${clean}<br><br>${signature}` : clean;

    // Build RFC 2822 email — use alias as From address
    const encSubj = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
    const raw = [
      `From: ${sendAs}`,
      `To: ${Array.isArray(to) ? to.join(', ') : to}`,
      `Subject: ${encSubj}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
    ].join('\r\n') + '\r\n\r\n' + Buffer.from(emailContent, 'utf-8').toString('base64');

    const gRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw: Buffer.from(raw).toString('base64url') } }),
    });
    const gData = await gRes.json();
    if (gData.error) return res.status(400).json({ error: gData.error.message });
    return res.json({ ok: true, draftId: gData.id, draftFor: targetEmail, subject, to });
  } catch (err) {
    console.error('[gmail-draft]', err);
    return res.status(500).json({ error: err.message });
  }
}
