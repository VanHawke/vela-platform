// api/linkedin-connect.js — Connect LinkedIn account via email/password
// Same approach as Dripify/Expandi: user enters credentials, we log in via Playwright,
// capture full cookie set, keep-alive cron maintains the session.
// No extension. No DevTools. No technical knowledge required.
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cookieStore from '../lib/cookieStore.js';

chromium.use(StealthPlugin());

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { email, password, identity } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const id = identity || email.split('@')[0].toLowerCase();
  console.log(`[linkedin-connect] Connecting LinkedIn for ${id} (${email})`);

  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage']
  };
  const proxyHost = process.env.PROXY_HOST;
  const proxyPort = process.env.PROXY_PORT;
  if (proxyHost && proxyPort) {
    launchOpts.proxy = { server: `http://${proxyHost}:${proxyPort}`, username: process.env.PROXY_USER, password: process.env.PROXY_PASS };
  }

  let browser;
  try {
    browser = await chromium.launch(launchOpts);
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London'
    });
    const page = await ctx.newPage();

    // Navigate to LinkedIn login
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000 + Math.random() * 2000);

    // Fill credentials — LinkedIn has DUPLICATE inputs (hidden + visible). Must target VISIBLE ones.
    // Visible email: autocomplete="username webauthn", visible password: autocomplete="current-password"
    // Use Playwright's :visible pseudo-class to skip the hidden duplicates
    const emailLocator = page.locator('input[type="email"]:visible').first();
    const passLocator = page.locator('input[type="password"]:visible').first();

    try {
      await emailLocator.waitFor({ timeout: 15000 });
    } catch {
      await browser.close();
      return res.json({ ok: false, status: 'selector_failed', message: 'Cannot find email input on LinkedIn login page.' });
    }

    await emailLocator.click();
    await page.waitForTimeout(200);
    await emailLocator.fill('');
    await emailLocator.type(email, { delay: 30 + Math.random() * 40 });
    await page.waitForTimeout(300);

    try {
      await passLocator.waitFor({ timeout: 10000 });
    } catch {
      await browser.close();
      return res.json({ ok: false, status: 'selector_failed', message: 'Cannot find password input.' });
    }

    await passLocator.click();
    await page.waitForTimeout(200);
    await passLocator.fill('');
    await passLocator.type(password, { delay: 30 + Math.random() * 40 });
    await page.waitForTimeout(500);

    // Submit via Enter key
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000 + Math.random() * 2000);

    const url = page.url();
    console.log(`[linkedin-connect] Post-login URL: ${url}`);

    // Check for verification challenge
    if (url.includes('/checkpoint') || url.includes('/challenge')) {
      await browser.close();
      return res.json({ ok: false, status: 'verification_required',
        message: 'LinkedIn is asking for verification. Please verify in your browser, then try connecting again.' });
    }

    // Check cookies FIRST — li_at cookie = successful login regardless of URL
    await page.waitForTimeout(2000);
    const checkCookies = await ctx.cookies();
    const hasLiAt = checkCookies.some(c => c.name === 'li_at' && c.value.length > 20);
    
    if (!hasLiAt) {
      // No li_at cookie — might still be loading. Wait more and retry.
      await page.waitForTimeout(3000);
      const recheck = await ctx.cookies();
      const recheckLiAt = recheck.some(c => c.name === 'li_at' && c.value.length > 20);
      
      if (!recheckLiAt && (url.includes('/login') || url.includes('/authwall'))) {
        await browser.close();
        return res.json({ ok: false, status: 'login_failed', message: 'Login failed. Please check email and password.' });
      }
    }

    // Success — capture ALL cookies
    const allCookies = await ctx.cookies();
    const linkedinCookies = allCookies.filter(c => c.domain.includes('linkedin'));

    if (linkedinCookies.length < 5) {
      await browser.close();
      return res.json({ ok: false, status: 'session_incomplete', message: 'Login succeeded but session not fully established. Try again.' });
    }

    // Save full cookie set to encrypted store
    cookieStore.save(id, linkedinCookies, { email, source: 'linkedin-connect', connected_at: new Date().toISOString() });

    // Also update user_tokens table — store FULL cookie set as JSON
    const liAt = linkedinCookies.find(c => c.name === 'li_at');
    const jsession = linkedinCookies.find(c => c.name === 'JSESSIONID');
    if (liAt) {
      const SB = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const SK = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
      const tokenEmail = email.replace(/@vanhawke\.agency$/i, '@vanhawke.com');
      // UPSERT — create if not exists, update if exists
      await fetch(`${SB}/rest/v1/user_tokens`, {
        method: 'POST', headers: { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_email: tokenEmail, provider: 'linkedin', access_token: JSON.stringify(linkedinCookies), refresh_token: jsession?.value || '', updated_at: new Date().toISOString() })
      }).catch(e => console.error('[linkedin-connect] Token upsert failed:', e.message));
    }

    console.log(`[linkedin-connect] Connected ${id} — ${linkedinCookies.length} cookies`);
    await browser.close();

    return res.json({ ok: true, status: 'connected', identity: id, cookies: linkedinCookies.length,
      message: `LinkedIn connected. ${linkedinCookies.length} session cookies captured. Keep-alive will maintain the session automatically.` });

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error(`[linkedin-connect]`, err.message);
    return res.json({ ok: false, status: 'error', message: err.message });
  }
}
