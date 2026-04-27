import dotenv from "dotenv";
dotenv.config();
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import * as cookieStore from "./lib/cookieStore.js";

chromium.use(StealthPlugin());
const stored = cookieStore.load("matt.smith");
const cookies = stored?.cookies;

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
  proxy: { server: "http://" + process.env.PROXY_HOST + ":" + process.env.PROXY_PORT, username: process.env.PROXY_USER, password: process.env.PROXY_PASS }
});
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  viewport: { width: 1440, height: 900 }
});
await ctx.addCookies(cookies);
const page = await ctx.newPage();

// Intercept API response to get member URN
let memberUrn = null;
page.on("response", async (response) => {
  const url = response.url();
  if (url.includes("/voyager/api/identity") && url.includes("sunny-sidhu")) {
    try {
      const json = await response.json();
      const mini = json?.included?.find(i => i.publicIdentifier === "sunny-sidhu-vanhawke");
      if (mini) memberUrn = mini.objectUrn || mini.entityUrn;
    } catch {}
  }
});

await page.goto("https://www.linkedin.com/in/sunny-sidhu-vanhawke/", { waitUntil: "networkidle", timeout: 40000 }).catch(() => {});
await page.waitForTimeout(3000);

console.log("Member URN from intercept:", memberUrn);

// Also try extracting from page HTML
if (!memberUrn) {
  const html = await page.content();
  const urnMatch = html.match(/urn:li:fsd_profile:([A-Za-z0-9_-]+)/);
  const memberMatch = html.match(/urn:li:member:(\d+)/);
  const acoMatch = html.match(/(ACoAA[A-Za-z0-9_-]+)/);
  console.log("fsd_profile URN:", urnMatch?.[0]);
  console.log("member URN:", memberMatch?.[0]);
  console.log("ACoAA ID:", acoMatch?.[1]);
  memberUrn = memberMatch?.[0] || (acoMatch?.[1] ? "urn:li:fs_miniProfile:" + acoMatch[1] : null);
}

if (!memberUrn) {
  console.log("Could not get member URN");
  await browser.close();
  process.exit(1);
}

console.log("Using URN:", memberUrn);

// Send message using XMLHttpRequest from page context (avoids fetch CORS issues)
const jsessionid = cookies.find(c => c.name === "JSESSIONID")?.value?.replace(/"/g, "");
const sendResult = await page.evaluate(async (urn, csrf) => {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://www.linkedin.com/voyager/api/messaging/conversations");
    xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
    xhr.setRequestHeader("csrf-token", csrf);
    xhr.setRequestHeader("x-restli-protocol-version", "2.0.0");
    xhr.onload = () => resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, body: xhr.responseText.slice(0, 200) });
    xhr.onerror = () => resolve({ error: "XHR error" });
    xhr.send(JSON.stringify({
      keyVersion: "LEGACY_INBOX",
      conversationCreate: {
        eventCreate: { value: { "com.linkedin.voyager.messaging.create.MessageCreate": {
          attributedBody: { text: "[TEST] Hi Sunny, automated test from Kiko via Matt. Best, Matt", attributes: [] },
          attachments: []
        }}},
        recipients: [urn],
        subtype: "MEMBER_TO_MEMBER"
      }
    }));
  });
}, memberUrn, jsessionid);

console.log("Send result:", JSON.stringify(sendResult));
if (sendResult?.ok) console.log("MESSAGE SENT!");

await browser.close();
process.exit(0);
