// cron-linkedin-keepalive.js — Keeps LinkedIn sessions warm
// Runs every 6 hours. Visits LinkedIn /feed/ with each identity cookies.
// Captures rotated cookies after each visit. Prevents session expiry.
// This is what Dripify/Expandi do to keep cloud sessions alive.
import { verifyIdentity } from "../lib/linkedinEngine.js";
import * as cookieStore from "../lib/cookieStore.js";

export default async function handler(req, res) {
  const identities = ["sunny", "matt.smith"];
  const results = [];
  
  for (const identity of identities) {
    try {
      const stored = cookieStore.load(identity);
      if (!stored || !stored.cookies || stored.cookies.length < 3) {
        results.push({ identity, status: "skipped", reason: "no full cookie set" });
        continue;
      }
      if (stored.stale) {
        results.push({ identity, status: "skipped", reason: "marked stale" });
        continue;
      }
      
      console.log(`[keepalive] Warming session for ${identity} (${stored.cookies.length} cookies)`);
      const result = await verifyIdentity(identity);
      
      if (result.ok && result.authenticated) {
        results.push({ identity, status: "alive", authenticated: true });
        console.log(`[keepalive] ✓ ${identity} session is alive`);
      } else {
        results.push({ identity, status: "stale", error: result.error });
        console.log(`[keepalive] ✗ ${identity} session expired: ${result.error}`);
        cookieStore.markStale(identity);
      }
    } catch (err) {
      results.push({ identity, status: "error", error: err.message });
      console.error(`[keepalive] Error for ${identity}:`, err.message);
    }
  }
  
  return res.json({ ok: true, results });
}
