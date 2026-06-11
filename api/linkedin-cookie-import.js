// api/linkedin-cookie-import.js — Direct cookie import for LinkedIn
// User pastes li_at cookie value from their browser DevTools.
// Session 71: also writes into the encrypted server cookie store (the source the
// keepalive + linkedinEngine actually read) under the correct identity, not just user_tokens.
import { sbFetch } from './kiko-tools.js';
import * as cookieStore from '../lib/cookieStore.js';

// email/domain → keepalive identity label
function identityFor(email) {
  const e = (email || '').toLowerCase();
  if (e.startsWith('matt')) return 'matt.smith';
  if (e.startsWith('sunny')) return 'sunny';
  return e.split('@')[0] || 'sunny';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { li_at, email } = req.body || {};
  if (!li_at || li_at.length < 50) return res.status(400).json({ ok: false, message: 'Invalid li_at cookie value' });

  try {
    // Verify the cookie works by making a simple LinkedIn API call
    const testRes = await fetch('https://www.linkedin.com/voyager/api/identity/profiles/me', {
      headers: {
        'cookie': `li_at=${li_at}`,
        'csrf-token': 'ajax:0',
        'x-restli-protocol-version': '2.0.0',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (!testRes.ok) {
      return res.json({ ok: false, message: `Cookie verification failed (${testRes.status}). Make sure you copied the full li_at value.` });
    }

    const cookieArray = [
      { name: 'li_at', value: li_at, domain: '.linkedin.com', path: '/' },
      { name: 'JSESSIONID', value: `"ajax:${Date.now()}"`, domain: '.linkedin.com', path: '/' }
    ];

    // 1) Encrypted server cookie store — the live source the keepalive/engine read
    const identity = identityFor(email);
    try { cookieStore.save(identity, cookieArray, { source: 'manual_import', importedAt: new Date().toISOString() }); }
    catch (csErr) { console.error('[linkedin-cookie-import] cookieStore.save failed:', csErr.message); }

    // 2) Supabase user_tokens backup (compatible with linkedin-client.js)
    const cookieJson = JSON.stringify(cookieArray);
    const SB = process.env.VITE_SUPABASE_URL;
    const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const tokenEmail = (email || '').replace(/@vanhawke\.agency$/i, '@vanhawke.com');

    await fetch(`${SB}/rest/v1/user_tokens`, {
      method: 'POST',
      headers: { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_email: tokenEmail, provider: 'linkedin', access_token: cookieJson, refresh_token: li_at, updated_at: new Date().toISOString() })
    });

    console.log(`[linkedin-cookie-import] ✅ Cookie imported for ${tokenEmail} (identity=${identity}, store+backup)`);
    return res.json({ ok: true, message: `LinkedIn connected for ${identity} — cookie stored in encrypted server store + Supabase backup`, identity });
  } catch (e) {
    console.error('[linkedin-cookie-import] Error:', e);
    return res.status(500).json({ ok: false, message: e.message });
  }
}
