import { test, expect } from '@playwright/test';

test('Argon2id unlock restores genuine MLS state after full page reload', async ({ page }) => {
  await page.goto('/');
  const saved = await page.evaluate(async () => { const path = '/unlock-harness.mjs'; return (await import(path)).prepareReload(); });
  expect(saved.before).toBe('Before full reload');
  await page.reload();
  const result = await page.evaluate(async (state) => { const path = '/unlock-harness.mjs'; return (await import(path)).afterReload(state); }, saved);
  expect(result).toEqual({ replay: 'MESSAGE_REJECTED', after: 'After full reload', publicKeyBytes: 32 });
});
test('incorrect credentials, device binding, cost policy and damaged envelopes fail closed', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => { const path = '/unlock-harness.mjs'; return (await import(path)).rejectionScenario(); });
  expect(result).toEqual({ wrongPassword: 'UNLOCK_FAILED', wrongDevice: 'WRONG_DEVICE_BINDING', wrongOrigin: 'WRONG_UNLOCK_ORIGIN', policyRejected: 'KDF_POLICY', tamper: 'UNLOCK_FAILED', missing: 'UNLOCK_RECORD_MISSING' });
});
test('synthetic PRF output wraps a nonextractable key without password downgrade', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => { const path = '/unlock-harness.mjs'; return (await import(path)).primitiveScenario(); });
  expect(result).toEqual({ decoded: 'Synthetic PRF fixture', nonextractable: true, noFallback: 'PRF_REQUIRED' });
});
test('PRF helper requires user verification and keeps extension secrets out of server payload', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/passkey-prf.mjs';
    const { evaluatePasskeyPrf } = await import(path);
    const rawId = new Uint8Array([1, 2, 3]);
    const input = { challenge: new Uint8Array(32), rpId: 'localhost', credentialId: rawId, prfInput: new Uint8Array(32) };
    let required = false;
    const authData = new Uint8Array(37); authData[32] = 5;
    const makeAssertion = (prf: boolean) => ({ id: 'AQID', type: 'public-key', rawId: rawId.buffer, response: { authenticatorData: authData.buffer, clientDataJSON: new ArrayBuffer(0), signature: new ArrayBuffer(0), userHandle: null }, getClientExtensionResults: () => prf ? { prf: { results: { first: new Uint8Array(32).fill(99).buffer } } } : {} });
    const supported = await evaluatePasskeyPrf(input, async (options: { publicKey: { userVerification: string } }) => { required = options.publicKey.userVerification === 'required'; return makeAssertion(true); });
    const absent = await evaluatePasskeyPrf(input, async () => makeAssertion(false));
    authData[32] = 0;
    let denied = '';
    try { await evaluatePasskeyPrf(input, async () => makeAssertion(true)); } catch (error) { denied = (error as Error).message; }
    return { required, supported: supported.supported, absent: absent.supported, denied, keys: Object.keys(supported.serverAssertion).sort() };
  });
  expect(result).toEqual({ required: true, supported: true, absent: false, denied: 'USER_VERIFICATION_REQUIRED', keys: ['id', 'rawId', 'response', 'type'] });
});
test('public device directory matching rejects changed keys and duplicate identities', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/device-identity.mjs';
    const { deviceIdentity, matchMemberDirectory } = await import(path);
    const binding = { accountId: 'demo-user', deviceId: 'demo-device', signaturePublicKey: new Uint8Array(32).fill(7) };
    const policy = { maxIdentityBytes: 128, maxDirectoryEntries: 64 };
    const member = [0, new TextEncoder().encode(deviceIdentity(binding, policy.maxIdentityBytes)), binding.signaturePublicKey];
    const matched = matchMemberDirectory([member], [binding], policy);
    let changed = '', duplicate = '';
    try { matchMemberDirectory([member], [{ ...binding, signaturePublicKey: new Uint8Array(32).fill(8) }], policy); } catch (error) { changed = (error as Error).message; }
    try { matchMemberDirectory([member], [binding, binding], policy); } catch (error) { duplicate = (error as Error).message; }
    return { accountId: matched[0].accountId, deviceId: matched[0].deviceId, changed, duplicate };
  });
  expect(result).toEqual({ accountId: 'demo-user', deviceId: 'demo-device', changed: 'UNVERIFIED_DEVICE', duplicate: 'INVALID_DEVICE_DIRECTORY' });
});
