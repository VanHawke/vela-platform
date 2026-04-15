# Kiko LinkedIn Sync (Chrome Extension)

One-click LinkedIn session sync for the Kiko server-side automation engine.
Same UX as Lemlist's extension — different architecture underneath. Instead of
running automation inside your browser, this extension syncs your LinkedIn
cookies to the kiko-worker server which runs headless Chromium 24/7, so
campaigns execute whether your browser is open or not.

## Files

- `manifest.json` — Chrome Manifest V3 config (permissions, background, popup, options)
- `background.js` — service worker that watches cookie changes and POSTs to kiko-worker
- `popup.html` + `popup.js` — toolbar UI (status, manual sync, test session)
- `options.html` + `options.js` — first-run setup (server URL, auth token, identity)
- `icons/icon-{16,48,128}.png` — toolbar icons

## Install (for now, unpacked — Chrome Web Store later)

1. Open Chrome → `chrome://extensions`
2. Top-right: enable **Developer mode** toggle
3. Click **Load unpacked**
4. Select this folder: `/Users/sunny/Desktop/vela-platform/kiko-extension/`
5. Extension appears in your toolbar. Click it → Settings opens automatically.
6. Defaults for the Van Hawke kiko-server are already filled in.
7. Click **Save & Sync Now**. Cookies are pushed to the server.
8. Open the popup again and click **Test LinkedIn Session** — should say "verified live".

## What happens after install

- Extension wakes up whenever LinkedIn cookies change (login, refresh, rotation)
- Debounced 10s sync → POSTs fresh cookies to `POST /linkedin/cookies`
- Also syncs periodically every 30 min as a safety net
- You never touch cookies again

## White-label / second user setup

Same extension, different config in the options page:
- `serverUrl`: client's kiko-worker URL
- `authToken`: client's worker secret
- `identity`: new identity label (e.g. `matt`, `client-acme-01`)

Eventually: publish to Chrome Web Store, use per-user OAuth tokens instead
of a hard-coded shared secret.

## Security notes

- The auth token in `options.js` is the Van Hawke worker secret.
  **Add `kiko-extension/options.js` to `.gitignore` before committing** —
  or better, refactor to load from `chrome.storage` on first-run and remove
  the hard-coded default.
- Cookies are transmitted over HTTP for now (server doesn't have HTTPS yet).
  Once Let's Encrypt is set up on server.vanhawke.agency, update manifest
  host_permissions and the options default URL.
- The extension only has permission for linkedin.com + kiko-worker domains.
  It cannot read cookies from any other site.
