// Ephemeral demo data only. This is not an application crypto API.
export async function runScenario(mode = 'normal') {
  const workers = [];
  const createClient = async (name) => {
    const worker = new Worker('/worker.mjs', { type: 'module' });
    workers.push(worker);
    let nextId = 0;
    const call = (op, value) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out: ${op}`)); }, 15000);
      const onMessage = ({ data }) => {
        if (data.id !== id) return;
        cleanup();
        if (data.ok) resolve(data.result);
        else reject(new Error(data.errorType));
      };
      const onError = () => { cleanup(); reject(new Error('Worker load failure')); };
      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage({ id, op, value });
    });
    await call('init', name);
    return call;
  };
  const encode = (text) => Array.from(new TextEncoder().encode(text));
  const decode = (value) => new TextDecoder().decode(new Uint8Array(value));
  const rejects = async (operation) => {
    try { await operation(); return false; } catch { return true; }
  };
  try {
    const alice = await createClient('demo-alice');
    const bob = await createClient('demo-bob');
    await alice('create', 'vault-crypto-spike');
    const added = await alice('add', await bob('keyPackage'));
    await bob('join', added);
    if (mode === 'malformed') {
      try {
        await bob('receive', [0]);
        return { rejected: false, errorType: null };
      } catch (error) {
        return { rejected: true, errorType: error.message };
      }
    }
    const demoMessage = 'Demo: hello Bob 👋';
    const ciphertext = await alice('send', encode(demoMessage));
    const decoded = decode(await bob('receive', ciphertext));
    const replayRejected = await rejects(() => bob('receive', ciphertext));
    const intact = await alice('send', encode('Integrity demo'));
    const tampered = [...intact];
    tampered[tampered.length - 1] ^= 1;
    const tamperRejected = await rejects(() => bob('receive', tampered));
    // A new generation checks that a rejected input has not broken the worker.
    const afterTamper = await alice('send', encode('After rejection'));
    const recovery = decode(await bob('receive', afterTamper));
    const reply = await bob('send', encode('Hello Alice'));
    const replyDecoded = decode(await alice('receive', reply));
    const charlie = await createClient('demo-charlie');
    const third = await alice('add', await charlie('keyPackage'));
    await bob('receive', third.proposal);
    await bob('receive', third.commit);
    await charlie('join', third);
    const threeParty = await charlie('send', encode('Three-member demo'));
    const groupDecoded = [decode(await alice('receive', threeParty)), decode(await bob('receive', threeParty))];
    return {
      decoded, replyDecoded, groupDecoded, recovery, replayRejected, tamperRejected,
      plaintextVisibleInCiphertext: decode(ciphertext).includes(demoMessage),
      ciphertextBytes: ciphertext.length,
    };
  } finally {
    for (const worker of workers) worker.terminate();
  }
}
