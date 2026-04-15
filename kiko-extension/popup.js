// Kiko LinkedIn Sync — popup controller

function timeAgo(iso) {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

async function refreshStatus() {
  const c = await chrome.storage.local.get(null);
  document.getElementById('identity').textContent = c.identity || '—';
  document.getElementById('lastSync').textContent = timeAgo(c.lastSync);
  document.getElementById('cookieCount').textContent = c.cookieCount ?? '—';

  const statusEl = document.getElementById('status');
  if (!c.authToken) {
    statusEl.className = 'status error';
    statusEl.textContent = '⚠ Not configured. Open Settings to add the auth token.';
  } else if (c.lastStatus === 'synced') {
    statusEl.className = 'status ok';
    statusEl.textContent = `✓ Cookies synced to Kiko server — identity "${c.identity}"`;
  } else if (c.lastStatus === 'error') {
    statusEl.className = 'status error';
    statusEl.textContent = '✗ ' + (c.lastError || 'sync failed');
  } else {
    statusEl.className = 'status idle';
    statusEl.textContent = 'Click Sync Now to push your LinkedIn session to Kiko.';
  }
}

document.getElementById('syncBtn').addEventListener('click', async () => {
  const btn = document.getElementById('syncBtn');
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  try {
    await chrome.runtime.sendMessage({ action: 'sync-now' });
  } catch (e) {}
  btn.disabled = false;
  btn.textContent = 'Sync Now';
  await refreshStatus();
});

document.getElementById('verifyBtn').addEventListener('click', async () => {
  const btn = document.getElementById('verifyBtn');
  btn.disabled = true;
  btn.textContent = 'Testing session…';
  const statusEl = document.getElementById('status');
  try {
    const result = await chrome.runtime.sendMessage({ action: 'verify' });
    if (result && result.ok && result.authenticated) {
      statusEl.className = 'status ok';
      statusEl.textContent = '✓ LinkedIn session verified live on server';
    } else {
      statusEl.className = 'status error';
      statusEl.textContent = '✗ ' + (result?.error || 'verify failed');
    }
  } catch (e) {
    statusEl.className = 'status error';
    statusEl.textContent = '✗ ' + e.message;
  }
  btn.disabled = false;
  btn.textContent = 'Test LinkedIn Session';
});

document.getElementById('settingsLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refreshStatus();
