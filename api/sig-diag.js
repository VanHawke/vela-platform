// api/sig-diag.js — Diagnostic endpoint to dump Gmail signature HTML + cached cids
import { getGoogleToken } from './cron-utils.js';
import { extractCidsFromHtml } from './lib/email-format.js';
import { sbFetch } from './kiko-tools.js';

export default async function handler(req, res) {
  try {
    const accessToken = await getGoogleToken('sunny@vanhawke.com');
    if (!accessToken) return res.status(401).json({ error: 'No token' });

    // 1. Get raw signature HTML from Gmail sendAs API
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await r.json();
    const signatures = (data.sendAs || []).map(s => ({
      email: s.sendAsEmail,
      isPrimary: s.isPrimary,
      isDefault: s.isDefault,
      signatureLength: (s.signature || '').length,
      signatureSnippet: (s.signature || '').slice(0, 1500),
      cidsFound: extractCidsFromHtml(s.signature || ''),
      hasImgTag: /<img[^>]+>/i.test(s.signature || ''),
      hasCidRef: /src=["']cid:/i.test(s.signature || ''),
      hasHttpsImg: /src=["']https?:/i.test(s.signature || ''),
      hasDataUrl: /src=["']data:/i.test(s.signature || ''),
    }));

    // 2. Get cached images
    const cached = await sbFetch('kiko_signature_images?select=cid,content_type,size_bytes,cached_at&order=cached_at.desc&limit=20');

    // 3. Search recent sent messages
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:me&maxResults=10',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const list = await listRes.json();
    const sentMessageCount = (list.messages || []).length;

    // 4. Look at the most recent message in detail
    let firstMessageStructure = null;
    if (list.messages?.[0]) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${list.messages[0].id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msg = await msgRes.json();
      const flatten = (p) => {
        if (!p) return [];
        const out = [{ mimeType: p.mimeType, filename: p.filename, hasBody: !!p.body, attachmentId: p.body?.attachmentId, headers: (p.headers || []).filter(h => /content-id|content-type|content-disposition/i.test(h.name)) }];
        if (p.parts) for (const c of p.parts) out.push(...flatten(c));
        return out;
      };
      firstMessageStructure = flatten(msg.payload);
    }

    return res.status(200).json({
      signatures,
      cachedCount: (cached || []).length,
      cachedSamples: (cached || []).slice(0, 5),
      sentMessageCount,
      firstMessageStructure,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
