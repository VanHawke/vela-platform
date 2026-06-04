// api/cron-linkedin-monitor.js — LinkedIn Ambient Monitoring via Playwright
// Checks messaging inbox for new messages and invitation manager for accepts.
// Uses the same Playwright + Decodo proxy + StealthPlugin as keepalive.
// Surfaces signals to kiko_alerts. Runs every 30 minutes.

import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import * as cookieStore from '../lib/cookieStore.js';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
chromium.use(StealthPlugin());

async function openBrowser(identity) {
  const stored = cookieStore.load(identity);
  if (!stored?.cookies?.length) return null;

  const proxyHost = process.env.PROXY_HOST;
  const proxyPort = process.env.PROXY_PORT;
  const launchOptions = { headless: true, args: ['--no-sandbox', '--disable-gpu'] };
  if (proxyHost && proxyPort) {
    launchOptions.proxy = {
      server: `http://${proxyHost}:${proxyPort}`,
      username: process.env.PROXY_USER || undefined,
      password: process.env.PROXY_PASS || undefined,
    };
  }
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  await context.addCookies(stored.cookies);
  const page = await context.newPage();
  return { browser, context, page };
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-linkedin-monitor', 'started');
  let signalsCreated = 0;
  const identities = ['sunny', 'matt.smith'];

  try {
    for (const identity of identities) {
      let browser;
      try {
        const session = await openBrowser(identity);
        if (!session) { console.log(`[linkedin-monitor] ${identity}: no cookies, skipping`); continue; }
        browser = session.browser;
        const { page } = session;

        // ═══ PART 1: Check messaging inbox for unread conversations ═══
        try {
          await page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(2000 + Math.random() * 1000);

          // Scrape conversation list for unread indicators
          const unreadConvos = await page.evaluate(() => {
            const items = document.querySelectorAll('.msg-conversation-listitem');
            const results = [];
            for (const item of items) {
              const unreadBadge = item.querySelector('.msg-conversation-listitem__unread-count, .notification-badge');
              if (!unreadBadge) continue;
              const nameEl = item.querySelector('.msg-conversation-listitem__participant-names, .msg-conversation-card__participant-names');
              const previewEl = item.querySelector('.msg-conversation-listitem__message-snippet, .msg-conversation-card__message-snippet');
              const timeEl = item.querySelector('.msg-conversation-listitem__time-stamp, .msg-conversation-card__time-stamp');
              results.push({
                name: nameEl?.textContent?.trim() || 'Unknown',
                preview: previewEl?.textContent?.trim() || '',
                time: timeEl?.textContent?.trim() || '',
                unreadCount: parseInt(unreadBadge?.textContent?.trim()) || 1,
              });
            }
            return results;
          });

          for (const convo of unreadConvos) {
            // Skip sponsored InMail
            if (convo.preview.toLowerCase().includes('sponsored') || convo.name.toLowerCase().includes('sponsored')) continue;
            // Dedup: skip if already alerted
            const existing = await sbFetch(
              `kiko_alerts?type=eq.linkedin_message&entity_name=eq.${encodeURIComponent(convo.name)}&dismissed=eq.false&limit=1`
            );
            if (existing?.length > 0) continue;

            await sbFetch('kiko_alerts', {
              method: 'POST',
              body: JSON.stringify({
                type: 'linkedin_message',
                severity: 'high',
                title: `LinkedIn message from ${convo.name}`,
                detail: `${convo.unreadCount} unread message(s). Preview: "${convo.preview.slice(0, 200)}". Account: ${identity}`,
                entity_type: 'contact', entity_name: convo.name, dismissed: false,
                metadata: { identity, preview: convo.preview, timestamp: convo.time },
              }),
            });
            signalsCreated++;
            console.log(`[linkedin-monitor] ${identity}: Message from ${convo.name}`);

            // Auto-draft a reply for LinkedIn messages
            try {
              await sbFetch('kiko_draft_actions', {
                method: 'POST',
                body: JSON.stringify({
                  action_type: 'linkedin_reply',
                  payload: {
                    entity: convo.name,
                    context: `${convo.name} sent you a LinkedIn message. Preview: "${convo.preview.slice(0, 300)}". Account: ${identity}.${match ? ` CRM: ${match.data?.name} at ${match.data?.company}` : ''}`,
                    draft: `Hi ${(convo.name || '').split(' ')[0]},\n\nThank you for your message. [Review and personalise before sending]\n\nBest regards`,
                    channel: 'linkedin',
                    preview: convo.preview,
                  },
                  status: 'pending',
                  user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063',
                }),
              });
            } catch (e) { console.warn(`[linkedin-monitor] Message draft failed:`, e.message); }
          }
        } catch (e) { console.warn(`[linkedin-monitor] ${identity} messaging check:`, e.message); }

        // ═══ PART 2: Check invitation manager for recent accepts ═══
        try {
          await page.goto('https://www.linkedin.com/mynetwork/invitation-manager/sent/', { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(2000 + Math.random() * 1000);

          // Scrape sent invitations for accepted status
          const accepts = await page.evaluate(() => {
            const cards = document.querySelectorAll('.invitation-card, .mn-invitation-list li');
            const results = [];
            for (const card of cards) {
              const statusEl = card.querySelector('.invitation-card__action-btn, .artdeco-button--secondary');
              const nameEl = card.querySelector('.invitation-card__title, .mn-person-info__name');
              const subtitleEl = card.querySelector('.invitation-card__subtitle, .mn-person-info__occupation');
              const statusText = statusEl?.textContent?.trim()?.toLowerCase() || '';
              // "Accepted" buttons or "Message" buttons indicate accepted invites
              if (statusText.includes('message') || statusText.includes('accepted')) {
                results.push({
                  name: nameEl?.textContent?.trim() || 'Unknown',
                  headline: subtitleEl?.textContent?.trim() || '',
                });
              }
            }
            return results;
          });

          for (const accept of accepts) {
            // Dedup
            const existing = await sbFetch(
              `kiko_alerts?type=eq.linkedin_connection_accepted&entity_name=eq.${encodeURIComponent(accept.name)}&dismissed=eq.false&limit=1`
            );
            if (existing?.length > 0) continue;

            // Match CRM contacts
            const contacts = await sbFetch('contacts?select=id,data&limit=2000');
            const match = (contacts || []).find(c => {
              const fullName = `${c.data?.firstName || ''} ${c.data?.lastName || ''}`.trim().toLowerCase();
              return fullName === accept.name.toLowerCase();
            });

            await sbFetch('kiko_alerts', {
              method: 'POST',
              body: JSON.stringify({
                type: 'linkedin_connection_accepted',
                severity: match ? 'high' : 'medium',
                title: `LinkedIn connection accepted: ${accept.name}`,
                detail: `${accept.name} (${accept.headline}) accepted your connection. Account: ${identity}. ${match ? `CRM match: ${match.data?.company || 'known contact'}` : 'Not in CRM.'}`,
                entity_type: 'contact', entity_name: accept.name, dismissed: false,
                metadata: { identity, headline: accept.headline, crmMatch: !!match },
              }),
            });
            signalsCreated++;
            console.log(`[linkedin-monitor] ${identity}: Connection accept from ${accept.name}`);

            // Auto-draft a follow-up message for approved connection accepts
            try {
              const draftPayload = {
                entity: accept.name,
                context: `${accept.name} (${accept.headline}) accepted your LinkedIn connection request. Account: ${identity}. ${match ? `CRM match: ${match.data?.company}` : 'Not in CRM.'}`,
                draft: `Hi ${(accept.name || '').split(' ')[0]},\n\nThank you for connecting. I noticed your work at ${accept.headline?.split(' at ')?.[1] || 'your company'} — would be great to find some time for a brief introduction.\n\nBest regards`,
                channel: 'linkedin',
                linkedin_public_id: accept.name,
              };
              await sbFetch('kiko_draft_actions', {
                method: 'POST',
                body: JSON.stringify({
                  action_type: 'linkedin_followup',
                  payload: draftPayload,
                  status: 'pending',
                  user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063',
                }),
              });
              console.log(`[linkedin-monitor] Auto-draft queued for ${accept.name}`);
            } catch (e) { console.warn(`[linkedin-monitor] Draft creation failed:`, e.message); }
          }
        } catch (e) { console.warn(`[linkedin-monitor] ${identity} invitation check:`, e.message); }

        await browser.close();
      } catch (e) {
        console.warn(`[linkedin-monitor] ${identity} error:`, e.message);
        if (browser) await browser.close().catch(() => {});
      }
    }

    await cronHeartbeat('cron-linkedin-monitor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, signalsCreated });
    return res.json({ ok: true, signals: signalsCreated, identities: identities.length, duration_ms: Date.now() - __hbStart });
  } catch (err) {
    console.error('[linkedin-monitor] Fatal:', err.message);
    await cronHeartbeat('cron-linkedin-monitor', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    return res.json({ ok: false, error: err.message });
  }
}
