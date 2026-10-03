import { test, expect } from '@playwright/test';

test('official MLS WASM: separate workers, two/three members, replay and tamper rejection', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // Static spike module is JavaScript; the app never imports this harness.
    const modulePath = '/harness.mjs';
    const { runScenario } = await import(modulePath);
    return runScenario();
  });
  expect(result.decoded).toBe('Demo: hello Bob 👋');
  expect(result.replyDecoded).toBe('Hello Alice');
  expect(result.groupDecoded).toEqual(['Three-member demo', 'Three-member demo']);
  expect(result.replayRejected).toBe(true);
  expect(result.tamperRejected).toBe(true);
  expect(result.recovery).toBe('After rejection');
  expect(result.plaintextVisibleInCiphertext).toBe(false);
  expect(result.ciphertextBytes).toBeGreaterThan(32);
});

test('experimental upstream binding traps on malformed input', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const modulePath = '/harness.mjs';
    const { runScenario } = await import(modulePath);
    return runScenario('malformed');
  });
  expect(result).toEqual({ rejected: true, errorType: 'RuntimeError' });
});

test('WASM is blocked without an explicit worker CSP permission', async ({ page }) => {
  await page.goto('/blocked');
  const rejected = await page.evaluate(async () => {
    const modulePath = '/harness.mjs';
    const { runScenario } = await import(modulePath);
    try { await runScenario(); return false; } catch { return true; }
  });
  expect(rejected).toBe(true);
});
