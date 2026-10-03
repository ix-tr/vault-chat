import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const outdir = new URL('../spikes/crypto/generated-unlock/', import.meta.url);
await mkdir(outdir, { recursive: true });
const result = await build({
  entryPoints: ['spikes/crypto/credential-crypto.mjs'],
  outdir: outdir.pathname, bundle: true, format: 'esm', platform: 'browser',
  target: 'es2022', metafile: true, legalComments: 'eof',
});
await writeFile(new URL('bundle-inputs.json', outdir), JSON.stringify(Object.keys(result.metafile.inputs), null, 2) + '\n');
