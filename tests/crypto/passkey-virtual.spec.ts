import { test, expect } from '@playwright/test';

// CDP virtual CTAP2 authenticator: real browser WebAuthn calls, no physical device.
for (const hasPrf of [true, false]) {
  test(`virtual passkey ${hasPrf ? 'PRF unlock' : 'unsupported PRF password fallback'} survives reload`, async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf },
    });
    try {
      await page.goto('http://localhost:3210/');
      const saved = await page.evaluate(async () => {
        const helperPath = '/passkey-prf.mjs', cryptoPath = '/generated-unlock/credential-crypto.js', harnessPath = '/unlock-harness.mjs';
        const { evaluatePasskeyPrf } = await import(helperPath);
        const { createDeviceKey } = await import(cryptoPath);
        const { policy } = await import(harnessPath);
        const registration = await navigator.credentials.create({ publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { id: 'localhost', name: 'Vault demo' },
          user: { id: crypto.getRandomValues(new Uint8Array(32)), name: 'demo', displayName: 'Demo' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
          extensions: { prf: {} },
        } }) as PublicKeyCredential;
        const credentialId = new Uint8Array(registration.rawId), prfInput = crypto.getRandomValues(new Uint8Array(32));
        const assertion = await evaluatePasskeyPrf({ challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: 'localhost', credentialId, prfInput });
        const binding = { origin: location.origin, accountId: 'virtual-fixture', deviceId: 'virtual-device', signaturePublicKey: new Uint8Array(32).fill(7) };
        const credential = assertion.supported ? assertion.credential : { kind: 'passphrase', passphrase: new TextEncoder().encode('demo-only-long-passphrase') };
        const created = await createDeviceKey(credential, binding, policy);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, created.key, new TextEncoder().encode('Opened after virtual passkey reload'));
        return { supported: assertion.supported, envelope: created.envelope, credentialId: Array.from(credentialId), prfInput: Array.from(prfInput), iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)), serverKeys: Object.keys(assertion.serverAssertion).sort() };
      });
      expect(saved.supported).toBe(hasPrf);
      expect(saved.serverKeys).toEqual(['id', 'rawId', 'response', 'type']);
      expect(saved.envelope.method.name).toBe(hasPrf ? 'webauthn-prf-hkdf-sha256' : 'argon2id13');
      await page.reload();
      const result = await page.evaluate(async (state) => {
        const helperPath = '/passkey-prf.mjs', cryptoPath = '/generated-unlock/credential-crypto.js', harnessPath = '/unlock-harness.mjs';
        const { evaluatePasskeyPrf } = await import(helperPath), { unwrapDeviceKey } = await import(cryptoPath), { policy } = await import(harnessPath);
        const assertion = await evaluatePasskeyPrf({ challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: 'localhost', credentialId: new Uint8Array(state.credentialId), prfInput: new Uint8Array(state.prfInput) });
        const credential = assertion.supported ? assertion.credential : { kind: 'passphrase', passphrase: new TextEncoder().encode('demo-only-long-passphrase') };
        const key = await unwrapDeviceKey(state.envelope, credential, state.envelope.binding, policy);
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(state.iv) }, key, new Uint8Array(state.ciphertext));
        return { decoded: new TextDecoder().decode(plaintext), nonextractable: !key.extractable };
      }, saved);
      expect(result).toEqual({ decoded: 'Opened after virtual passkey reload', nonextractable: true });
    } finally {
      await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
      await cdp.detach();
    }
  });
}
