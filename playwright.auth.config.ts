import { defineConfig,devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/auth-browser',fullyParallel:false,workers:2,timeout:60000,
  use:{baseURL:'https://localhost:3212',ignoreHTTPSErrors:true},
  webServer:process.env.VAULT_AUTH_EXTERNAL_FIXTURE==='1'?undefined:[
    {command:'pnpm --filter @vault/web exec next start --hostname 127.0.0.1 --port 3200',url:'http://127.0.0.1:3200',env:{VAULT_AUTH_ENABLED:'true'},reuseExistingServer:false},
    {command:'node tests/auth/browser-fixture.mjs',url:'https://localhost:3212/fixture/ready',ignoreHTTPSErrors:true,reuseExistingServer:false},
  ],
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome']}},
    {name:'webkit',testIgnore:'**/virtual.spec.ts',use:{...devices['Desktop Safari']}},
    {name:'firefox',testIgnore:'**/virtual.spec.ts',use:{...devices['Desktop Firefox']}},
    {name:'android-emulation',use:{...devices['Pixel 7']}},
    {name:'ios-emulation',testIgnore:'**/virtual.spec.ts',use:{...devices['iPhone 13']}},
  ],
});
