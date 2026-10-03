// Demo fixtures only. Limits/key bootstrap must come from authenticated settings
// and the credential-unlock flow before this can become an application API.
const fixtureLimits = { maxWireBytes: 1024 * 1024, maxSnapshotBytes: 8 * 1024 * 1024, maxOutbox: 64 };
const encode = (value) => new TextEncoder().encode(value);
const decode = (value) => new TextDecoder().decode(value);
export async function createRig() {
  const clients = [];
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const prefix = crypto.randomUUID();
  async function client(who, options = {}) {
    const namespace = `${prefix}-${who}`;
    const worker = new Worker(options.workerPath ?? '/state-worker.mjs', { type: 'module' });
    clients.push(worker);
    let sequence = 0;
    function call(op, value) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { cleanup(); worker.terminate(); reject(new Error('TIMEOUT')); }, 15000);
        const onMessage = ({ data }) => {
          if (data.id !== id) return;
          cleanup();
          if (data.ok) resolve(data.result); else reject(new Error(data.code));
        };
        const onError = () => { cleanup(); worker.terminate(); reject(new Error('WORKER_FAILED')); };
        const cleanup = () => {
          clearTimeout(timer);
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage({ id, op, value });
      });
    }
    await call('init', { namespace, name: `demo-${who}`, key: options.key ?? key, limits: { ...fixtureLimits, ...options.limits }, restoreOnly: options.restoreOnly ?? false });
    return { call, namespace, close: () => worker.terminate() };
  }
  async function pair(options = {}) {
    const alice = await client('alice', options);
    const bob = await client('bob');
    await alice.call('create', encode('demo-state-group'));
    const added = await alice.call('add', await bob.call('keyPackage'));
    await bob.call('join', added);
    return { alice, bob, added };
  }
  return { client, pair, key, close: () => clients.forEach((worker) => worker.terminate()) };
}
export async function failureCode(operation) {
  try { await operation(); return null; } catch (error) { return error.message; }
}
export async function readStored(namespace) {
  const { openStore, readState, readOutbox } = await import('/state-store.mjs');
  const db = await openStore(namespace);
  try { return { record: await readState(db), outbox: await readOutbox(db, fixtureLimits.maxOutbox) }; }
  finally { db.close(); }
}
export async function persistentScenario() {
  const rig = await createRig();
  try {
    let { alice, bob } = await rig.pair();
    const first = await alice.call('send', encode('Before restart'));
    const before = decode(await bob.call('receive', first));
    alice.close(); bob.close();
    alice = await rig.client('alice', { restoreOnly: true });
    bob = await rig.client('bob', { restoreOnly: true });
    const replay = await failureCode(() => bob.call('receive', first));
    bob.close(); bob = await rig.client('bob', { restoreOnly: true });
    const second = await alice.call('send', encode('After restart'));
    const after = decode(await bob.call('receive', second));
    const outbox = await alice.call('outbox');
    const stored = await readStored(alice.namespace);
    const wrongKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const wrongKeyResult = await failureCode(() => rig.client('alice', { key: wrongKey, restoreOnly: true }));
    return {
      before, after, replay, wrongKeyResult,
      ciphertextChanged: first.toString() !== second.toString(),
      outboxHasBoth: outbox.some((item) => item.toString() === first.toString()) && outbox.some((item) => item.toString() === second.toString()),
      storedEncrypted: stored.record.ciphertext instanceof ArrayBuffer && stored.record.iv.length === 12 && !JSON.stringify(stored.record).includes('demo-alice'),
      storedFields: Object.keys(stored.record).sort(),
    };
  } finally { rig.close(); }
}
export async function validationScenario() {
  const rig = await createRig();
  try {
    const { alice, bob: initialBob, added } = await rig.pair();
    let bob = initialBob;
    const recover = async () => { bob.close(); bob = await rig.client('bob', { restoreOnly: true }); };
    const malformed = await failureCode(() => bob.call('receive', new Uint8Array([0])));
    const closed = await failureCode(() => bob.call('members'));
    await recover();
    const welcomeKind = await failureCode(() => bob.call('receive', added.welcome));
    await recover();
    const valid = await alice.call('send', encode('Not consumed by trailing input'));
    const trailing = await failureCode(() => bob.call('receive', new Uint8Array([...valid, 0])));
    await recover();
    const recovered = decode(await bob.call('receive', valid));
    const oversized = await failureCode(() => bob.call('receive', new Uint8Array(fixtureLimits.maxWireBytes + 1)));
    await recover();
    const exportBlocked = await failureCode(() => bob.call('snapshot'));
    return { malformed, closed, welcomeKind, trailing, recovered, oversized, exportBlocked };
  } finally { rig.close(); }
}
export async function membershipScenario() {
  const rig = await createRig();
  try {
    const { alice, bob } = await rig.pair();
    const charlie = await rig.client('charlie');
    const added = await alice.call('add', await charlie.call('keyPackage'));
    await bob.call('receive', added.commit);
    await charlie.call('join', added);
    const update = await alice.call('update');
    await bob.call('receive', update); await charlie.call('receive', update);
    const updated = await bob.call('send', encode('After self update'));
    const afterUpdate = decode(await alice.call('receive', updated));
    const removed = await alice.call('remove', 2);
    await bob.call('receive', removed); await charlie.call('receive', removed);
    const newMessage = await alice.call('send', encode('After removal'));
    const afterRemoval = decode(await bob.call('receive', newMessage));
    const removedCannotRead = await failureCode(() => charlie.call('receive', newMessage));
    const members = await alice.call('members');
    return { afterUpdate, afterRemoval, removedCannotRead, members };
  } finally { rig.close(); }
}
export async function concurrentScenario() {
  const rig = await createRig();
  try {
    const { alice, bob } = await rig.pair();
    const otherAlice = await rig.client('alice', { restoreOnly: true });
    const results = await Promise.allSettled([
      alice.call('send', encode('First writer')), otherAlice.call('send', encode('Second writer')),
    ]);
    const winner = results.find((result) => result.status === 'fulfilled');
    const loser = results.find((result) => result.status === 'rejected');
    const received = winner ? decode(await bob.call('receive', winner.value)) : null;
    alice.close(); otherAlice.close();
    const restored = await rig.client('alice', { restoreOnly: true });
    const next = await restored.call('send', encode('After conflict'));
    const after = decode(await bob.call('receive', next));
    const outbox = await restored.call('outbox');
    return { fulfilled: results.filter((result) => result.status === 'fulfilled').length, failure: loser?.reason.message, received, after, outboxCount: outbox.length };
  } finally { rig.close(); }
}
export async function abortedSendScenario() {
  const rig = await createRig();
  try {
    // The add emits three wire records. Filling this configured outbox forces
    // the next send's real IndexedDB state+outbox transaction to abort.
    const { alice, bob } = await rig.pair({ limits: { maxOutbox: 3 } });
    const before = await readStored(alice.namespace);
    const failure = await failureCode(() => alice.call('send', encode('Must not be released')));
    const closed = await failureCode(() => alice.call('send', encode('Cannot continue')));
    const after = await readStored(alice.namespace);
    alice.close();
    const restored = await rig.client('alice', { restoreOnly: true });
    const next = await restored.call('send', encode('Restored from committed state'));
    const decoded = decode(await bob.call('receive', next));
    return { failure, closed, sameRevision: before.record.revision === after.record.revision, sameOutboxCount: before.outbox.length === after.outbox.length, decoded };
  } finally { rig.close(); }
}
export async function lostReplyScenario() {
  const rig = await createRig();
  try {
    const { alice, bob } = await rig.pair({ workerPath: '/lost-reply-worker.mjs' });
    await alice.call('armLostReply');
    const lost = await failureCode(() => alice.call('send', encode('Committed but reply lost')));
    alice.close();
    const restored = await rig.client('alice', { restoreOnly: true });
    const outbox = await restored.call('outbox');
    const recovered = decode(await bob.call('receive', outbox.at(-1)));
    const next = await restored.call('send', encode('New generation after lost reply'));
    const after = decode(await bob.call('receive', next));
    return { lost, recovered, after, outboxCount: outbox.length };
  } finally { rig.close(); }
}
export async function snapshotRejectionScenario() {
  const rig = await createRig();
  const writeStored = async (namespace, record, writeHead = true) => {
    const { openStore } = await import('/state-store.mjs');
    const db = await openStore(namespace);
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('state', 'readwrite');
        tx.objectStore('state').put(record, 'current');
        if (writeHead) tx.objectStore('state').put(record.revision, 'head');
        tx.oncomplete = resolve; tx.onabort = reject;
      });
    } finally { db.close(); }
  };
  try {
    const alice = await rig.client('alice');
    const old = (await readStored(alice.namespace)).record;
    await alice.call('keyPackage');
    const { record } = await readStored(alice.namespace);
    const copiedNamespace = alice.namespace.replace(/alice$/, 'copied');
    await writeStored(copiedNamespace, record);
    const copied = await failureCode(() => rig.client('copied', { restoreOnly: true }));
    alice.close();
    await writeStored(alice.namespace, old, false);
    const rollback = await failureCode(() => rig.client('alice', { restoreOnly: true }));
    const damaged = new Uint8Array(record.ciphertext.slice(0));
    damaged[damaged.length - 1] ^= 1;
    await writeStored(alice.namespace, { ...record, ciphertext: damaged.buffer });
    const tampered = await failureCode(() => rig.client('alice', { restoreOnly: true }));
    const missing = await failureCode(() => rig.client('missing', { restoreOnly: true }));
    return { copied, tampered, missing, rollback };
  } finally { rig.close(); }
}
