import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import * as cookieStore from "../lib/cookieStore.js";

chromium.use(StealthPlugin());

async function findLinkedInUrl(page, name, company) {
  try {
    const cleanCo = company.replace(/\(.*?\)/g, "").replace(/[^a-zA-Z0-9 ]/g, "").trim();
    const q = encodeURIComponent(name + " " + cleanCo);
    await page.goto("https://www.linkedin.com/search/results/people/?keywords=" + q + "&origin=GLOBAL_SEARCH_HEADER", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(2500 + Math.random() * 1500);
    const links = await page.$$eval("a", els => els.filter(e => { const h = e.getAttribute("href") || ""; return h.includes("/in/") && !h.includes("/search/") && e.offsetParent !== null; }).map(e => e.getAttribute("href") || ""));
    if (links.length > 0) {
      const slug = links[0].split("/in/")[1]?.split("?")[0]?.split("/")[0];
      if (slug) return "https://www.linkedin.com/in/" + slug;
    }
    return null;
  } catch (err) { console.error("[enrich] Error:", name, err.message.split("\n")[0]); return null; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const SB = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SK = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hdrs = { apikey: SK, Authorization: "Bearer " + SK };

  async function sbGet(path) { return (await fetch(SB + "/rest/v1/" + path, { headers: hdrs })).json(); }
  async function sbPatch(table, filter, data) {
    await fetch(SB + "/rest/v1/" + table + "?" + filter, { method: "PATCH", headers: { ...hdrs, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(data) });
  }

  // Accept direct prospect lookups from Kiko tool OR enrich existing enrollments
  const body = req.body || {};
  let targets;
  if (body.prospects && body.prospects.length > 0) {
    // Direct lookup mode — Kiko is asking for specific prospects
    targets = body.prospects.map((p, i) => ({ id: "direct_" + i, contact_name: p.name, contact_email: p.email || null, company: p.company || "" }));
  } else {
    // Database mode — enrich enrollments missing LinkedIn URLs
    targets = await sbGet("kiko_sequence_enrollments?linkedin_url=is.null&contact_name=not.is.null&select=id,contact_name,contact_email,company&limit=100");
  }
  if (!targets?.length) return res.json({ ok: true, enriched: 0, message: "All prospects have LinkedIn URLs" });
  console.log("[enrich] " + targets.length + " enrollments need LinkedIn URLs");

  const identities = cookieStore.list().filter(i => !i.stale);
  if (!identities.length) return res.json({ ok: false, error: "No LinkedIn sessions" });
  const id = identities.find(i => i.identity === "matt.smith") || identities[0];
  const stored = cookieStore.load(id.identity);
  if (!stored?.cookies?.length) return res.json({ ok: false, error: "No cookies" });

  let browser;
  try {
    const pH = process.env.PROXY_HOST, pP = process.env.PROXY_PORT;
    const opts = { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"] };
    if (pH && pP) opts.proxy = { server: "http://" + pH + ":" + pP, username: process.env.PROXY_USER, password: process.env.PROXY_PASS };
    browser = await chromium.launch(opts);
    const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", viewport: { width: 1440, height: 900 } });
    await ctx.addCookies(stored.cookies);
    const page = await ctx.newPage();

    let enriched = 0, failed = 0;
    const results = [];
    for (const t of targets) {
      const url = await findLinkedInUrl(page, t.contact_name, t.company || "");
      if (url) {
        if (!t.id.startsWith("direct_")) {
          await sbPatch("kiko_sequence_enrollments", "id=eq." + t.id, { linkedin_url: url });
          if (t.contact_email) await sbPatch("campaign_targets", "decision_maker_email=eq." + encodeURIComponent(t.contact_email), { decision_maker_linkedin: url });
        }
        enriched++;
        results.push({ name: t.contact_name, company: t.company, url });
        console.log("[enrich] OK " + t.contact_name + " -> " + url);
      } else {
        failed++;
        results.push({ name: t.contact_name, company: t.company, url: null });
        console.log("[enrich] MISS " + t.contact_name + " @ " + t.company);
      }
      await page.waitForTimeout(3000 + Math.random() * 3000);
    }
    await browser.close();
    return res.json({ ok: true, enriched, failed, total: targets.length, results });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return res.json({ ok: false, error: err.message });
  }
}
