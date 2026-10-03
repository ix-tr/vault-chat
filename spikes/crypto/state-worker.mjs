// Evaluation only. Private serialized MLS state is encrypted inside this Worker.
import init, { Provider, Identity, Group, KeyPackage } from './generated-adapter/openmls_wasm.js';
import { openStore, readState, commitState, readOutbox, readUnlockEnvelope } from './state-store.mjs';

let provider, identity, group, db, key, name, namespace, limits;
let pendingEnvelope;
let revision = 0;
let failed = false;
let queue = Promise.resolve();
const ready = init();
const text = new TextEncoder();
const fromText = new TextDecoder('utf-8', { fatal: true });
const aad = (rev) => text.encode(JSON.stringify(['vault-mls-state', namespace, 1, rev]));
function bytes(value) {
  if (!(value instanceof Uint8Array) || value.length === 0 || value.length > limits.maxWireBytes) throw new Error('INPUT_LIMIT');
  return value;
}
function config(value) {
  for (const field of ['maxWireBytes', 'maxSnapshotBytes', 'maxOutbox']) {
    if (!Number.isSafeInteger(value?.[field]) || value[field] <= 0 || value[field] > 0xffffffff) throw new Error('INVALID_LIMITS');
  }
  if (value.maxSnapshotBytes < value.maxWireBytes) throw new Error('INVALID_LIMITS');
  return value;
}
async function save(outbound = []) {
  if (!Number.isSafeInteger(revision + 1)) throw new Error('REVISION_EXHAUSTED');
  const storageBytes = provider.snapshot();
  let plaintext;
  try {
    plaintext = text.encode(JSON.stringify({
      version: 1, name, publicKey: Array.from(identity.public_key()),
      groupId: group ? Array.from(group.group_id()) : null,
      store: fromText.decode(storageBytes),
    }));
    if (plaintext.length > limits.maxSnapshotBytes) throw new Error('SNAPSHOT_LIMIT');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(revision + 1) }, key, plaintext);
    await commitState(db, revision, { version: 1, revision: revision + 1, iv, ciphertext }, outbound, limits.maxOutbox, pendingEnvelope);
    pendingEnvelope = undefined;
    revision++;
  } finally {
    storageBytes.fill(0);
    plaintext?.fill(0);
  }
}
async function start(value) {
  if (db) throw new Error('ALREADY_INITIALIZED');
  limits = config(value.limits);
  if (typeof value.namespace !== 'string' || text.encode(value.namespace).length === 0 || text.encode(value.namespace).length > limits.maxWireBytes) throw new Error('INPUT_LIMIT');
  namespace = value.namespace;
  db = await openStore(namespace);
  const record = await readState(db);
  let credentialModule, canonicalName, envelope;
  if (value.credentials) {
    if (value.key) throw new Error('INVALID_UNLOCK_KEY');
    credentialModule = await import('./generated-unlock/credential-crypto.js');
    const { deviceIdentity } = await import('./device-identity.mjs');
    const policy = credentialModule.unlockPolicy(value.cryptoPolicy);
    canonicalName = deviceIdentity(value.binding, policy.maxIdentityBytes);
    envelope = await readUnlockEnvelope(db);
    if (record) {
      if (!envelope) throw new Error('UNLOCK_RECORD_MISSING');
      key = await credentialModule.unwrapDeviceKey(envelope, value.credentials, value.binding, policy);
    } else if (envelope) throw new Error('STATE_NOT_FOUND');
  } else {
    key = value.key;
  }
  if (record || !value.credentials) {
    if (!(key instanceof CryptoKey) || key.extractable || key.type !== 'secret' || key.algorithm.name !== 'AES-GCM' || key.algorithm.length !== 256 || !key.usages.includes('encrypt') || !key.usages.includes('decrypt')) throw new Error('INVALID_UNLOCK_KEY');
  }
  if (record) {
    if (record.version !== 1 || !Number.isSafeInteger(record.revision) || record.revision <= 0 || !(record.iv instanceof Uint8Array) || record.iv.length !== 12 || !(record.ciphertext instanceof ArrayBuffer) || record.ciphertext.byteLength > limits.maxSnapshotBytes + 16) throw new Error('INVALID_SNAPSHOT');
    let plaintext;
    let storeBytes;
    try {
      plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv, additionalData: aad(record.revision) }, key, record.ciphertext));
      const snapshot = JSON.parse(fromText.decode(plaintext));
      if (snapshot.version !== 1 || typeof snapshot.name !== 'string' || typeof snapshot.store !== 'string') throw new Error('INVALID_SNAPSHOT');
      name = snapshot.name;
      if (canonicalName && (name !== canonicalName || JSON.stringify(snapshot.publicKey) !== JSON.stringify(envelope.binding.signaturePublicKey))) throw new Error('WRONG_DEVICE_BINDING');
      storeBytes = text.encode(snapshot.store);
      provider = Provider.restore(storeBytes, limits.maxWireBytes, limits.maxSnapshotBytes);
      identity = Identity.restore(provider, name, bytes(new Uint8Array(snapshot.publicKey)));
      group = snapshot.groupId ? Group.load(provider, bytes(new Uint8Array(snapshot.groupId))) : undefined;
      revision = record.revision;
    } finally { plaintext?.fill(0); storeBytes?.fill(0); }
  } else {
    if (value.restoreOnly) throw new Error('STATE_NOT_FOUND');
    name = canonicalName ?? value.name;
    if (typeof name !== 'string') throw new Error('INVALID_IDENTITY');
    provider = new Provider(limits.maxWireBytes, limits.maxSnapshotBytes);
    identity = new Identity(provider, name);
    if (credentialModule) {
      const created = await credentialModule.createDeviceKey(value.credentials, { ...value.binding, signaturePublicKey: identity.public_key() }, value.cryptoPolicy);
      key = created.key;
      pendingEnvelope = created.envelope;
    }
    await save();
  }
  return { revision, signaturePublicKey: identity.public_key(), memberIndices: group ? Array.from(group.member_indices()) : [] };
}
async function run(op, value) {
  if (failed) throw new Error('WORKER_CLOSED');
  await ready;
  if (op === 'init') return start(value);
  if (!db || !identity) throw new Error('NOT_INITIALIZED');
  // Expose only the operation allowlist; no snapshot/key export RPC exists.
  if (op === 'outbox') return readOutbox(db, limits.maxOutbox);
  if (op === 'members') return Array.from(group.member_indices());
  let result;
  let outbound = [];
  switch (op) {
    case 'keyPackage': {
      const kp = identity.key_package(provider);
      try { result = kp.to_bytes(); } finally { kp.free(); }
      break;
    }
    case 'create':
      if (group) throw new Error('GROUP_EXISTS');
      group = Group.create_new(provider, identity, bytes(value)); result = true; break;
    case 'add': {
      const kp = KeyPackage.from_bytes(provider, bytes(value));
      try {
        const added = group.add_messages(provider, identity, kp);
        result = { commit: added[0], welcome: added[1], tree: added[2] };
        outbound = [result.commit, result.welcome, result.tree];
      } finally { kp.free(); }
      break;
    }
    case 'join':
      if (group) throw new Error('GROUP_EXISTS');
      group = Group.join(provider, bytes(value.welcome), bytes(value.tree)); result = true; break;
    case 'send':
      result = group.send(provider, identity, bytes(value)); outbound = [result]; break;
    case 'receive':
      result = group.receive(provider, bytes(value)); break;
    case 'update':
      result = group.update(provider, identity); outbound = [result]; break;
    case 'remove':
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error('INVALID_MEMBER');
      result = group.remove(provider, identity, value); outbound = [result]; break;
    default: throw new Error('UNSUPPORTED_OPERATION');
  }
  // Never release outbound wire data or decrypted input before durable commit.
  await save(outbound);
  return result;
}
self.onmessage = ({ data: { id, op, value } }) => {
  queue = queue.then(async () => {
    try {
      const result = await run(op, value);
      self.postMessage({ id, ok: true, result });
    } catch (error) {
      // Any uncertain state transition closes this instance. Restore a new
      // Worker from the last committed snapshot; never continue a failed send.
      failed = true;
      db?.close();
      try { group?.free(); identity?.free(); provider?.free(); } catch { /* A trapped instance must never be reused. */ }
      group = identity = provider = db = key = undefined;
      const known = /^[A-Z][A-Z_]+$/.test(error?.message ?? '');
      self.postMessage({ id, ok: false, code: known ? error.message : 'CRYPTO_STATE_FAILED' });
    } finally {
      for (const secret of [value?.credentials?.passphrase, value?.credentials?.result]) {
        if (secret instanceof Uint8Array) secret.fill(0);
      }
    }
  });
};
