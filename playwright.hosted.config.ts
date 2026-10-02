import { defineConfig } from '@playwright/test';
import local from './playwright.config';
import { assertSeparateOrigins } from './packages/shared/src';

const chat = process.env.CHAT_TEST_ORIGIN;
const admin = process.env.ADMIN_TEST_ORIGIN;
if (!chat || !admin) throw new Error('Set CHAT_TEST_ORIGIN and ADMIN_TEST_ORIGIN to the two hosted HTTPS origins.');
assertSeparateOrigins(chat, admin);
for (const value of [chat, admin]) {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Hosted test URLs must contain only an HTTPS origin, without credentials or paths.');
  }
}
export default defineConfig({
  ...local,
  webServer: undefined,
  metadata: { adminOrigin: new URL(admin).origin },
  use: { ...local.use, baseURL: new URL(chat).origin },
  workers: 2,
});
