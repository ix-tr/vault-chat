// Experimental encrypted-state persistence. No CryptoKeys or plaintext stored.
export function openStore(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`vault-mls-spike:${name}`, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore('state');
      request.result.createObjectStore('outbox');
    };
    request.onblocked = () => { blocked = true; reject(new Error('STORAGE_BLOCKED')); };
    request.onerror = () => reject(new Error('STORAGE_FAILED'));
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export function readState(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly');
    const store = tx.objectStore('state');
    const request = store.get('current');
    const head = store.get('head');
    tx.oncomplete = () => {
      if ((request.result?.revision ?? 0) !== (head.result ?? 0)) {
        reject(new Error('STATE_ROLLBACK')); return;
      }
      resolve(request.result ?? null);
    };
    tx.onabort = () => reject(new Error('STORAGE_FAILED'));
  });
}

export function commitState(db, previousRevision, record, outbound, maxOutbox, unlockEnvelope) {
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(['state', 'outbox'], 'readwrite', { durability: 'strict' });
      if (tx.durability !== 'strict') {
        tx.abort(); reject(new Error('STRICT_STORAGE_UNSUPPORTED')); return;
      }
    } catch { reject(new Error('STRICT_STORAGE_UNSUPPORTED')); return; }
    let failure = 'STORAGE_FAILED';
    const state = tx.objectStore('state');
    const outbox = tx.objectStore('outbox');
    const current = state.get('current');
    current.onsuccess = () => {
      if ((current.result?.revision ?? 0) !== previousRevision) {
        failure = 'STATE_CONFLICT'; tx.abort(); return;
      }
      const head = state.get('head');
      head.onsuccess = () => {
        if ((head.result ?? 0) !== previousRevision) { failure = 'STATE_CONFLICT'; tx.abort(); return; }
        const count = outbox.count();
        count.onsuccess = () => {
          if (count.result + outbound.length > maxOutbox) {
            failure = 'OUTBOX_FULL'; tx.abort(); return;
          }
          if (unlockEnvelope) state.put(unlockEnvelope, 'unlock');
          state.put(record, 'current');
          state.put(record.revision, 'head');
          for (let index = 0; index < outbound.length; index++) {
            outbox.add(outbound[index], [record.revision, index]);
          }
        };
      };
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(new Error(failure));
  });
}

export function readOutbox(db, limit) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readonly');
    const request = tx.objectStore('outbox').getAll(null, limit);
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(new Error('STORAGE_FAILED'));
  });
}

export function readUnlockEnvelope(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly');
    const request = tx.objectStore('state').get('unlock');
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(new Error('STORAGE_FAILED'));
  });
}
