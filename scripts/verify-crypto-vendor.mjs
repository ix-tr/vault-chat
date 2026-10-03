import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// CI rebuilds the pinned source and binding before checking the shipped bytes.
const root=new URL('../',import.meta.url);
for (const name of ['openmls_wasm.js','openmls_wasm_bg.wasm']) {
  const [fresh,vendor]=await Promise.all([
    readFile(new URL(`spikes/crypto/generated-adapter/${name}`,root)),
    readFile(new URL(`packages/crypto/vendor/openmls/${name}`,root)),
  ]);
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  if(hash(fresh)!==hash(vendor))throw new Error(`Vendored ${name} differs from the pinned source rebuild; review required.`);
}
console.log('Vendored OpenMLS WASM and glue match the pinned source rebuild.');
