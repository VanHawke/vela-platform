import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:5199',
    headless: true,
  },
  webServer: {
    command: 'npx vite preview --port 5199 --strictPort',
    port: 5199,
    reuseExistingServer: false,
    timeout: 10000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
