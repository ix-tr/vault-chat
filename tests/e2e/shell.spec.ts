import { expect, test } from '@playwright/test';
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
 await expect(page.getByRole('button')).toHaveCount(0);
});

test('offline navigation shows only a generic shell', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your conversations. Your keys.' })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(async () => page.evaluate(async () => {
    const cache = await caches.open('vault-shell-v1');
    return (await cache.keys()).map(request => new URL(request.url).pathname);
  })).toEqual(['/offline']);
  await page.reload();
  await context.setOffline(true);
  await page.goto('/unavailable');
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
  await expect(page.getByText('No conversations are cached by this preview.', { exact: false })).toBeVisible();
});
