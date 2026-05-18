// cron-linkedin-keepalive.js — Keeps LinkedIn sessions warm
// Runs every 6 hours. Visits LinkedIn /feed/ with each identity cookies.
// Captures rotated cookies after each visit. Prevents session expiry.
// FIXED: No longer skips stale cookies — always attempts recovery.
import { verifyIdentity } from "../lib/linkedinEngine.js";
import * as cookieStore from "../lib/cookieStore.js";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

async function attemptAutoLogin(identity) {
  // FIRST: Try restoring cookies from Supabase user_tokens backup
  try {
    const emailMap = { 'sunny': 'sunny@vanhawke.com', 'matt.smith': 'matt.smith@vanhawke.com' };
    const email = emailMap[identity];
    if (email) {
      const { data } = await supabase.from('user_tokens').select('access_token').eq('user_email', email).eq('provider', 'linkedin').single();
      if (data?.access_token) {
        const cookies = JSON.parse(data.access_token);
        if (cookies?.length > 5) {
          cookieStore.save(identity, cookies, { source: 'supabase_restore' });
          console.log(`[keepalive] ${identity}: restored ${cookies.length} cookies from Supabase backup`);
          // Verify they work
          const result = await verifyIdentity(identity);
          if (result.ok && result.authenticated) {
            console.log(`[keepalive] ✓ ${identity}: Supabase cookies VALID — session recovered`);
            return { ok: true, cookieCount: cookies.length, method: 'supabase_restore' };
          }
        }
      }
    }
  } catch (e) { console.warn(`[keepalive] Supabase restore failed for ${identity}:`, e.message); }

  // SECOND: Try stored credentials for automated login
  try {
    const { data: creds } = await supabase.from('kiko_linkedin_credentials')
      .select('email, password').eq('identity', identity).maybeSingle();
    if (!creds?.email || !creds?.password) return { ok: false, error: 'no stored credentials and Supabase backup expired' };

    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000 + Math.random() * 1000);
    await page.fill('#username', creds.email);
    await page.fill('#password', creds.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000 + Math.random() * 2000);

    const url = page.url();
    if (url.includes('/checkpoint') || url.includes('/challenge')) {
      await browser.close();
      return { ok: false, error: 'LinkedIn requires verification (2FA/CAPTCHA) — manual login needed' };
    }
    if (url.includes('/feed') || url.includes('/mynetwork')) {
      // Success — capture fresh cookies
      const cookies = await context.cookies();
      cookieStore.save(identity, { cookies, stale: false, refreshedAt: new Date().toISOString() });
      await browser.close();
      return { ok: true, cookieCount: cookies.length };
    }
    await browser.close();
    return { ok: false, error: `Login failed — landed on ${url}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default async function handler(req, res) {
  const identities = ["sunny", "matt.smith"];
  const results = [];

  for (const identity of identities) {
    try {
      const stored = cookieStore.load(identity);
      if (!stored || !stored.cookies || stored.cookies.length < 3) {
        // No cookies at all — try auto-login
        console.log(`[keepalive] ${identity}: no cookies, attempting auto-login`);
        const loginResult = await attemptAutoLogin(identity);
        results.push({ identity, status: loginResult.ok ? 'recovered' : 'no_cookies', ...loginResult });
        continue;
      }

      // ALWAYS try verification — even if marked stale
      // (LinkedIn sometimes accepts "stale" cookies after rotation)
      const wasStale = stored.stale;
      if (wasStale) console.log(`[keepalive] ${identity}: marked stale but attempting recovery...`);
      else console.log(`[keepalive] Warming session for ${identity} (${stored.cookies.length} cookies)`);

      const result = await verifyIdentity(identity);

      if (result.ok && result.authenticated) {
        if (wasStale) {
          // Recovered from stale! Unmark stale.
          cookieStore.save(identity, { ...stored, stale: false, refreshedAt: new Date().toISOString() });
          console.log(`[keepalive] ✓ ${identity} RECOVERED from stale — session is alive again`);
        } else {
          console.log(`[keepalive] ✓ ${identity} session is alive`);
        }
        results.push({ identity, status: wasStale ? 'recovered' : 'alive', authenticated: true });
      } else {
        // Session truly expired — attempt auto-login
        console.log(`[keepalive] ✗ ${identity} session expired: ${result.error}. Attempting auto-login...`);
        const loginResult = await attemptAutoLogin(identity);

        if (loginResult.ok) {
          console.log(`[keepalive] ✓ ${identity} auto-login SUCCESS — ${loginResult.cookieCount} fresh cookies`);
          results.push({ identity, status: 'auto_login_success', cookieCount: loginResult.cookieCount });
        } else {
          // Auto-login failed — create high-priority alert
          console.error(`[keepalive] ✗ ${identity} auto-login FAILED: ${loginResult.error}`);
          cookieStore.markStale(identity);
          results.push({ identity, status: 'expired', error: loginResult.error });

          // Alert the user
          try {
            await supabase.from('kiko_alerts').insert({
              type: 'linkedin_session_expired',
              severity: 'critical',
              title: `LinkedIn session expired: ${identity}`,
              detail: `${identity}'s LinkedIn cookies have expired and auto-login failed: ${loginResult.error}. Manual re-login required on the Hetzner server.`,
              entity_type: 'system', entity_name: identity, dismissed: false,
            });
          } catch (alertErr) { console.error('[keepalive] Alert insert error:', alertErr.message); }
        }
      }
    } catch (err) {
      results.push({ identity, status: "error", error: err.message });
      console.error(`[keepalive] Error for ${identity}:`, err.message);
    }
  }

  return res.json({ ok: true, results });
}