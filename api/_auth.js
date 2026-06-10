// api/_auth.js — Iron-clad authentication middleware for kiko-worker (Session 70, Jun 10 2026)
// A request is authenticated if its `Authorization: Bearer <x>` carries EITHER:
//   (1) the shared worker secret      → internal / cron / service calls (scheduler already sends this)
//   (2) a valid Supabase access token → browser/user calls; identity is DERIVED FROM THE TOKEN,
//       never from the request body (kills the spoofable `userEmail` field).
// A small allowlist of external-callback paths bypasses (OAuth redirect, Google webhook, health).
//
// AUTH_ENFORCE env flag:
//   unset / "false" → MONITOR MODE: verify if present, log coverage, but allow through (non-breaking).
//   "true"          → ENFORCE MODE: reject anything without valid credentials (401). Iron-clad.
// The flag is the break-glass: set false + `pm2 restart kiko-worker` instantly reverts to open.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const WORKER_SECRET = process.env.KIKO_WORKER_SECRET || "";
const ENFORCE = String(process.env.AUTH_ENFORCE || "").toLowerCase() === "true";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// 60s positive cache: token -> { user, exp }. Short TTL so revocation/logout takes effect fast.
const tokenCache = new Map();
const CACHE_TTL = 60_000, CACHE_MAX = 5000;

// External callbacks that authenticate themselves (OAuth state, Google channel token) — must stay open.
// public-branding is fetched by the LOGIN screen before any session exists, so it is public too.
const PUBLIC_PREFIXES = ["/health", "/docs/", "/api/google-auth", "/api/calendar-webhook", "/api/webhooks", "/api/public-branding"];
function isPublic(p) {
  if (p === "/" || p === "/health") return true;
  return PUBLIC_PREFIXES.some((pre) => p === pre || p.startsWith(pre));
}

// Internal service mesh: the worker binds ONLY to 127.0.0.1, so every EXTERNAL request
// arrives via nginx, which always stamps X-Forwarded-For + X-Real-IP. Internal
// service-to-service calls (scheduler, job-processor → source-prospects, linkedin-trigger,
// kiko-tools, etc.) hit loopback directly and carry NEITHER header. Absence of both,
// from a loopback socket, therefore identifies a trusted internal call — securing the
// entire internal mesh without editing every call site, and unspoofable from outside
// (nginx always appends the header, and the port is not externally reachable).
function isInternal(req) {
  const viaProxy = !!(req.headers["x-forwarded-for"] || req.headers["x-real-ip"]);
  if (viaProxy) return false;
  const ra = (req.socket && req.socket.remoteAddress) || "";
  return ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1";
}

// constant-time-ish compare for the shared secret
function constEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function verifyUser(token) {
  const hit = tokenCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const user = { id: data.user.id, email: (data.user.email || "").toLowerCase() };
  if (tokenCache.size > CACHE_MAX) tokenCache.clear();
  tokenCache.set(token, { user, exp: Date.now() + CACHE_TTL });
  return user;
}

export function requireAuth() {
  return async (req, res, next) => {
    if (isPublic(req.path)) return next();

    // Trusted internal service-to-service call (loopback, no proxy headers).
    if (isInternal(req)) {
      req.auth = { type: "internal" };
      return next();
    }

    const raw = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim();
    const deny = (msg) => {
      if (ENFORCE) return res.status(401).json({ error: msg });
      console.warn(`[auth] MONITOR allow (would 401: ${msg}) path=${req.path}`);
      return next();
    };

    try {
      if (!raw) return deny("authentication required");

      // (1) shared worker secret → internal/service path
      if (WORKER_SECRET && constEq(raw, WORKER_SECRET)) {
        req.auth = { type: "service" };
        return next();
      }

      // (2) Supabase user token → identity from token, not body
      const user = await verifyUser(raw);
      if (!user) return deny("invalid or expired session");

      req.auth = { type: "user", user };
      if (req.body && typeof req.body === "object") {
        req.body.userEmail = user.email;       // override spoofable field with verified identity
        req.body._verifiedUserId = user.id;
      }
      console.log(`[auth] ok user=${user.email} path=${req.path}`);
      return next();
    } catch (e) {
      console.error("[auth] error", e.message);
      return deny("auth check failed");
    }
  };
}

export default requireAuth;
