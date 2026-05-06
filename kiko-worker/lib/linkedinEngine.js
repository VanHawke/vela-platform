// lib/linkedinEngine.js
// Playwright-based LinkedIn automation with stealth.
// All actions use a fresh browser context loaded with the identity's cookies.
// A global mutex ensures only ONE action runs at a time per identity (LinkedIn rate-limit safety).

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cookieStore from './cookieStore.js';

chromium.use(StealthPlugin());

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const VIEWPORT = { width: 1440, height: 900 };
const NAV_TIMEOUT_MS = 25000;
const ACTION_TIMEOUT_MS = 15000;

// Per-identity mutex so we never run concurrent actions on the same LinkedIn account
const locks = new Map();

async function withLock(identity, fn) {
  while (locks.get(identity)) {
    await new Promise(r => setTimeout(r, 250));
  }
  locks.set(identity, true);
  try {
    return await fn();
  } finally {
    locks.delete(identity);
  }
}

// Capture current cookies from a Playwright context and persist them back
// to the cookie store. LinkedIn rotates session tokens on almost every request
// so after each action we save the freshest cookies so the NEXT action uses
// the valid set, not the one that was valid 10 seconds ago.
async function captureAndPersistCookies(identity, context, actionLabel) {
  try {
    const currentCookies = await context.cookies('https://www.linkedin.com');
    if (Array.isArray(currentCookies) && currentCookies.length > 0) {
      const stored = cookieStore.load(identity);
      const meta = stored?.meta || {};
      cookieStore.save(identity, currentCookies, {
        ...meta,
        last_written_by: 'kiko-worker-server',
        last_server_action: actionLabel,
        last_server_write: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('[kiko-worker] failed to capture cookies post-action:', err.message);
  }
}

// Launch a browser context with stealth + cookies for a given identity.
// Returns { browser, context, page } — caller must close browser.
async function openContextForIdentity(identity) {
  const stored = cookieStore.load(identity);
  console.log(`[linkedinEngine] Loaded for ${identity}: ${stored ? (stored.cookies ? stored.cookies.length + " cookies" : "no .cookies") : "NULL"} stale=${stored?.stale}`);
  if (!stored) throw new Error(`no cookies stored for identity '${identity}'`);
  if (stored.stale) throw new Error(`cookies for identity '${identity}' are marked stale - please refresh`);

  // Proxy config from env vars — routes Playwright through residential ISP IP
  console.log(`[linkedinEngine] Opening context for identity: ${identity}`);
  const proxyHost = process.env.PROXY_HOST;
  const proxyPort = process.env.PROXY_PORT;
  const proxyUser = process.env.PROXY_USER;
  const proxyPass = process.env.PROXY_PASS;

  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  };
  if (proxyHost && proxyPort) {
    launchOptions.proxy = {
      server: `http://${proxyHost}:${proxyPort}`,
      username: proxyUser || undefined,
      password: proxyPass || undefined
    };
  }

  const browser = await chromium.launch(launchOptions);

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: VIEWPORT,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    javaScriptEnabled: true
  });

  // Inject LinkedIn cookies. The kiko-extension POSTs cookies using Chrome's
  // chrome.cookies API format where sameSite may be 'no_restriction' | 'lax' |
  // 'strict' | 'unspecified'. Playwright's addCookies() requires exactly
  // 'Strict' | 'Lax' | 'None'. Normalise defensively.
  function mapSameSite(raw) {
    if (!raw) return 'Lax';
    const s = String(raw).toLowerCase();
    if (s === 'strict') return 'Strict';
    if (s === 'none' || s === 'no_restriction') return 'None';
    // 'lax', 'unspecified', anything unknown → safe default
    return 'Lax';
  }
  const normalized = stored.cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain || '.linkedin.com',
    path: c.path || '/',
    expires: typeof c.expirationDate === 'number' ? c.expirationDate
           : typeof c.expires === 'number' ? c.expires
           : -1,
    httpOnly: !!c.httpOnly,
    secure: c.secure !== false,
    sameSite: mapSameSite(c.sameSite)
  }));
  await context.addCookies(normalized);

  const page = await context.newPage();
  page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

  return { browser, context, page };
}

// Verify cookies still work by visiting /feed. Returns {ok, authenticated, profile_url?, error?}
export async function verifyIdentity(identity) {
  return withLock(identity, async () => {
    let browser, context;
    try {
      const opened = await openContextForIdentity(identity);
      browser = opened.browser;
      context = opened.context;
      const { page } = opened;
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
      // If we're redirected to /login or /checkpoint, cookies are stale
      const url = page.url();
      if (url.includes('/login') || url.includes('/checkpoint') || url.includes('/uas/login')) {
        cookieStore.markStale(identity);
        return { ok: false, authenticated: false, error: 'redirected to login - cookies stale', url };
      }
      // Try to grab the user's own profile URL from nav menu
      let profileUrl = null;
      try {
        const href = await page.locator('a[data-test-global-nav-link="mynetwork"]').first().getAttribute('href', { timeout: 3000 });
        profileUrl = href ? `https://www.linkedin.com${href}` : null;
      } catch (_) {}
      // CRITICAL: capture any rotated cookies so next action uses the fresh set
      await captureAndPersistCookies(identity, context, 'verify');
      return { ok: true, authenticated: true, url, profile_url: profileUrl };
    } catch (err) {
      return { ok: false, authenticated: false, error: err.message };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  });
}

// Fetch a public profile URL (scraping) and return basic fields.
// URL format: https://www.linkedin.com/in/<slug>/ or /in/<slug>
export async function getProfile(identity, profileUrl) {
  return withLock(identity, async () => {
    let browser, context;
    try {
      const opened = await openContextForIdentity(identity);
      browser = opened.browser;
      context = opened.context;
      const { page } = opened;
      const url = normalizeLinkedinUrl(profileUrl);

      // Warm up the session by visiting feed first — this sets session-scoped
      // cookies and gives us a proper referrer when navigating to the profile.
      // LinkedIn's authwall fires aggressively on direct profile URL hits with
      // no referrer, even when cookies are valid.
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500 + Math.random() * 1500);

      // Now navigate to the profile with feed as the referrer
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        referer: 'https://www.linkedin.com/feed/'
      });
      // Wait longer for any client-side redirects to settle
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500 + Math.random() * 1500); // human-like pause

      const finalUrl = page.url();
      const title = await page.title().catch(() => '');

      // Authwall detection — but don't mark stale. An authwall on a specific
      // profile doesn't necessarily mean cookies are dead (LinkedIn throttles
      // headless traffic aggressively). We only mark stale from the /verify
      // endpoint, which checks /feed specifically.
      if (finalUrl.includes('/authwall') || finalUrl.includes('/uas/login')) {
        return {
          ok: false,
          error: 'LinkedIn served authwall for this profile URL',
          final_url: finalUrl,
          title,
          hint: 'cookies may still be valid - try /linkedin/verify to confirm'
        };
      }

      // Wait for the name heading to appear before scraping — this is our
      // signal that the page has finished hydrating and stopped navigating.
      // If it never appears, we'll time out gracefully below.
      try {
        await page.locator('h1').first().waitFor({ state: 'visible', timeout: 8000 });
      } catch (_) {
        // h1 didn't appear — return what we have
        await captureAndPersistCookies(identity, context, 'profile');
        return {
          ok: false,
          error: 'profile page did not render h1 in time',
          final_url: page.url(),
          title: await page.title().catch(() => '')
        };
      }

      // Use Playwright locators (with built-in retry) instead of page.evaluate,
      // which is fragile when LinkedIn does client-side navigations.
      const safeText = async (sel) => {
        try {
          const loc = page.locator(sel).first();
          if (await loc.count() === 0) return null;
          const txt = await loc.textContent({ timeout: 3000 });
          return txt ? txt.trim() : null;
        } catch (_) { return null; }
      };

      const data = {
        name: await safeText('h1'),
        headline: await safeText('.text-body-medium.break-words') || await safeText('[data-field="headline"]'),
        location: await safeText('.text-body-small.inline.t-black--light.break-words'),
        about: null
      };

      // CRITICAL: capture rotated cookies before closing the browser
      await captureAndPersistCookies(identity, context, 'profile');
      return { ok: true, url: page.url(), title, profile: data };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  });
}

// Send a connection request (optionally with a note) to a profile.
// Returns {ok, status: 'sent'|'already_connected'|'pending'|'blocked'|'error', error?}
export async function sendConnection(identity, profileUrl, note = null) {
  return withLock(identity, async () => {
    let browser, context;
    try {
      const opened = await openContextForIdentity(identity);
      browser = opened.browser;
      context = opened.context;
      const { page } = opened;
      const url = normalizeLinkedinUrl(profileUrl);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000 + Math.random() * 2000);

      if (page.url().includes('/authwall') || page.url().includes('/login')) {
        cookieStore.markStale(identity);
        return { ok: false, status: 'error', error: 'cookies stale' };
      }

      // Find the Connect button. LinkedIn sometimes hides it behind "More" menu.
      const connectDirect = page.locator('button:has-text("Connect")').first();
      const connectCount = await connectDirect.count();
      if (connectCount > 0) {
        await connectDirect.click({ delay: 150 + Math.random() * 100 });
      } else {
        // Try the "More" dropdown → Connect
        const moreBtn = page.locator('button:has-text("More")').first();
        if (await moreBtn.count() === 0) {
          return { ok: false, status: 'already_connected', error: 'no Connect button - likely already connected' };
        }
        await moreBtn.click({ delay: 100 });
        await page.waitForTimeout(600);
        const connectInMenu = page.locator('div[role="menu"] >> text=/^Connect$/').first();
        if (await connectInMenu.count() === 0) {
          return { ok: false, status: 'blocked', error: 'Connect not in More menu' };
        }
        await connectInMenu.click({ delay: 150 });
      }
      await page.waitForTimeout(1000 + Math.random() * 800);

      if (note && note.trim().length > 0) {
        // Click "Add a note"
        const addNoteBtn = page.locator('button:has-text("Add a note")').first();
        if (await addNoteBtn.count() > 0) {
          await addNoteBtn.click({ delay: 150 });
          await page.waitForTimeout(400);
          const noteField = page.locator('textarea[name="message"]').first();
          await noteField.fill(note.slice(0, 295)); // LinkedIn limits to 300 chars
          await page.waitForTimeout(500 + Math.random() * 500);
        }
      }

      // Click "Send" / "Send invitation" / "Send now"
      const sendBtn = page
        .locator('button:has-text("Send"), button:has-text("Send invitation"), button:has-text("Send now")')
        .first();
      if (await sendBtn.count() === 0) {
        return { ok: false, status: 'blocked', error: 'no Send button in invitation dialog' };
      }
      await sendBtn.click({ delay: 150 });
      await page.waitForTimeout(2000);

      // CRITICAL: capture rotated cookies before closing the browser
      await captureAndPersistCookies(identity, context, 'connect');
      return { ok: true, status: 'sent', note_used: !!note };
    } catch (err) {
      return { ok: false, status: 'error', error: err.message };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  });
}

function normalizeLinkedinUrl(urlOrSlug) {
  if (!urlOrSlug) throw new Error('profile url required');
  if (urlOrSlug.startsWith('http')) return urlOrSlug;
  if (urlOrSlug.startsWith('/in/')) return `https://www.linkedin.com${urlOrSlug}`;
  return `https://www.linkedin.com/in/${urlOrSlug}/`;
}

export async function sendMessage(identity, profileUrl, messageText) {
  return withLock(identity, async () => {
    let browser, context;
    try {
      const opened = await openContextForIdentity(identity);
      browser = opened.browser;
      context = opened.context;
      const { page } = opened;
      const url = normalizeLinkedinUrl(profileUrl);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000 + Math.random() * 2000);

      if (page.url().includes('/authwall') || page.url().includes('/login')) {
        cookieStore.markStale(identity);
        return { ok: false, status: 'error', error: 'cookies stale' };
      }

      // Find the Message link href for compose URL
      const msgLinks = await page.$$('a');
      let composeHref = null;
      for (const link of msgLinks) {
        const text = await link.textContent().catch(() => '');
        const href = await link.getAttribute('href').catch(() => '');
        if (text.trim() === 'Message' && href && href.includes('/messaging/compose')) {
          composeHref = href;
          break;
        }
      }
      if (!composeHref) {
        return { ok: false, status: 'not_connected', error: 'No Message link - may not be connected' };
      }

      // Navigate to compose URL
      const composeUrl = composeHref.startsWith('http') ? composeHref : 'https://www.linkedin.com' + composeHref;
      await page.goto(composeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3500 + Math.random() * 1000);

      // Find message input with multiple fallback selectors
      let typed = false;
      const inputSelectors = [
        'div[contenteditable="true"][role="textbox"]',
        'div.msg-form__contenteditable[contenteditable="true"]',
        '[contenteditable="true"][aria-label*="message" i]',
        '[contenteditable="true"][aria-label*="Write" i]',
        '[contenteditable="true"][aria-placeholder*="Write" i]',
        'div[contenteditable="true"]',
      ];
      for (const sel of inputSelectors) {
        const el = page.locator(sel).first();
        if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
          await el.click();
          await page.waitForTimeout(300);
          await page.keyboard.type(messageText.slice(0, 8000), { delay: 15 });
          typed = true;
          console.log('[sendMessage] Typed via:', sel);
          break;
        }
      }
      if (!typed) {
        return { ok: false, status: 'error', error: 'Message input not found on compose page' };
      }
      await page.waitForTimeout(800 + Math.random() * 500);

      // Click Send with multiple fallback selectors
      let sent = false;
      const sendSelectors = ['button.msg-form__send-button', 'button[type="submit"]'];
      for (const sel of sendSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
          await btn.click({ delay: 150 });
          sent = true;
          console.log('[sendMessage] Sent via:', sel);
          break;
        }
      }
      if (!sent) {
        const allBtns = await page.$$('button');
        for (const btn of allBtns) {
          const t = await btn.textContent().catch(() => '');
          if (t.trim().toLowerCase() === 'send' && await btn.isVisible()) {
            await btn.click({ delay: 150 });
            sent = true;
            break;
          }
        }
      }
      if (!sent) return { ok: false, status: 'error', error: 'Send button not found' };
      await page.waitForTimeout(2000);

      await captureAndPersistCookies(identity, context, 'message');
      return { ok: true, status: 'sent' };
    } catch (err) {
      return { ok: false, status: 'error', error: err.message };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  });
}
