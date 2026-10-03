import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const assets = new Map([
  ...['unlock.mjs','identity.mjs','store.mjs'].map(path => ['/packages/crypto/src/' + path, ['../../packages/crypto/src/' + path, 'text/javascript']]),
  ...['device-identity.mjs', 'passkey-prf.mjs', 'unlock-harness.mjs', 'generated-unlock/credential-crypto.js'].map((path) => ['/' + path, [path, 'text/javascript']]),
  ['/worker.mjs', ['worker.mjs', 'text/javascript']],
  ['/harness.mjs', ['harness.mjs', 'text/javascript']],
  ['/state-worker.mjs', ['state-worker.mjs', 'text/javascript']],
  ['/state-store.mjs', ['state-store.mjs', 'text/javascript']],
  ['/state-harness.mjs', ['state-harness.mjs', 'text/javascript']],
  ['/lost-reply-worker.mjs', ['lost-reply-worker.mjs', 'text/javascript']],
  ['/generated/openmls_wasm.js', ['generated/openmls_wasm.js', 'text/javascript']],
  ['/generated/openmls_wasm_bg.wasm', ['generated/openmls_wasm_bg.wasm', 'application/wasm']],
  ['/generated-adapter/openmls_wasm.js', ['generated-adapter/openmls_wasm.js', 'text/javascript']],
  ['/generated-adapter/openmls_wasm_bg.wasm', ['generated-adapter/openmls_wasm_bg.wasm', 'application/wasm']],
]);
const base = new URL('./', import.meta.url);
// Loopback, static allowlist, no secrets, production apps do not import this server.
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  // /blocked proves the WASM CSP requirement without relaxing production CSP.
  const wasmPermission = path === '/blocked' ? '' : " 'wasm-unsafe-eval'";
  response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self'${wasmPermission}; worker-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  if (path === '/' || path === '/blocked') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Ephemeral MLS spike</title><body>Automated crypto evaluation only.</body></html>');
    return;
  }
  const asset = assets.get(path);
  if (!asset) { response.writeHead(404).end(); return; }
  try {
    const content = await readFile(new URL(asset[0], base));
    // Workers enforce their own response policy. Bind it to the document policy
    // in the CSP-denied experiment via the Referer sent by same-origin workers.
    if (path === '/worker.mjs' && request.headers.referer?.endsWith('/blocked')) {
      response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'");
    }
    response.setHeader('Content-Type', asset[1]);
    response.end(content);
  } catch {
    response.writeHead(503).end('Build the spike WASM artifact first.');
  }
});
server.listen(3210, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
