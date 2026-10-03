import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSeparateOrigins, product, text } from '../packages/shared/src/index.ts';

export function hostedOrigins(env = process.env) {
  const chat = new URL(env.CHAT_TEST_ORIGIN ?? 'https://vcht.netlify.app');
  const admin = new URL(env.ADMIN_TEST_ORIGIN ?? 'https://comfy-croquembouche-2be7d5.netlify.app');
  for (const origin of [chat, admin]) {
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
      throw new Error('Test origins must be HTTPS origins without credentials or paths.');
    }
  }
  assertSeparateOrigins(chat.origin, admin.origin);
  return { chat, admin };
}

export function assessAdminPage(headers, html, previousNonce) {
  const result = assessPage(headers, html, previousNonce);
  if (!html.includes(text.adminTitle) || !html.includes(text.adminGate) || /<\s*(?:button|form|input)\b/i.test(html)) {
    result.errors.push('Expected closed admin preview is absent or exposes controls.');
  }
  const policy = headers.get('content-security-policy') ?? '';
  const styles = policy.split(';').find(part => /^\s*style-src\s/.test(part))?.trim().split(/\s+/).slice(1) ?? [];
  if (!result.nonce || !styles.includes(`'nonce-${result.nonce}'`) || styles.some(value => value !== "'self'" && value !== `'nonce-${result.nonce}'`)) {
    result.errors.push('Admin styles must use only self and the response nonce.');
  }
  return result;
}

export function assessPage(headers, html, previousNonce) {
  const errors = [];
  const policy = new Map((headers.get('content-security-policy') ?? '').split(';').map(part => {
    const [name, ...values] = part.trim().split(/\s+/);
    return [name, values];
  }));
  for (const directive of ['default-src', 'base-uri', 'object-src', 'frame-ancestors']) {
    if (policy.get(directive)?.join(' ') !== "'none'") errors.push(`CSP ${directive} must deny access.`);
  }
  const scripts = policy.get('script-src') ?? [];
  const nonce = scripts.find(value => /^'nonce-[A-Za-z0-9+/=]+'$/.test(value))?.slice(7, -1);
  if (!nonce || !scripts.includes("'strict-dynamic'")) errors.push('CSP must include a script nonce and strict-dynamic.');
  if (scripts.includes("'unsafe-inline'") || scripts.includes("'unsafe-eval'")) errors.push('Production script policy permits unsafe execution.');
  if (previousNonce && nonce === previousNonce) errors.push('Repeated page responses share a nonce.');
  const tags = [...html.matchAll(/<script\b[^>]*>/gi)].map(match => match[0]);
  const scriptDiagnostics = tags.map((tag, index) => {
    const attribute = name => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find(value => value !== undefined);
    const scriptNonce = attribute('nonce');
    return {
      index,
      source: attribute('src') === undefined ? 'inline' : 'external',
      noncePresent: scriptNonce !== undefined,
      nonceMatchesPolicy: Boolean(nonce) && scriptNonce === nonce,
      frameworkAsset: /^\/_next\//.test(attribute('src') ?? ''),
    };
  });
  if (!tags.length || scriptDiagnostics.some(script => !script.nonceMatchesPolicy)) errors.push('HTML script nonces do not match the response policy.');
  const expected = {
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY', 'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
  };
  for (const [name, value] of Object.entries(expected)) {
    if (headers.get(name) !== value) errors.push(`Missing or unexpected ${name}.`);
  }
  if (!/\bno-store\b/i.test(headers.get('cache-control') ?? '')) errors.push('Dynamic page does not prohibit caching.');
  return { errors, nonce, scriptDiagnostics };
}

async function main() {
  const { chat: origin, admin } = hostedOrigins();
  const checks = [];
  const pages = [];
  async function check(name, action) {
    try { await action(); checks.push({ name, passed: true }); }
    catch (error) { checks.push({ name, passed: false, detail: error instanceof Error ? error.message : 'Check failed.' }); }
    const result = checks.at(-1);
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${name}${result.detail ? ` — ${result.detail}` : ''}`);
  }
  async function get(path, target = origin) {
    const response = await fetch(new URL(path, target), { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    if (response.status !== 200) throw new Error(`Expected HTTP 200, received ${response.status}; check visibility and routing.`);
    return response;
  }
  let firstNonce;
  for (let attempt = 0; attempt < 2; attempt++) await check(`Chat response and CSP ${attempt + 1}`, async () => {
    const response = await get('/');
    const html = await response.text();
    if (!html.includes(text.title)) throw new Error('Expected chat page is absent (wrong app or access protection).');
    const result = assessPage(response.headers, html, firstNonce);
    pages.push({ attempt: attempt + 1, scriptDiagnostics: result.scriptDiagnostics });
    firstNonce = result.nonce;
    if (result.errors.length) {
      console.log(`Script diagnostics ${attempt + 1}: ${JSON.stringify(result.scriptDiagnostics)}`);
      throw new Error(result.errors.join(' '));
    }
  });
  let adminNonce;
  for (let attempt = 0; attempt < 2; attempt++) await check(`Admin closed preview and CSP ${attempt + 1}`, async () => {
    const response = await get('/', admin);
    const result = assessAdminPage(response.headers, await response.text(), adminNonce);
    pages.push({ app: 'admin', attempt: attempt + 1, scriptDiagnostics: result.scriptDiagnostics });
    adminNonce = result.nonce;
    if (result.errors.length) {
      console.log(`Admin script diagnostics ${attempt + 1}: ${JSON.stringify(result.scriptDiagnostics)}`);
      throw new Error(result.errors.join(' '));
    }
  });
  await check('PWA manifest and icons', async () => {
    const manifest = await (await get('/manifest.webmanifest')).json();
    if (manifest.name !== product.name || manifest.display !== 'standalone' || manifest.start_url !== '/') throw new Error('Unexpected manifest.');
    for (const size of [192, 512]) {
      const icon = manifest.icons?.find(item => item.sizes === `${size}x${size}` && item.type === 'image/png');
      if (!icon || new URL(icon.src, origin).origin !== origin.origin) throw new Error(`Missing same-origin ${size}px icon.`);
      const response = await get(icon.src);
      if (!response.headers.get('content-type')?.includes('image/png')) throw new Error('Icon response is not PNG.');
    }
  });
  await check('Same-origin service worker asset', async () => {
    const response = await get('/sw.js');
    if (!/javascript/.test(response.headers.get('content-type') ?? '')) throw new Error('Service worker has an invalid MIME type.');
  });
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/hosted-http-report.json', JSON.stringify({
    checkedAt: new Date().toISOString(), chatOrigin: origin.origin, adminOrigin: admin.origin, checks, pages,
    limitation: 'HTTP checks only; hydration, offline execution, installation and physical devices need browser tests.',
  }, null, 2) + '\n');
  console.log('Report: test-results/hosted-http-report.json (contains no credentials or page content).');
  process.exitCode = checks.every(check => check.passed) ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Hosted verification could not start; check the origin and network configuration.'); process.exitCode = 1; });
}
