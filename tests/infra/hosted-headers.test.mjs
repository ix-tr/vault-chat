import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessAdminPage, assessPage, hostedOrigins } from '../../scripts/verify-hosted.mjs';
import { text } from '../../packages/shared/src/index.ts';

function headers(nonce = 'test123') {
  return new Headers({
    'content-security-policy': `default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'`,
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
    'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp', 'cache-control': 'no-store',
  });
}

test('hosted verifier accepts matching nonces and rejects reused response nonces', () => {
  assert.deepEqual(assessPage(headers(), '<script nonce="test123"></script>').errors, []);
  assert.ok(assessPage(headers(), '<script nonce="test123"></script>', 'test123').errors.length);
});

test('hosted verifier rejects CSP/HTML mismatches and unsafe production scripts', () => {
  assert.ok(assessPage(headers(), '<script nonce="wrong"></script>').errors.length);
  assert.ok(assessPage(headers(), '<script src="/app.js"></script>').errors.length);
  const unsafe = headers();
  unsafe.set('content-security-policy', unsafe.get('content-security-policy') + " 'unsafe-eval'");
  assert.ok(assessPage(unsafe, '<script nonce="test123"></script>').errors.length);
});

test('hosted verifier rejects missing headers and cached dynamic pages', () => {
  const missing = headers(); missing.delete('content-security-policy'); missing.delete('cache-control');
  assert.ok(assessPage(missing, '<script nonce="test123"></script>').errors.length >= 2);
});

test('data attributes cannot impersonate nonces and diagnostics do not disclose values', () => {
  const result = assessPage(headers(), '<script data-nonce="test123" src="https://example.com/private?token=secret"></script>');
  assert.ok(result.errors.length);
  assert.equal(result.scriptDiagnostics[0].noncePresent, false);
  const report = JSON.stringify(result.scriptDiagnostics);
  for (const secret of ['test123', 'secret', 'example.com']) assert.equal(report.includes(secret), false);
  assert.deepEqual(assessPage(headers(), "<script nonce = 'test123'></script>").errors, []);
});

test('hosted verification refuses shared hosts and unsafe origin overrides', () => {
  assert.notEqual(hostedOrigins({}).chat.hostname, hostedOrigins({}).admin.hostname);
  for (const value of ['http://chat.example.com', 'https://user:secret@chat.example.com', 'https://chat.example.com/path', 'https://chat.example.com/?token=secret', 'https://chat.example.com/#secret']) {
    assert.throws(() => hostedOrigins({ CHAT_TEST_ORIGIN: value }));
    assert.throws(() => hostedOrigins({ ADMIN_TEST_ORIGIN: value }));
  }
  assert.throws(() => hostedOrigins({ CHAT_TEST_ORIGIN: 'https://same.example.com', ADMIN_TEST_ORIGIN: 'https://same.example.com:8443' }));
});

test('admin verification requires a closed preview and stricter nonce styles', () => {
  const html = `<h1>${text.adminTitle}</h1><p>${text.adminGate}</p><script nonce="test123"></script>`;
  const strict = headers();
  strict.set('content-security-policy', strict.get('content-security-policy') + "; style-src 'self' 'nonce-test123'");
  assert.deepEqual(assessAdminPage(strict, html).errors, []);
  assert.ok(assessAdminPage(strict, html, 'test123').errors.length);
  assert.ok(assessAdminPage(strict, '<h1>Chat</h1><script nonce="test123"></script>').errors.length);
  for (const control of ['<button>Delete</button>', '<form></form>', '<input type="password">']) {
    assert.ok(assessAdminPage(strict, html + control).errors.length);
  }
  for (const style of ["'self' 'unsafe-inline'", "'self' 'nonce-wrong'", "'self' https:", "'self' 'nonce-test123' https:"]) {
    const unsafe = headers();
    unsafe.set('content-security-policy', unsafe.get('content-security-policy') + `; style-src ${style}`);
    assert.ok(assessAdminPage(unsafe, html).errors.length);
  }
  assert.ok(assessAdminPage(headers(), html).errors.length);
});
