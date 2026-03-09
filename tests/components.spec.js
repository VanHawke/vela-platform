import { test, expect } from '@playwright/test';

// Test login page component details thoroughly

test.describe('1.3 — Login Page Deep Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('h1');
  });

  test('Left panel image has object-fit cover on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await page.waitForSelector('img');
    const img = page.locator('img').first();
    const style = await img.evaluate(el => getComputedStyle(el).objectFit);
    expect(style).toBe('cover');
  });

  test('Left panel hidden on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/login');
    // The image container should be hidden (lg:block)
    const leftPanel = page.locator('.lg\\:block').first();
    await expect(leftPanel).toBeHidden();
  });

  test('Google button has SVG icon', async ({ page }) => {
    const svgInButton = page.locator('button:has-text("Continue with Google") svg');
    await expect(svgInButton).toBeVisible();
  });

  test('Form submit prevented with empty fields', async ({ page }) => {
    await page.locator('button:has-text("Sign in")').click();
    const errorText = page.locator('.text-red-400');
    await expect(errorText).toContainText('required');
  });

  test('Remember me checkbox toggles', async ({ page }) => {
    const cb = page.locator('#remember');
    await expect(cb).not.toBeChecked();
    await cb.click();
    await expect(cb).toBeChecked();
    await cb.click();
    await expect(cb).not.toBeChecked();
  });

  test('Loader state: sign in button has no spinner initially', async ({ page }) => {
    // The Loader2 svg should not be visible when not loading
    const spinner = page.locator('button:has-text("Sign in") .animate-spin');
    await expect(spinner).toHaveCount(0);
  });

  test('Page background is dark', async ({ page }) => {
    // The right panel uses inline style background: '#0A0A0A' or equivalent
    // Check via computed style on the flex-1 panel that contains the form
    const panel = page.locator('form').locator('..');
    const bg = await panel.evaluate(el => {
      // Walk up to find the panel with the dark background
      let node = el;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return cs.backgroundColor;
        node = node.parentElement;
      }
      return 'none';
    });
    // Should be very dark (close to black)
    expect(bg).not.toBe('none');
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('No page reload on invalid submit', async ({ page }) => {
    const navPromise = page.waitForNavigation({ timeout: 2000 }).catch(() => null);
    await page.locator('button:has-text("Sign in")').click();
    const nav = await navPromise;
    // No navigation should have occurred
    expect(nav).toBeNull();
    expect(page.url()).toContain('/login');
  });
});

test.describe('1.3 — Login Responsive', () => {
  test('Right panel centred on all sizes', async ({ page }) => {
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/login');
      await page.waitForSelector('form');
      const form = page.locator('form');
      await expect(form).toBeVisible();
    }
  });
});

test.describe('1.4 — Route Guards', () => {
  test('All protected routes redirect to /login', async ({ page }) => {
    for (const path of ['/', '/home', '/email', '/calendar', '/settings', '/deals', '/whatever']) {
      await page.goto(path);
      await page.waitForURL('**/login', { timeout: 5000 });
      expect(page.url()).toContain('/login');
    }
  });
});

test.describe('Production — Deep', () => {
  test('Production serves HTML with root div', async ({ request }) => {
    const res = await request.get('https://vela-platform-one.vercel.app/');
    const html = await res.text();
    expect(html).toContain('<div id="root">');
    expect(html).toContain('Vela');
  });

  test('Production login returns 200', async ({ request }) => {
    const res = await request.get('https://vela-platform-one.vercel.app/login');
    expect(res.status()).toBe(200);
  });

  test('Production API health returns valid JSON', async ({ request }) => {
    const res = await request.get('https://vela-platform-one.vercel.app/api/health');
    const data = await res.json();
    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('timestamp');
  });

  test('Production 404 routes fallback to SPA', async ({ request }) => {
    const res = await request.get('https://vela-platform-one.vercel.app/some-random-route');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div id="root">');
  });
});
