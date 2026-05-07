// api/linkedin-client.js — JS-native LinkedIn voyager API wrapper
//
// ⚠️ DORMANT AS OF v0.0.70 (14 Apr 2026) — DO NOT CALL FROM CRONS OR USER-FACING CODE
// ────────────────────────────────────────────────────────────────────────────────
// LinkedIn voyager API access from Vercel is CONFIRMED IMPOSSIBLE. Cloudflare's bot
// management (which protects LinkedIn's edge) flags Vercel's IP ranges as cloud
// infrastructure and kills sessions within seconds. Every request after the first
// receives a 302 redirect with `Set-Cookie: li_at=delete me; Expires=1970` and
// `clear-site-data` headers. No amount of cookie rotation, retry logic, or fetch
// tuning will fix this — the block is at the network layer, by source IP.
//
// FULL DIAGNOSTIC EVIDENCE: KIKO_MASTER_LOG.md "v0.0.66-v0.0.69.1" sections
// AWAITING DECISION: which LinkedIn backend to integrate. Candidates under research:
//   - Unipile API (developer-focused unified messaging)
//   - HeyReach / Expandi / Dripify (cloud-based LinkedIn automation w/ residential proxies)
//   - PhantomBuster (cloud LinkedIn agents)
//   - LaGrowthMachine (multi-channel sequencing)
// See OUTSTANDING_ITEMS.md "LinkedIn Backend Selection" for the live comparison matrix.
//
// THIS FILE STAYS HERE because: (1) the retry wrapper / abort logic / parser fallbacks
// are reusable patterns for whichever backend wins, and (2) some backends still wrap
// voyager under the hood, just from residential IPs. Once a backend is chosen, the
// transport layer in voyagerFetch will be swapped to route through that provider.
//
// CALLERS: cron-linkedin-sender (DISABLED in vercel.json), cron-sequence-reply-detect
// LinkedIn block (GUARDED behind LINKEDIN_BACKEND_ENABLED), api/kiko-tools.js LinkedIn
// tool handlers (GUARDED behind LINKEDIN_BACKEND_ENABLED), api/linkedin-test.js
// (manual probe only).
// ────────────────────────────────────────────────────────────────────────────────
//
// Original purpose: Cookie auth via LINKEDIN_LI_AT + LINKEDIN_JSESSIONID env vars
// v0.0.65: Added kill switch, graduated quota, audit log integration
// v0.0.66: Retry wrapper + 5-path profile parser
// v0.0.67: AbortController per-attempt timeout, reduced backoff
// v0.0.68-v0.0.69.1: Diagnostic err.cause capture, redirect: manual
// v0.0.70: PARKED pending backend selection

import { createClient } from '@supabase/supabase-js';

const VOYAGER_BASE = 'https://www.linkedin.com/voyager/api';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabaseAudit = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ── Custom error classes for clear failure semantics ──
export class LinkedInKillSwitchEngagedError extends Error {
  constructor() { super('LinkedIn kill switch is engaged (LINKEDIN_KILL_SWITCH env var set). All write operations are blocked.'); this.name = 'LinkedInKillSwitchEngagedError'; }
}
export class LinkedInQuotaExceededError extends Error {
  constructor(actionType, currentCount, cap) { super(`LinkedIn daily ${actionType} quota exceeded: ${currentCount}/${cap}. Resets at midnight UTC.`); this.name = 'LinkedInQuotaExceededError'; this.actionType = actionType; this.currentCount = currentCount; this.cap = cap; }
}

// ── Graduated daily cap ──
function getCurrentDailyCap() {
  const firstUseEnv = process.env.LINKEDIN_FIRST_USE_DATE;
  if (!firstUseEnv) return 25;
  const daysSinceFirstUse = Math.floor((new Date() - new Date(firstUseEnv)) / (1000 * 60 * 60 * 24));
  return daysSinceFirstUse < 7 ? 25 : 40;
}

// ── Kill switch — FIRST check in every write op ──
function checkKillSwitch() {
  const ks = process.env.LINKEDIN_KILL_SWITCH;
  if (ks && ks !== '0' && ks !== 'false' && ks !== '') throw new LinkedInKillSwitchEngagedError();
}

// ── Quota check + audit row insert ──
async function checkAndIncrementQuota(actionType, source = 'unknown') {
  if (!supabaseAudit) return null;
  const cap = getCurrentDailyCap();
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const { count, error: countErr } = await supabaseAudit.from('kiko_linkedin_audit').select('id', { count: 'exact', head: true }).eq('action_type', actionType).eq('status', 'success').gte('created_at', todayStart.toISOString());
  if (countErr) { console.error('[linkedin-client] quota count error:', countErr.message); return null; }
  if (count >= cap) throw new LinkedInQuotaExceededError(actionType, count, cap);
  const { data: inserted } = await supabaseAudit.from('kiko_linkedin_audit').insert([{ action_type: actionType, status: 'pending', source }]).select('id').single();
  return inserted?.id || null;
}

// ── Update audit row after action ──
async function updateAuditRow(auditId, updates) {
  if (!supabaseAudit || !auditId) return;
  try { await supabaseAudit.from('kiko_linkedin_audit').update({ ...updates, completed_at: new Date().toISOString() }).eq('id', auditId); } catch (e) { console.error('[linkedin-client] audit update error:', e.message); }
}

// ── Auth headers ──
// Reads from env vars first, then falls back to user_tokens DB (where linkedin-connect stores them)
let _cachedCookies = null;
let _cookieLoadedAt = 0;

async function loadLinkedInCookies() {
  if (_cachedCookies && Date.now() - _cookieLoadedAt < 5 * 60 * 1000) return _cachedCookies;
  
  if (process.env.LINKEDIN_LI_AT && process.env.LINKEDIN_JSESSIONID) {
    _cachedCookies = { liAt: process.env.LINKEDIN_LI_AT, jsessionid: process.env.LINKEDIN_JSESSIONID };
    _cookieLoadedAt = Date.now();
    return _cachedCookies;
  }
  
  try {
    const SB = process.env.VITE_SUPABASE_URL;
    const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await fetch(`${SB}/rest/v1/user_tokens?provider=eq.linkedin&select=access_token,refresh_token&limit=1`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
    });
    const data = await res.json();
    if (data?.[0]?.access_token) {
      try {
        const cookies = JSON.parse(data[0].access_token);
        const liAtCookie = cookies.find(c => c.name === 'li_at');
        const jsessionCookie = cookies.find(c => c.name === 'JSESSIONID');
        if (liAtCookie?.value && jsessionCookie?.value) {
          _cachedCookies = { liAt: liAtCookie.value, jsessionid: jsessionCookie.value };
          _cookieLoadedAt = Date.now();
          return _cachedCookies;
        }
      } catch {}
      _cachedCookies = { liAt: data[0].access_token, jsessionid: data[0].refresh_token || '' };
      _cookieLoadedAt = Date.now();
      return _cachedCookies;
    }
  } catch (e) { console.error('[linkedin-client] DB cookie load failed:', e.message); }
  return null;
}

function getAuthHeaders() {
  const c = _cachedCookies;
  if (!c?.liAt || !c?.jsessionid) throw new Error('LinkedIn session not found. Reconnect via Settings → LinkedIn.');
  const csrfToken = c.jsessionid.replace(/^"|"$/g, '');
  return { 'cookie': `li_at=${c.liAt}; JSESSIONID=${c.jsessionid}`, 'csrf-token': csrfToken, 'x-restli-protocol-version': '2.0.0', 'accept': 'application/vnd.linkedin.normalized+json+2.1', 'user-agent': USER_AGENT, 'content-type': 'application/json; charset=UTF-8' };
}

loadLinkedInCookies().catch(() => {});

// Retryable network error patterns — Vercel undici TLS flakiness against LinkedIn.
// These are transient and benefit from a fresh TCP connection.
const RETRYABLE_ERRORS = /fetch failed|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|socket hang up|UND_ERR|aborted/i;
const RETRY_DELAYS_MS = [500, 1500]; // 2 retries after the initial → 3 attempts total
const FETCH_TIMEOUT_MS = 6000; // Per-attempt hard cap so a hung fetch can't blow the function budget

async function voyagerFetch(path, opts = {}) {
  await loadLinkedInCookies(); // Ensure cookies are loaded from DB before making request
  const url = path.startsWith('http') ? path : `${VOYAGER_BASE}${path}`;
  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      // Force a fresh TCP connection on every attempt (works around Vercel
      // undici connection pool reusing a broken socket)
      const res = await fetch(url, {
        ...opts,
        signal: controller.signal,
        redirect: 'manual', // Critical: do NOT follow 302s — LinkedIn redirects to /login when cookies are invalid
        headers: {
          ...getAuthHeaders(),
          'connection': 'close',
          ...(opts.headers || {}),
        },
      });
      clearTimeout(abortTimer);

      // 302/301/303/307/308 → LinkedIn redirecting to login means cookies are invalid
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location') || '';
        const isLoginRedirect = /login|authwall|checkpoint/i.test(location) || location === '';
        if (isLoginRedirect) {
          throw new Error(`LinkedIn auth failed (${res.status}→${location || 'no Location'}) — cookies expired or session invalidated. ACTION: rotate li_at + JSESSIONID in Vercel env vars.`);
        }
        // Unexpected redirect (not to login) — surface it
        throw new Error(`LinkedIn unexpected redirect ${res.status} → ${location}`);
      }

      // Non-retryable auth/rate responses — fail fast, retrying makes things worse
      if (res.status === 401 || res.status === 403) {
        throw new Error(`LinkedIn auth failed (${res.status}) — li_at cookie may have expired.`);
      }
      if (res.status === 429) {
        throw new Error('LinkedIn rate limit hit (429). Back off and retry later.');
      }

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`LinkedIn API error ${res.status}: ${text.slice(0, 300)}`);
      }
      try { return JSON.parse(text); } catch { return text; }
    } catch (err) {
      clearTimeout(abortTimer);
      lastError = err;
      // Capture the full cause chain — 'fetch failed' hides the real error in err.cause
      const causeCode = err?.cause?.code || err?.code || null;
      const causeErrno = err?.cause?.errno || null;
      const causeMessage = err?.cause?.message || null;
      const msg = err?.message || String(err);
      const fullMsg = causeCode
        ? `${msg} [cause: ${causeCode}${causeErrno ? ` errno=${causeErrno}` : ''}${causeMessage ? ` — ${causeMessage}` : ''}]`
        : msg;

      // Non-retryable errors — rethrow immediately
      if (msg.includes('LinkedIn auth failed') || msg.includes('rate limit hit') || msg.includes('LinkedIn API error')) {
        throw err;
      }

      // Retryable network error (including AbortController timeouts)?
      if (!RETRYABLE_ERRORS.test(msg) && err?.name !== 'AbortError') {
        const wrapped = new Error(fullMsg);
        wrapped.cause = err.cause;
        throw wrapped; // Unknown error class — surface it with cause
      }

      // Last attempt — surface the final error with full cause
      if (attempt === RETRY_DELAYS_MS.length) {
        console.warn(`[voyagerFetch] giving up after ${attempt + 1} attempts: ${fullMsg}`);
        const wrapped = new Error(fullMsg);
        wrapped.cause = err.cause;
        throw wrapped;
      }

      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(`[voyagerFetch] retrying in ${delay}ms (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}) — ${fullMsg}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError || new Error('voyagerFetch failed after retries');
}

function publicIdFromUrl(url) { const m = (url || '').match(/\/in\/([^/?#]+)/); return m ? m[1] : null; }
function generateTrackingId() { return Buffer.from(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))).toString('base64'); }

// ── Public API ──

export async function linkedinTestAuth() {
  try {
    const data = await voyagerFetch('/me');
    // Voyager /me response shapes vary — try every known location before giving up
    const mp = data?.miniProfile
      || data?.profile?.miniProfile
      || data?.data?.miniProfile
      || data?.included?.find?.(i => i?.$type?.includes('MiniProfile'))
      || {};
    const firstName = mp.firstName || data?.firstName || data?.data?.firstName || null;
    const lastName = mp.lastName || data?.lastName || data?.data?.lastName || null;
    const publicIdentifier = mp.publicIdentifier || data?.publicIdentifier || data?.data?.publicIdentifier || null;

    // If parsing still fails to extract a name, log the top-level keys so we
    // can diagnose the actual shape — but still return authenticated=true because
    // a successful /me call proves the cookies work.
    if (!firstName && !lastName && !publicIdentifier) {
      console.log('[linkedinTestAuth] /me parsed no name fields. Top-level keys:', Object.keys(data || {}));
    }
    return { authenticated: true, profile: { firstName, lastName, publicIdentifier } };
  } catch (e) { return { authenticated: false, error: e.message }; }
}

export async function linkedinGetProfile(publicIdOrUrl) {
  const publicId = publicIdOrUrl.includes('/') ? publicIdFromUrl(publicIdOrUrl) : publicIdOrUrl;
  if (!publicId) throw new Error('Invalid LinkedIn URL or publicId');
  const data = await voyagerFetch(`/identity/profiles/${publicId}/profileView`);
  const p = data?.profile || {}; const mp = p.miniProfile || {};
  return { firstName: mp.firstName || p.firstName, lastName: mp.lastName || p.lastName, headline: mp.occupation || p.headline, publicIdentifier: mp.publicIdentifier, entityUrn: mp.entityUrn || mp.objectUrn, industryName: p.industryName, locationName: p.locationName, summary: p.summary };
}

export async function linkedinSendInvite(profileUrl, message = '', source = 'unknown') {
  checkKillSwitch();
  if (message && message.length > 200) throw new Error('LinkedIn invite messages are limited to 200 characters');
  const auditId = await checkAndIncrementQuota('invite', source);
  try {
    const publicId = publicIdFromUrl(profileUrl);
    if (!publicId) throw new Error('Invalid LinkedIn profile URL');
    const profile = await linkedinGetProfile(publicId);
    const entityUrn = profile.entityUrn;
    if (!entityUrn) throw new Error('Could not extract entityUrn from profile');
    const memberId = entityUrn.split(':').pop();
    const body = { trackingId: generateTrackingId(), invitations: [], excludeInvitations: [], invitee: { 'com.linkedin.voyager.growth.invitation.InviteeProfile': { profileId: memberId } } };
    if (message) body.message = message;
    const result = await voyagerFetch('/growth/normInvitations', { method: 'POST', body: JSON.stringify(body) });
    await updateAuditRow(auditId, { status: 'success', target_url: profileUrl, response_status: 200, response_excerpt: JSON.stringify(result).slice(0, 500) });
    return { success: true, profileName: `${profile.firstName || ''} ${profile.lastName || ''}`.trim(), invitationUrn: result?.value?.entityUrn || null };
  } catch (err) {
    await updateAuditRow(auditId, { status: 'failed', target_url: profileUrl, error_message: err.message });
    throw err;
  }
}

export async function linkedinSendMessage(profileUrlOrConversationUrn, messageText, source = 'unknown') {
  checkKillSwitch();
  if (!messageText) throw new Error('Message text is required');
  const auditId = await checkAndIncrementQuota('message', source);
  try {
    if (profileUrlOrConversationUrn.includes('/in/')) {
      const publicId = publicIdFromUrl(profileUrlOrConversationUrn);
      const profile = await linkedinGetProfile(publicId);
      const memberUrn = profile.entityUrn;
      if (!memberUrn) throw new Error('Could not resolve member URN');
      const body = { keyVersion: 'LEGACY_INBOX', conversationCreate: { eventCreate: { value: { 'com.linkedin.voyager.messaging.create.MessageCreate': { attributedBody: { text: messageText, attributes: [] }, attachments: [] } } }, recipients: [memberUrn], subtype: 'MEMBER_TO_MEMBER' } };
      const result = await voyagerFetch('/messaging/conversations?action=create', { method: 'POST', body: JSON.stringify(body) });
      await updateAuditRow(auditId, { status: 'success', target_url: profileUrlOrConversationUrn, response_status: 200, response_excerpt: JSON.stringify(result).slice(0, 500) });
      return { success: true, profileName: `${profile.firstName || ''} ${profile.lastName || ''}`.trim(), conversationUrn: result?.value?.entityUrn || null };
    }
    const body = { eventCreate: { value: { 'com.linkedin.voyager.messaging.create.MessageCreate': { attributedBody: { text: messageText, attributes: [] }, attachments: [] } } } };
    const result = await voyagerFetch(`/messaging/conversations/${encodeURIComponent(profileUrlOrConversationUrn)}/events?action=create`, { method: 'POST', body: JSON.stringify(body) });
    await updateAuditRow(auditId, { status: 'success', target_url: profileUrlOrConversationUrn, response_status: 200 });
    return { success: true, messageUrn: result?.value?.backendEventUrn || null };
  } catch (err) {
    await updateAuditRow(auditId, { status: 'failed', target_url: profileUrlOrConversationUrn, error_message: err.message });
    throw err;
  }
}

export async function linkedinSearch(query, { limit = 10 } = {}) {
  const safeLimit = Math.min(Math.max(1, limit), 25);
  // Audit log (no quota check — search is unlimited)
  let auditId = null;
  try { if (supabaseAudit) { const { data } = await supabaseAudit.from('kiko_linkedin_audit').insert([{ action_type: 'search', target_url: query, status: 'pending', source: 'unknown' }]).select('id').single(); auditId = data?.id; } } catch {}

  const params = new URLSearchParams({ decorationId: 'com.linkedin.voyager.dash.deco.search.SearchClusterCollection-165', count: String(safeLimit), q: 'all', query: `(keywords:${encodeURIComponent(query)},flagshipSearchIntent:SEARCH_SRP,queryParameters:List((key:resultType,value:List(PEOPLE))))`, start: '0', origin: 'GLOBAL_SEARCH_HEADER' });
  const data = await voyagerFetch(`/search/dash/clusters?${params}`);
  const profiles = [];
  for (const inc of (data?.included || [])) {
    if (inc?.template === 'UNIVERSAL' || inc?.$type?.includes('EntityResult')) {
      const title = inc?.title?.text; const primary = inc?.primarySubtitle?.text; const secondary = inc?.secondarySubtitle?.text; const navUrl = inc?.navigationUrl;
      if (title && navUrl) profiles.push({ name: title, headline: primary || '', location: secondary || '', profileUrl: navUrl });
    }
  }
  if (auditId) await updateAuditRow(auditId, { status: 'success', response_status: 200 });
  return profiles.slice(0, safeLimit);
}

export async function linkedinGetConversations({ limit = 20 } = {}) {
  const data = await voyagerFetch(`/messaging/conversations?keyVersion=LEGACY_INBOX&count=${limit}`);
  return (data?.elements || []).map(c => ({ conversationUrn: c.entityUrn, lastActivityAt: c.lastActivityAt, unreadCount: c.unreadCount || 0, participants: (c.participants || []).map(p => p?.['com.linkedin.voyager.messaging.MessagingMember']?.miniProfile?.publicIdentifier).filter(Boolean) }));
}
