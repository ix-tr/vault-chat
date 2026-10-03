import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Intentionally not a production dependency. Only public upstream source is
// mounted into the compiler container; local credentials are never mounted.
const revision = '3a3e35de3feeca8f6605143c464d5452ae584d43';
const compiler = 'rust:1.93.1-slim@sha256:c0a38f5662afdb298898da1d70b909af4bda4e0acff2dc52aea6360a9b9c6956';
const bindgenVersion = '0.2.126';
const bindgenArchive = `wasm-bindgen-${bindgenVersion}-x86_64-unknown-linux-musl`;
const bindgenHash = '064948d58e2d6c0a745216477a639ba696216d6309aaa902939d1b865b1d869d';
const root = fileURLToPath(new URL('../', import.meta.url));
const adapter = process.argv.includes('--adapter');
const output = join(root, adapter ? 'spikes/crypto/generated-adapter' : 'spikes/crypto/generated');
const temp = await mkdtemp(join(tmpdir(), 'vault-mls-build-'));
const source = join(temp, 'openmls');
const run = (command, args, cwd = temp) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { cwd, stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}`)));
});
await run('git', ['clone', '--depth=1', '--branch', 'openmls-v0.9.0', 'https://github.com/openmls/openmls.git', source]);
const head = (await readFile(join(source, '.git/HEAD'), 'utf8')).trim();
if (head !== revision) throw new Error('Upstream tag moved; review before rebuilding');
let adapterSha256;
if (adapter) {
  const binding = await readFile(join(root, 'spikes/crypto/adapter/lib.rs'));
  adapterSha256 = createHash('sha256').update(binding).digest('hex');
  await writeFile(join(source, 'openmls-wasm/src/lib.rs'), binding);
  const manifestPath = join(source, 'openmls-wasm/Cargo.toml');
  const manifest = await readFile(manifestPath, 'utf8');
  await writeFile(manifestPath, manifest.replace('[dependencies]', '[dependencies]\nserde_json = "=1.0.151"'));
  // Extend only the binding's dependency list with an already locked crate.
  // No protocol source or dependency version is changed.
  const lockPath = join(source, 'Cargo.lock');
  const lock = await readFile(lockPath, 'utf8');
  const section = /name = "openmls-wasm"\nversion = "0.1.0"\ndependencies = \[[\s\S]*?\n\]/;
  if (!section.test(lock)) throw new Error('Binding lock entry changed; review required');
  await writeFile(lockPath, lock.replace(section, (entry) => entry.replace(' "tls_codec",', ' "serde_json",\n "tls_codec",')));
}
const response = await fetch(`https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${bindgenVersion}/${bindgenArchive}.tar.gz`);
if (!response.ok) throw new Error(`Bindgen download failed: HTTP ${response.status}`);
const archive = new Uint8Array(await response.arrayBuffer());
if (createHash('sha256').update(archive).digest('hex') !== bindgenHash) throw new Error('Bindgen archive checksum mismatch');
const archivePath = join(temp, 'bindgen.tar.gz');
await writeFile(archivePath, archive);
await run('tar', ['-xzf', archivePath, '-C', temp]);
await run('docker', ['run', '--rm', '-v', `${resolve(source)}:/work`, '-w', '/work', compiler, 'sh', '-c',
  'rustup target add wasm32-unknown-unknown && cargo build --locked --release -p openmls-wasm --target wasm32-unknown-unknown --no-default-features']);
const generated = join(temp, 'generated');
await mkdir(generated);
await run(join(temp, bindgenArchive, 'wasm-bindgen'), [join(source, 'target/wasm32-unknown-unknown/release/openmls_wasm.wasm'), '--target', 'web', '--out-dir', generated]);
await cp(generated, output, { recursive: true });
const wasm = await readFile(join(output, 'openmls_wasm_bg.wasm'));
await writeFile(join(output, 'provenance.json'), JSON.stringify({ revision, compiler, bindgenVersion, adapterSha256, wasmBytes: wasm.length, sha256: createHash('sha256').update(wasm).digest('hex') }, null, 2) + '\n');
console.log(`Experimental build ready: ${wasm.length} WASM bytes. Source retained at ${source}`);
