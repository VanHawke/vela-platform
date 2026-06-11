// routes/linkedin.js
// REST API routes for the LinkedIn automation engine.
// All routes require the shared-secret auth (applied in server.js middleware).

import { Router } from 'express';
import * as cookieStore from '../lib/cookieStore.js';
import * as engine from '../lib/linkedinEngine.js';

const router = Router();

// List all stored identities and their cookie status
router.get('/identities', (req, res) => {
  const list = cookieStore.list();
  res.json({ ok: true, identities: list, count: list.length });
});

// Save cookies for a given identity (e.g. 'matt', 'sunny')
// Body: { identity: 'matt', cookies: [ {name, value, domain, ...}, ... ], meta: { email: '...' } }
router.post('/cookies', (req, res) => {
  try {
    const { identity, cookies, meta } = req.body;
    if (!identity || !Array.isArray(cookies)) {
      return res.status(400).json({ ok: false, error: 'identity and cookies[] required' });
    }
    const result = cookieStore.save(identity, cookies, meta || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete stored cookies for an identity
router.delete('/cookies/:identity', (req, res) => {
  const result = cookieStore.deleteIdentity(req.params.identity);
  res.json({ ok: true, deleted: result.changes });
});

// Verify cookies still work for an identity (visits /feed)
// This is what we call before any real action to check session health.
router.post('/verify', async (req, res) => {
  try {
    const { identity } = req.body;
    if (!identity) return res.status(400).json({ ok: false, error: 'identity required' });
    const result = await engine.verifyIdentity(identity);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Fetch a public profile — useful for prospect enrichment
// Body: { identity: 'matt', profile_url: 'https://linkedin.com/in/johndoe' }
router.post('/profile', async (req, res) => {
  try {
    const { identity, profile_url } = req.body;
    if (!identity || !profile_url) {
      return res.status(400).json({ ok: false, error: 'identity and profile_url required' });
    }
    const result = await engine.getProfile(identity, profile_url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Send a connection request (optionally with personal note)
// Body: { identity: 'matt', profile_url: '...', note: 'Hi X, ...' }
router.post('/connect', async (req, res) => {
  try {
    const { identity, profile_url, note } = req.body;
    if (!identity || !profile_url) {
      return res.status(400).json({ ok: false, error: 'identity and profile_url required' });
    }
    if (note && note.length > 300) {
      return res.status(400).json({ ok: false, error: 'note must be ≤ 300 characters' });
    }
    const result = await engine.sendConnection(identity, profile_url, note || null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Status endpoint — which identities are loaded, cookie count
router.get('/status', (req, res) => {
  const identities = cookieStore.list();
  res.json({
    ok: true,
    identity_count: identities.length,
    identities: identities.map(i => ({
      identity: i.identity,
      stale: i.stale,
      updated_at: i.updated_at,
      meta: i.meta
    }))
  });
});

export default router;
