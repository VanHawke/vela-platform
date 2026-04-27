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

await page.goto("https://www.linkedin.com/messaging/", { waitUntil: "commit", timeout: 40000 });
await page.waitForTimeout(5000);

const searchInput = page.locator('input[placeholder="Search messages"]');
if (await searchInput.count() > 0) {
  console.log("Found search input");
  await searchInput.click();
  await searchInput.fill("Sunny Sidhu");
  await page.waitForTimeout(2500);
  
  const result = page.locator('li').filter({ hasText: 'Sunny Sidhu' }).first();
  if (await result.count() > 0) {
    console.log("Found Sunny, clicking...");
    await result.click();
    await page.waitForTimeout(2500);
    console.log("URL:", page.url());
    
    const msgBox = page.locator('div.msg-form__contenteditable[contenteditable="true"]').first();
    const msgBox2 = page.locator('[role="textbox"]').last();
    const msgBox3 = page.locator('div[contenteditable="true"]').last();
    
    console.log("msg-form:", await msgBox.count(), "textbox:", await msgBox2.count(), "contenteditable:", await msgBox3.count());
    
    let typed = false;
    for (const box of [msgBox, msgBox2, msgBox3]) {
      if (await box.count() > 0) {
        await box.click();
        await page.waitForTimeout(300);
        await page.keyboard.type("[TEST] Hi Sunny, automated test from Kiko via Matt account.", { delay: 25 });
        typed = true;
        console.log("Typed message");
        break;
      }
    }
    
    if (typed) {
      await page.waitForTimeout(1000);
      const sendBtn = page.locator('button.msg-form__send-button').first();
      const sendBtn2 = page.locator('button:has-text("Send")').first();
      console.log("send-button:", await sendBtn.count(), "Send text:", await sendBtn2.count());
      
      for (const btn of [sendBtn, sendBtn2]) {
        if (await btn.count() > 0) {
          await btn.click();
          console.log("SENT!");
          await page.waitForTimeout(5000);
          break;
        }
      }
    }
  } else {
    console.log("Sunny not found in search");
  }
} else {
  console.log("No search input");
}

await page.screenshot({ path: "/tmp/li_final.png" });
await browser.close();
process.exit(0);
