import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
for(const width of [360,390,768,1280])test(`shell fits ${width}px and theme toggles`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto('/');
 await expect(page.getByRole('heading',{name:'Your conversations. Your keys.'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Toggle theme'}).click();await expect(page.locator('.shell')).toHaveClass(/dark/);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('button',{name:'Request persistent storage'})).toBeVisible();
});
test('admin preview denies actions and returns hardened headers',async({page}, testInfo)=>{
 const adminOrigin = testInfo.config.metadata.adminOrigin ?? 'http://127.0.0.1:3201';
 const response=await page.goto(adminOrigin);
 await expect(page.getByText('Administrative actions are unavailable.',{exact:false})).toBeVisible();
 expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
 await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
 await expect(page.getByRole('main').locator('form,input')).toHaveCount(0);
});

test('offline navigation shows only a generic shell', async ({ page, context }) => {
  test.skip(page.context().browser()?.browserType().name() !== 'chromium', 'Browser offline emulation does not reliably affect service-worker fetches outside Chromium; the unavailable-network test covers all engines.');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your conversations. Your keys.' })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(async () => page.evaluate(async () => {
    const cache = await caches.open('vault-shell-v2');
    return (await cache.keys()).map(request => new URL(request.url).pathname);
  })).toEqual(['/offline.html']);
  await page.reload();
  await context.setOffline(true);
  await page.goto('/unavailable');
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
  await expect(page.getByText('No conversations are cached by this preview.', { exact: false })).toBeVisible();
});

test('storage denial shows the eviction and backup warning', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persist', { value: async () => false });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Request persistent storage' }).click();
  await expect(page.getByRole('status')).toContainText('Browser storage can be evicted');
  await expect(page.getByRole('status')).toContainText('encrypted backup will be available in a later phase');
  await expect(page.getByText('If your browser has no install button', { exact: false })).toBeVisible();
});

test('theme control supports keyboard navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.shell')).toHaveClass(/dark/);
});

test('service worker controls the first visit and serves a standalone fallback after closing and reopening', async ({ page, context }, testInfo) => {
  const upstream = testInfo.project.use.baseURL;
  if (!upstream) throw new Error('A chat baseURL is required.');
  let unavailable = false;
  let serverError = false;
  const server = createServer(async (request, response) => {
    if (unavailable) { request.socket.destroy(); return; }
    if (serverError) { response.writeHead(503).end(); return; }
    try {
      const result = await fetch(new URL(request.url ?? '/', upstream), { redirect: 'manual', signal: AbortSignal.timeout(10000) });
      response.statusCode = result.status;
      for (const [name, value] of result.headers) {
        if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(name)) response.setHeader(name, value);
      }
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.destroy(); }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a loopback test port.');
    const origin = `http://127.0.0.1:${address.port}`;
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: 'Your conversations. Your keys.' })).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(async () => (await (await caches.open('vault-shell-v2')).keys()).map(request => new URL(request.url).pathname))).toEqual(['/offline.html']);
    // First visit becomes controlled without a reload. Close every page at
    // this origin, cut the real network, and start a new page in the same store.
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.close();
    unavailable = true;
    let reopened = await context.newPage();
    try {
      const response = await reopened.goto(origin);
      expect(response?.status()).toBe(200);
      await expect(reopened.getByRole('heading', { name: 'You are offline' })).toBeVisible();
      await expect(reopened.getByText('No conversations are cached by this preview.', { exact: false })).toBeVisible();
      expect(await reopened.locator('script,link[rel="stylesheet"],img').count()).toBe(0);
      expect(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await reopened.close();
      unavailable = false;
      serverError = true;
      reopened = await context.newPage();
      const failure = await reopened.goto(origin);
      // Upstream returns 503; cached HTML must return 200 and render below.
      expect(failure?.status()).toBe(200);
      await expect(reopened.getByRole('heading', { name: 'You are offline' })).toBeVisible();
      serverError = false;
      await reopened.getByRole('link', { name: 'Try again' }).click();
      await expect(reopened.getByRole('heading', { name: 'Your conversations. Your keys.' })).toBeVisible();
    } finally { await reopened.close(); }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
