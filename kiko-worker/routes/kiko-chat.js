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
