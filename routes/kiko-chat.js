// routes/kiko-chat.js — Kiko Chat API (migrated from Vercel)
// Wraps the Vercel handler for Express
import { Router } from "express";
const router = Router();

// Dynamic import of the Kiko handler (ESM)
router.post("/kiko", async (req, res) => {
  try {
    const { default: handler } = await import("../api/kiko.js");
    await handler(req, res);
  } catch (err) {
    console.error("[kiko-chat] Handler error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

router.post("/create-gmail-draft", async (req, res) => {
  try {
    const { default: handler } = await import("../api/create-gmail-draft.js");
    await handler(req, res);
  } catch (err) {
    console.error("[gmail-draft] Handler error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

router.get("/team-members", async (req, res) => {
  try {
    const { default: handler } = await import("../api/team-members.js");
    await handler(req, res);
  } catch (err) {
    if (!res.headersSent) res.json({ ok: true, members: [] });
  }
});

router.post("/rewrite-email", async (req, res) => {
  try {
    const { default: handler } = await import("../api/rewrite-email.js");
    await handler(req, res);
  } catch (err) {
    console.error("[rewrite-email] Handler error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

router.post("/file-extract", async (req, res) => {
  try {
    const { default: handler } = await import("../api/file-extract.js");
    await handler(req, res);
  } catch (err) {
    console.error("[file-extract] Handler error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

router.post("/kiko-task-create", async (req, res) => {
  try {
    const { default: handler } = await import("../api/kiko-task-create.js");
    await handler(req, res);
  } catch (err) {
    console.error("[kiko-task-create] Handler error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// Nested path handler — e.g. /api/admin/orgs
router.all("/:folder/:sub", async (req, res) => {
  const endpoint = req.params.folder + "/" + req.params.sub;
  const filePath = `../api/${endpoint}.js`;
  try {
    const { default: handler } = await import(filePath);
    await handler(req, res);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      if (!res.headersSent) res.status(404).json({ error: `Endpoint /api/${endpoint} not found` });
    } else {
      console.error(`[api-wildcard] Error in /api/${endpoint}:`, err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  }
});

// Wildcard handler — any /api/* endpoint that has a matching file in api/
router.all("/:endpoint", async (req, res) => {
  const endpoint = req.params.endpoint;
  const filePath = `../api/${endpoint}.js`;

  // ── Session 71 COST CIRCUIT BREAKER — runaway-automation failsafe ──
  // Every cron fires through this router. Each endpoint has a 24h run cap set
  // ~3x its legitimate frequency: normal operation never trips it, but a stuck
  // loop (the failure mode that caused past runaway API spend) gets hard-blocked
  // and raises ONE critical alert. Fail-open on check errors so a DB blip can
  // never take the platform down.
  if (endpoint.startsWith('cron-')) {
    try {
      const { sbFetch } = await import('../api/kiko-tools.js');
      const CAPS = { 'cron-job-processor': 400, 'cron-sequence-sender': 100, 'cron-gmail-sync': 100, 'cron-sequence-reply-detect': 60, 'cron-linkedin-monitor': 60, 'cron-heartbeat': 30 };
      const cap = CAPS[endpoint] || parseInt(process.env.CRON_DAILY_CAP_DEFAULT || '50', 10);
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const runs = await sbFetch(`kiko_cron_runs?endpoint=eq.${endpoint}&ran_at=gte.${since}&select=id&limit=${cap + 1}`);
      if (Array.isArray(runs) && runs.length >= cap) {
        console.error(`[circuit-breaker] ${endpoint}: ${runs.length} runs in 24h (cap ${cap}) — BLOCKED`);
        const pending = await sbFetch(`kiko_alerts?type=eq.cron_circuit_breaker&entity_name=eq.${endpoint}&dismissed=eq.false&select=id&limit=1`).catch(() => []);
        if (!pending?.length) {
          await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({ type: 'cron_circuit_breaker', severity: 'critical', title: `Circuit breaker tripped: ${endpoint}`, detail: `${endpoint} exceeded ${cap} runs in 24h — likely runaway loop. Blocked until the 24h window clears. Investigate before raising the cap.`, entity_type: 'system', entity_name: endpoint, dismissed: false }) }).catch(() => {});
        }
        return res.status(429).json({ error: 'circuit breaker: 24h run cap reached', endpoint, cap });
      }
      await sbFetch('kiko_cron_runs', { method: 'POST', body: JSON.stringify({ endpoint }) }).catch(() => {});
    } catch (cbErr) { console.error('[circuit-breaker] check failed (allowing):', cbErr.message); }
  }

  try {
    const { default: handler } = await import(filePath);
    await handler(req, res);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      if (!res.headersSent) res.status(404).json({ error: `Endpoint /api/${endpoint} not found` });
    } else {
      console.error(`[api-wildcard] Error in /api/${endpoint}:`, err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  }
});

export default router;
