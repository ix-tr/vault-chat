import { test, expect } from '@playwright/test';

test('encrypted MLS state and replay protection survive Worker restart', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/state-harness.mjs';
    return (await import(path)).persistentScenario();
  });
  expect(result).toEqual({
    before: 'Before restart', after: 'After restart', replay: 'MESSAGE_REJECTED',
    wrongKeyResult: 'CRYPTO_STATE_FAILED', ciphertextChanged: true, outboxHasBoth: true,
    storedEncrypted: true, storedFields: ['ciphertext', 'iv', 'revision', 'version'],
  });
});
test('bounded decoding rejects malformed, wrong-kind and trailing input without a trap', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/state-harness.mjs';
    return (await import(path)).validationScenario();
  });
  expect(result).toEqual({
    malformed: 'INVALID_ENCODING', closed: 'WORKER_CLOSED', welcomeKind: 'WRONG_MESSAGE_KIND',
    trailing: 'TRAILING_BYTES', recovered: 'Not consumed by trailing input',
    oversized: 'INPUT_LIMIT', exportBlocked: 'UNSUPPORTED_OPERATION',
  });
});
test('existing OpenMLS update/removal APIs rotate the epoch and exclude a removed member', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/state-harness.mjs';
    return (await import(path)).membershipScenario();
  });
  expect(result).toEqual({ afterUpdate: 'After self update', afterRemoval: 'After removal', removedCannotRead: 'MESSAGE_REJECTED', members: [0, 1] });
});
test('two stale writers cannot both commit or release ciphertext', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/state-harness.mjs';
    return (await import(path)).concurrentScenario();
  });
  expect(result.fulfilled).toBe(1);
  expect(result.failure).toBe('STATE_CONFLICT');
  expect(['First writer', 'Second writer']).toContain(result.received);
  expect(result.after).toBe('After conflict');
  expect(result.outboxCount).toBe(5);
});
test('an aborted send saves neither state nor ciphertext and closes the Worker', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/state-harness.mjs';
    return (await import(path)).abortedSendScenario();
  });
  expect(result).toEqual({ failure: 'OUTBOX_FULL', closed: 'WORKER_CLOSED', sameRevision: true, sameOutboxCount: true, decoded: 'Restored from committed state' });
});
test('a reply lost after commit is recovered from the outbox without re-encrypting', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/state-harness.mjs';
    return (await import(path)).lostReplyScenario();
  });
  expect(result).toEqual({ lost: 'REPLY_LOST', recovered: 'Committed but reply lost', after: 'New generation after lost reply', outboxCount: 4 });
});
test('tampered or transplanted snapshots and missing restore state fail closed', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/state-harness.mjs';
    return (await import(path)).snapshotRejectionScenario();
  });
  expect(result).toEqual({ copied: 'CRYPTO_STATE_FAILED', tampered: 'CRYPTO_STATE_FAILED', missing: 'STATE_NOT_FOUND', rollback: 'STATE_ROLLBACK' });
});
