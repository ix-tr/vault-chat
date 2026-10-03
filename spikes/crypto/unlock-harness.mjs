// Demo credentials and policy only; never imported by production apps.
import { failureCode } from './state-harness.mjs';
import { openStore, readUnlockEnvelope } from './state-store.mjs';
export const policy = { minPasswordBytes: 12, maxPasswordBytes: 1024, minOps: 3, maxOps: 4, minMemoryBytes: 67108864, maxMemoryBytes: 67108864, createOps: 3, createMemoryBytes: 67108864, maxIdentityBytes: 128, maxDirectoryEntries: 64, maxCredentialBytes: 1024 };
const encode = (value) => new TextEncoder().encode(value);
const limits = { maxWireBytes: 1048576, maxSnapshotBytes: 8388608, maxOutbox: 64 };
export async function client(namespace, options = {}) {
  const worker = new Worker('/state-worker.mjs', { type: 'module' });
  let seq = 0;
  const call = (op, value) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('TIMEOUT')); }, 30000);
    worker.onmessage = ({ data }) => { if (data.id === id) { clearTimeout(timer); if (data.ok) resolve(data.result); else reject(new Error(data.code)); } };
    worker.onerror = () => { clearTimeout(timer); reject(new Error('WORKER_FAILED')); };
    worker.postMessage({ id, op, value });
  });
  try {
    const identity = await call('init', { namespace, limits, cryptoPolicy: policy, binding: { origin: self.location.origin, accountId: 'demo-account', deviceId: namespace, ...options.binding }, credentials: { kind: 'passphrase', passphrase: encode(options.password ?? 'demo-only-long-passphrase') }, restoreOnly: options.restoreOnly ?? false });
    return { call, identity, close: () => worker.terminate() };
  } catch (error) { worker.terminate(); throw error; }
}
export async function prepareReload() {
  const aliceName = crypto.randomUUID(), bobName = crypto.randomUUID();
  const alice = await client(aliceName), bob = await client(bobName);
  try {
    await alice.call('create', encode('credential-reload-group'));
    const added = await alice.call('add', await bob.call('keyPackage'));
    await bob.call('join', added);
    const wire = await alice.call('send', encode('Before full reload'));
    const before = new TextDecoder().decode(await bob.call('receive', wire));
    return { aliceName, bobName, wire: Array.from(wire), before };
  } finally { alice.close(); bob.close(); }
}
export async function afterReload(saved) {
  const alice = await client(saved.aliceName, { restoreOnly: true });
  let bob = await client(saved.bobName, { restoreOnly: true });
  try {
    const replay = await failureCode(() => bob.call('receive', new Uint8Array(saved.wire)));
    bob.close(); bob = await client(saved.bobName, { restoreOnly: true });
    const next = await alice.call('send', encode('After full reload'));
    return { replay, after: new TextDecoder().decode(await bob.call('receive', next)), publicKeyBytes: alice.identity.signaturePublicKey.length };
  } finally { alice.close(); bob.close(); }
}
async function mutate(namespace, change) {
  const db = await openStore(namespace);
  try {
    const envelope = await readUnlockEnvelope(db);
    await new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      if (change) tx.objectStore('state').put(change(envelope), 'unlock'); else tx.objectStore('state').delete('unlock');
      tx.oncomplete = resolve; tx.onabort = reject;
    });
  } finally { db.close(); }
}
export async function rejectionScenario() {
  const namespace = crypto.randomUUID();
  (await client(namespace)).close();
  const wrongPassword = await failureCode(() => client(namespace, { password: 'different-long-passphrase', restoreOnly: true }));
  const wrongDevice = await failureCode(() => client(namespace, { binding: { deviceId: 'other-device' }, restoreOnly: true }));
  const wrongOrigin = await failureCode(() => client(namespace, { binding: { origin: 'https://admin.example.invalid' }, restoreOnly: true }));
  (await client(namespace, { restoreOnly: true })).close();
  await mutate(namespace, (envelope) => ({ ...envelope, method: { ...envelope.method, memoryBytes: 1 } }));
  const policyRejected = await failureCode(() => client(namespace, { restoreOnly: true }));
  await mutate(namespace, (envelope) => ({ ...envelope, method: { ...envelope.method, memoryBytes: policy.createMemoryBytes }, ciphertext: envelope.ciphertext.map((b, i) => i ? b : b ^ 1) }));
  const tamper = await failureCode(() => client(namespace, { restoreOnly: true }));
  await mutate(namespace);
  const missing = await failureCode(() => client(namespace, { restoreOnly: true }));
  return { wrongPassword, wrongDevice, wrongOrigin, policyRejected, tamper, missing };
}
export async function primitiveScenario() {
  const { createDeviceKey, unwrapDeviceKey } = await import('./generated-unlock/credential-crypto.js');
  const binding = { origin: self.location.origin, accountId: 'fixture-account', deviceId: 'fixture-device', signaturePublicKey: new Uint8Array(32).fill(7) };
  // Synthetic PRF output tests HKDF/wrapping only, not an authenticator.
  const credential = () => ({ kind: 'prf', result: new Uint8Array(32).fill(23), credentialId: new Uint8Array([1, 2, 3]), prfInput: new Uint8Array(32).fill(11) });
  const created = await createDeviceKey(credential(), binding, policy);
  const restored = await unwrapDeviceKey(created.envelope, credential(), binding, policy);
  const iv = new Uint8Array(12);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, created.key, encode('Synthetic PRF fixture'));
  const decoded = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, restored, encrypted));
  const noFallback = await failureCode(() => unwrapDeviceKey(created.envelope, { kind: 'passphrase', passphrase: encode('demo-only-long-passphrase') }, binding, policy));
  return { decoded, nonextractable: !created.key.extractable && !restored.extractable, noFallback };
}
