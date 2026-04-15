// Kiko LinkedIn Sync — background service worker
// Watches LinkedIn cookies and syncs them to the kiko-worker server automatically.
// User installs once, the extension handles the rest forever.

const DEFAULT_CONFIG = {
  serverUrl: 'http://178.104.73.22',
  authToken: '',  // populated by options page on first save
  identity: 'sunny',
  autoSync: true
};

const LINKEDIN_DOMAINS = ['.linkedin.com', 'www.linkedin.com', '.www.linkedin.com'];
const DEBOUNCE_SECONDS = 10;
const PERIODIC_SYNC_MINUTES = 30;

// ============================================================================
// LIFECYCLE
// ============================================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[kiko-sync] installed:', details.reason);
  const stored = await chrome.storage.local.get(['serverUrl', 'authToken', 'identity']);
  if (!stored.serverUrl) {
    await chrome.storage.local.set({
      serverUrl: DEFAULT_CONFIG.serverUrl,
      identity: DEFAULT_CONFIG.identity
    });
  }
  // Set up periodic sync alarm
  chrome.alarms.create('periodic-sync', { periodInMinutes: PERIODIC_SYNC_MINUTES });
  // Open settings on fresh install
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// ============================================================================
// COOKIE CHANGE WATCHER — debounced auto-sync when LinkedIn cookies change
// ============================================================================

chrome.cookies.onChanged.addListener((changeInfo) => {
  const domain = changeInfo.cookie.domain || '';
  if (!LINKEDIN_DOMAINS.some(d => domain === d || domain.endsWith(d))) return;
  if (changeInfo.removed && changeInfo.cause !== 'overwrite') {
    // Actual cookie removal — don't sync, likely logout
    return;
  }
  // Debounced sync: schedule for DEBOUNCE_SECONDS in the future.
  // If another change arrives, this alarm is replaced and the timer resets.
  chrome.alarms.create('debounced-sync', { delayInMinutes: DEBOUNCE_SECONDS / 60 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'periodic-sync') {
    syncCookies('periodic');
  } else if (alarm.name === 'debounced-sync') {
    syncCookies('cookie-change');
  }
});

// ============================================================================
// MESSAGE HANDLER (popup/options → background)
// ============================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'sync-now') {
    syncCookies('manual').then(sendResponse);
    return true;
  }
  if (msg.action === 'verify') {
    verifyCookies().then(sendResponse);
    return true;
  }
  if (msg.action === 'get-status') {
    chrome.storage.local.get(null).then(sendResponse);
    return true;
  }
});

// ============================================================================
// CORE SYNC — reads linkedin.com cookies, POSTs to kiko-worker
// ============================================================================

async function syncCookies(trigger) {
  const config = await chrome.storage.local.get(['serverUrl', 'authToken', 'identity']);
  if (!config.serverUrl || !config.authToken) {
    console.warn('[kiko-sync] not configured');
    return { ok: false, error: 'not configured - open Settings' };
  }

  try {
    // Pull cookies from all LinkedIn domains and dedupe by name+domain
    const buckets = await Promise.all([
      chrome.cookies.getAll({ domain: '.linkedin.com' }),
      chrome.cookies.getAll({ domain: 'www.linkedin.com' }),
      chrome.cookies.getAll({ domain: 'linkedin.com' })
    ]);
    const all = buckets.flat();
    const unique = Array.from(
      new Map(all.map(c => [`${c.name}|${c.domain}|${c.path}`, c])).values()
    );

    // Normalise to a shape Playwright's context.addCookies() accepts
    const normalised = unique.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      expires: c.expirationDate || -1,
      httpOnly: !!c.httpOnly,
      secure: !!c.secure,
      sameSite: (c.sameSite || 'lax').replace('no_restriction', 'None')
    }));

    const resp = await fetch(`${config.serverUrl}/linkedin/cookies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        identity: config.identity || 'default',
        cookies: normalised,
        meta: {
          source: 'kiko-extension',
          trigger,
          user_agent: navigator.userAgent,
          synced_at: new Date().toISOString()
        }
      })
    });

    const data = await resp.json();
    const status = data.ok ? 'synced' : 'error';

    await chrome.storage.local.set({
      lastSync: new Date().toISOString(),
      lastStatus: status,
      lastError: data.ok ? null : (data.error || 'unknown'),
      cookieCount: normalised.length,
      lastTrigger: trigger
    });

    console.log(`[kiko-sync] ${status} ${normalised.length} cookies (${trigger})`);
    return { ok: data.ok, cookieCount: normalised.length, ...data };
  } catch (err) {
    console.error('[kiko-sync] sync failed:', err);
    await chrome.storage.local.set({
      lastSync: new Date().toISOString(),
      lastStatus: 'error',
      lastError: err.message
    });
    return { ok: false, error: err.message };
  }
}

// ============================================================================
// VERIFY — asks kiko-worker to actually visit LinkedIn with the stored cookies
// ============================================================================

async function verifyCookies() {
  const config = await chrome.storage.local.get(['serverUrl', 'authToken', 'identity']);
  if (!config.serverUrl || !config.authToken) {
    return { ok: false, error: 'not configured' };
  }
  try {
    const resp = await fetch(`${config.serverUrl}/linkedin/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ identity: config.identity || 'default' })
    });
    return await resp.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
