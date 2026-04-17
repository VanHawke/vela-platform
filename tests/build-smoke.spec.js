// tests/build-smoke.spec.js — Build verification tests
// Verifies the app builds without errors and key files exist
// Run: npx playwright test tests/build-smoke.spec.js

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

test.describe('Build Smoke Tests', () => {

  test('npm run build completes without errors', () => {
    const result = execSync('npm run build 2>&1', { cwd: ROOT, timeout: 60000 }).toString();
    expect(result).toContain('built in');
    expect(result).not.toContain('ERROR');
  });

  test('dist directory exists after build', () => {
    expect(fs.existsSync(path.join(ROOT, 'dist'))).toBe(true);
  });

  test('dist/index.html exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'dist', 'index.html'))).toBe(true);
  });

  test('Critical API files exist', () => {
    const apiFiles = [
      'api/kiko.js', 'api/kiko-tools.js', 'api/kiko-self-knowledge.js',
      'api/kiko-health.js', 'api/google-token.js', 'api/calendar-events.js',
      'api/voice-preview.js', 'api/cron-knowledge-seed.js',
    ];
    for (const f of apiFiles) {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    }
  });

  test('KIKO_BIBLE.md exists', () => {
    const bible = path.join(ROOT, 'KIKO_BIBLE.md');
    expect(fs.existsSync(bible)).toBe(true);
    const content = fs.readFileSync(bible, 'utf-8');
    expect(content.length).toBeGreaterThan(100);
  });

  test('No TDZ violations in key files', () => {
    // Run the TDZ checker
    try {
      execSync('node scripts/check-tdz.mjs 2>&1', { cwd: ROOT, timeout: 15000 });
    } catch (e) {
      // If checker finds violations, it exits non-zero
      expect(e.stdout?.toString() || '').not.toContain('TDZ violation');
    }
  });
});
