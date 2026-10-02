import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:3200' },
  webServer: [
    { command: 'pnpm --filter @vault/web exec next dev --hostname 127.0.0.1 --port 3200', url: 'http://127.0.0.1:3200', reuseExistingServer: false },
    { command: 'pnpm --filter @vault/admin exec next dev --hostname 127.0.0.1 --port 3201', url: 'http://127.0.0.1:3201', reuseExistingServer: false },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'android-emulation', use: { ...devices['Pixel 7'] } },
    { name: 'ios-emulation', use: { ...devices['iPhone 13'] } },
  ],
});
