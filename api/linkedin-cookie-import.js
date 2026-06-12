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
    const cookieArray = [
      { name: 'li_at', value: li_at, domain: '.linkedin.com', path: '/' },
      { name: 'JSESSIONID', value: `"ajax:${Date.now()}"`, domain: '.linkedin.com', path: '/' }
    ];

    // Store FIRST, verify after — and verify through the proxied Playwright engine.
    // NEVER raw-fetch LinkedIn from this server: datacenter IP is blocked and a raw
    // check falsely rejects valid cookies (Systems Registry hard fact).
    const identity = identityFor(email);
    try { cookieStore.save(identity, cookieArray, { source: 'manual_import', importedAt: new Date().toISOString() }); }
    catch (csErr) { console.error('[linkedin-cookie-import] cookieStore.save failed:', csErr.message); }

    // Supabase user_tokens backup (compatible with linkedin-client.js)
    const cookieJson = JSON.stringify(cookieArray);
    const SB = process.env.VITE_SUPABASE_URL;
    const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const tokenEmail = (email || '').replace(/@vanhawke\.agency$/i, '@vanhawke.com');

    await fetch(`${SB}/rest/v1/user_tokens`, {
      method: 'POST',
      headers: { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_email: tokenEmail, provider: 'linkedin', access_token: cookieJson, refresh_token: li_at, updated_at: new Date().toISOString() })
    });

    // Authoritative verification: Playwright through the residential proxy
    let verified = false, verifyNote = '';
    try {
      const { verifyIdentity } = await import('../lib/linkedinEngine.js');
      const v = await verifyIdentity(identity);
      verified = !!(v && (v.authenticated || v.ok));
      verifyNote = verified ? 'verified live through proxy' : `stored but not yet verified (${v?.error || v?.reason || 'engine check failed'})`;
    } catch (vErr) { verifyNote = `stored; verification engine error: ${vErr.message}`; }

    console.log(`[linkedin-cookie-import] ✅ Cookie imported for ${tokenEmail} (identity=${identity}) — ${verifyNote}`);
    return res.json({ ok: true, verified, identity, message: `LinkedIn cookie stored for ${identity} (encrypted store + backup) — ${verifyNote}` });
  } catch (e) {
    console.error('[linkedin-cookie-import] Error:', e);
    return res.status(500).json({ ok: false, message: e.message });
  }
}
