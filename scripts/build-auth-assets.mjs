import { build } from 'esbuild';
import { readFile,mkdir,copyFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root=new URL('../',import.meta.url);
const vendor=new URL('packages/crypto/vendor/openmls/',root);
const manifest=JSON.parse(await readFile(new URL('provenance.json',vendor),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const binding=await readFile(new URL('spikes/crypto/adapter/lib.rs',root));
const wasm=await readFile(new URL('openmls_wasm_bg.wasm',vendor));
const glue=await readFile(new URL('openmls_wasm.js',vendor));
if(manifest.revision!=='3a3e35de3feeca8f6605143c464d5452ae584d43' || hash(binding)!==manifest.adapterSha256 || hash(wasm)!==manifest.sha256 || hash(glue)!==manifest.glueSha256) throw new Error('Reviewed crypto source/artifact mismatch; rebuild and review provenance.');
const outdir=new URL('apps/web/public/crypto-assets/',root);
await mkdir(outdir,{recursive:true});
await build({entryPoints:[new URL('packages/crypto/src/device-worker.mjs',root).pathname],outfile:new URL('device-worker.js',outdir).pathname,bundle:true,format:'esm',platform:'browser',target:'es2022',legalComments:'eof'});
await copyFile(new URL('openmls_wasm_bg.wasm',vendor),new URL('openmls_wasm_bg.wasm',outdir));
for (const name of ['LICENSE','licenses.json','SOURCE-NOTICE.txt']) await copyFile(new URL(name,vendor),new URL(name,outdir));
await writeFile(new URL('provenance.json',outdir),JSON.stringify(manifest,null,2)+'\n');
console.log('Device Worker and verified OpenMLS assets built.');
