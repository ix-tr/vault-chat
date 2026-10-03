import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/crypto',
  timeout: 60000,
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:3210' },
  webServer: { command: 'node spikes/crypto/server.mjs', url: 'http://127.0.0.1:3210', reuseExistingServer: false },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'android-emulation', use: { ...devices['Pixel 7'] } },
    { name: 'ios-emulation', use: { ...devices['iPhone 13'] } },
  ],
});
