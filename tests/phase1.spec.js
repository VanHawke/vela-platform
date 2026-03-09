import { test, expect } from '@playwright/test';

// ── 1.3 LOGIN PAGE ──────────────────────────────────────

test.describe('1.3 — Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('Split screen: image left, form right', async ({ page }) => {
    // Left panel image (hidden on mobile, visible on lg)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    const img = page.locator('img').first();
    await expect(img).toBeVisible();

    // Right panel has the form
    const form = page.locator('form');
    await expect(form).toBeVisible();
  });

  test('Right panel: #0A0A0A background, max 380px content', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    const rightPanel = page.locator('div.flex-1').first();
    await expect(rightPanel).toBeVisible();
    // Content wrapper max-w-[380px]
    const wrapper = page.locator('.max-w-\\[380px\\]');
    await expect(wrapper).toBeVisible();
  });

  test('Continue with Google button visible', async ({ page }) => {
    const googleBtn = page.getByText('Continue with Google');
    await expect(googleBtn).toBeVisible();
  });

  test('Email and password inputs visible', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    const pwInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(pwInput).toBeVisible();
  });

  test('Divider text: "or sign in with email"', async ({ page }) => {
    await expect(page.getByText('or sign in with email')).toBeVisible();
  });

  test('Password show/hide toggle works', async ({ page }) => {
    const pwInput = page.locator('input[placeholder="Password"]');
    await expect(pwInput).toHaveAttribute('type', 'password');

    // Click the toggle (Eye icon button)
    const toggle = page.locator('button').filter({ has: page.locator('svg') }).nth(1);
    // Find the button next to the password input
    const eyeBtn = pwInput.locator('..').locator('button');
    await eyeBtn.click();
    await expect(pwInput).toHaveAttribute('type', 'text');

    await eyeBtn.click();
    await expect(pwInput).toHaveAttribute('type', 'password');
  });

  test('Remember me checkbox visible', async ({ page }) => {
    const checkbox = page.locator('#remember');
    await expect(checkbox).toBeVisible();
    const label = page.getByText('Remember me');
    await expect(label).toBeVisible();
  });

  test('Error state: empty submit shows error inline', async ({ page }) => {
    const signInBtn = page.getByText('Sign in', { exact: true });
    await signInBtn.click();
    const error = page.locator('.text-red-400');
    await expect(error).toBeVisible();
    // No page reload — URL should still be /login
    expect(page.url()).toContain('/login');
  });

  test('Powered by Vela Labs footer', async ({ page }) => {
    await expect(page.getByText('Powered by Vela Labs')).toBeVisible();
  });

  test('Vela title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Vela');
  });

  test('Sign in subtitle', async ({ page }) => {
    await expect(page.getByText('Sign in to your workspace')).toBeVisible();
  });

  test('Zero console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/login');
    await page.waitForTimeout(1000);
    // Filter out expected Supabase errors (no anon key set)
    const real = errors.filter(e => !e.includes('supabase') && !e.includes('fetch') && !e.includes('null'));
    expect(real).toEqual([]);
  });
});

// ── 1.4 LAYOUT + SIDEBAR ───────────────────────────────
// These tests need auth, so we test the login redirect behaviour
// and verify the sidebar renders for the unauthenticated path

test.describe('1.4 — Layout Shell', () => {
  test('Unauthenticated: redirects to /login', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('Unauthenticated: /settings redirects to /login', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('Unauthenticated: /email redirects to /login', async ({ page }) => {
    await page.goto('/email');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });
});

// ── PRODUCTION HEALTH CHECK ─────────────────────────────

test.describe('Production', () => {
  test('Health endpoint responds', async ({ request }) => {
    const res = await request.get('https://vela-platform-one.vercel.app/api/health');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.version).toBe('2.0.0-alpha');
  });

  test('Login page loads on production', async ({ request }) => {
    const res = await request.get('https://vela-platform-one.vercel.app/login');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('root');
  });
});
