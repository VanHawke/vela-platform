// tests/api-smoke.spec.js — API endpoint smoke tests
// Run: npx playwright test tests/api-smoke.spec.js
// These verify critical API endpoints are responding correctly

import { test, expect } from '@playwright/test';

const BASE = 'https://kiko.vanhawke.agency';

test.describe('API Smoke Tests', () => {

  test('Homepage loads without errors', async ({ page }) => {
    const response = await page.goto(BASE);
    expect(response.status()).toBe(200);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('/api/kiko-health responds', async ({ request }) => {
    const res = await request.get(`${BASE}/api/kiko-health`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('status');
  });

  test('/api/kiko-self-knowledge responds', async ({ request }) => {
    const res = await request.get(`${BASE}/api/kiko-self-knowledge`);
    expect(res.status()).toBeLessThan(500);
  });

  test('/api/calendar-events requires email param', async ({ request }) => {
    const res = await request.get(`${BASE}/api/calendar-events`);
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('email');
  });

  test('/api/voice-preview rejects GET', async ({ request }) => {
    const res = await request.get(`${BASE}/api/voice-preview`);
    expect(res.status()).toBe(405);
  });

  test('/api/cron-knowledge-seed rejects GET', async ({ request }) => {
    const res = await request.get(`${BASE}/api/cron-knowledge-seed`);
    expect(res.status()).toBe(405);
  });

  test('Login page renders', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator('body')).toContainText(/sign in|log in|google/i);
  });

  test('Protected pages redirect to login when unauthenticated', async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    // Should redirect to login or show login
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/login|\/$/);
  });
});
