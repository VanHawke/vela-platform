// api/create-gmail-draft.js — Create a draft in any team member's Gmail
// Used by Kiko chat: user drafts email → sends draft to their own or Matt's Gmail
import { getGoogleToken } from './cron-utils.js';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  
  const { to, subject, body, htmlBody, draftFor } = req.body;
  // draftFor = email of the person whose Gmail should get the draft
  // defaults to sunny@vanhawke.com
  const targetEmail = draftFor || 'sunny@vanhawke.com';
  
  if (!to || !subject) return res.status(400).json({ error: 'to and subject required' });
  
  try {
    const token = await getGoogleToken(targetEmail);
    if (!token) return res.status(400).json({ error: `No Gmail token for ${targetEmail}` });
    
    // Build RFC 2822 email message
    const fromHeader = targetEmail;
    const headers = [
      `From: ${fromHeader}`,
      `To: ${Array.isArray(to) ? to.join(', ') : to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
    ].join('\r\n');
    
    const emailContent = htmlBody || body.replace(/\n/g, '<br>');
    const rawMessage = `${headers}\r\n\r\n${emailContent}`;
    const encodedMessage = Buffer.from(rawMessage).toString('base64url');
    
    // Create draft via Gmail API
    const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw: encodedMessage } }),
    });
    
    const data = await gmailRes.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    
    return res.status(200).json({ 
      ok: true, 
      draftId: data.id, 
      draftFor: targetEmail,
      subject,
      to: Array.isArray(to) ? to.join(', ') : to,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
