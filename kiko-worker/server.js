// kiko-worker/server.js
// Main Express server running on kiko-server (Hetzner VPS)
// Handles: Kiko Chat API + LinkedIn automation + heavy background jobs
// NO timeout limits — unlike Vercel's 120s cap

import express from "express";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import "dotenv/config";

import healthRoutes from "./routes/health.js";
import linkedinRoutes from "./routes/linkedin.js";
import linkedinQueueRoutes from "./routes/linkedin-queue.js";
import linkedinConnect from "./api/linkedin-connect.js";
import linkedinTrigger from "./api/linkedin-trigger.js";
import enrichLinkedinUrls from "./api/enrich-linkedin-urls.js";
import userBible from "./api/user-bible.js";
import orgBible from "./api/org-bible.js";
import emailIntelRoutes from "./routes/email-intel.js";
import kikoChatRoutes from "./routes/kiko-chat.js";
import webhookRoutes from "./routes/webhooks.js";
import gmailDraft from "./api/gmail-draft.js";
import gmailSend from "./api/gmail-send.js";
import captureCorrection from "./api/capture-correction.js";
import gmailSync from "./api/cron-gmail-sync.js";
import proactiveRecs from "./api/cron-proactive-recommendations.js";
import contactReenrich from "./api/cron-contact-reenrich.js";
import linkedinCookieImport from "./api/linkedin-cookie-import.js";
import teamMessages from "./api/team-messages.js";
import linkedinKeepalive from "./api/cron-linkedin-keepalive.js";
import documentOps from "./api/document-ops.js";
import { startMonitors } from "./monitors/scheduler.js";
import { startScheduler } from "./src/cron-scheduler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

const app = express();
const PORT = process.env.PORT || 3000;
const SHARED_SECRET = process.env.KIKO_WORKER_SECRET || "dev-secret-change-me";

// Body parser — 12mb for file uploads via Kiko
app.use(bodyParser.json({ limit: "12mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// Auth middleware — /api/* routes are PUBLIC (browser calls them directly)
// /linkedin/* routes require shared secret
app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/" || req.path.startsWith("/api/") || req.path.startsWith("/docs/") || req.path.startsWith("/linkedin-queue/") || req.path.startsWith("/email-intel/")) return next();
  const auth = req.headers["authorization"] || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token !== SHARED_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// Root
app.get("/", (req, res) => {
  res.type("text/plain").send(`kiko-worker v${pkg.version} - running\nEndpoints: /health, /api/kiko, /api/create-gmail-draft, /linkedin/*, /email-intel/*\n`);
});

// Routes — Kiko Chat API (no timeout limits!)
app.use("/docs", express.static("/home/kiko/kiko-worker/public/docs"));
app.use("/api/webhooks", webhookRoutes);
app.all("/api/user-bible", userBible);
app.all("/api/org-bible", orgBible);
app.post("/api/create-gmail-draft", gmailDraft);
app.post("/api/gmail-send", gmailSend);
app.post("/api/capture-correction", captureCorrection);
app.post("/api/cron-proactive-recommendations", proactiveRecs);
app.post("/api/cron-contact-reenrich", contactReenrich);
app.use("/api", kikoChatRoutes);

// Routes — existing
app.use("/", healthRoutes);
app.use("/linkedin", linkedinRoutes);
app.use("/linkedin-queue", linkedinQueueRoutes);
app.post("/linkedin-connect", linkedinConnect);
app.post("/api/linkedin-trigger", linkedinTrigger);
app.post("/api/enrich-linkedin-urls", enrichLinkedinUrls);
app.all("/api/team-messages", teamMessages);
app.all("/api/cron-gmail-sync", gmailSync);
app.post("/api/cron-linkedin-keepalive", linkedinKeepalive);
app.all("/api/document-ops", documentOps);

// Campaign sequence generation
import generateSequence from "./api/generate-sequence.js";
import campaignMonitor from "./api/cron-campaign-monitor.js";
import raceWeekIntel from "./api/cron-race-week-intel.js";
import morningSynthesis from "./api/cron-morning-synthesis.js";
app.all("/api/generate-sequence", generateSequence);
app.all("/api/cron-campaign-monitor", campaignMonitor);
app.all("/api/cron-race-week-intel", raceWeekIntel);
app.all("/api/cron-morning-synthesis", morningSynthesis);
app.use("/email-intel", emailIntelRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error("[error]", err);
  if (!res.headersSent) res.status(500).json({ error: err.message || "internal error" });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[kiko-worker] v${pkg.version} listening on 127.0.0.1:${PORT}`);
  console.log(`[kiko-worker] Kiko Chat API on /api/kiko (NO timeout limits)`);
  console.log(`[kiko-worker] Nginx proxies public traffic → this port`);
  startMonitors();
  startScheduler();
});

process.on("SIGTERM", () => { console.log("[kiko-worker] SIGTERM"); process.exit(0); });
