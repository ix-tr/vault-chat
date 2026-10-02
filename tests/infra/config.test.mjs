import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localConfig, loadEnvironment } from '../../scripts/config.mjs';

test('local and LAN origins remain distinct and match gateway routes', () => {
  assert.equal(localConfig({}).chat, 'chat.localhost');
  const config = localConfig({CHAT_HOST:'chat.vault.home.arpa', ADMIN_HOST:'admin.vault.home.arpa', LAN_IP:'192.168.1.10'});
  assert.equal(config.external, '192.168.1.10');
  assert.throws(() => localConfig({ADMIN_HOST:'CHAT.LOCALHOST'}));
  assert.throws(() => localConfig({CHAT_ORIGIN:'https://admin.localhost:8443'}));
  assert.throws(() => localConfig({CHAT_ORIGIN:'http://chat.localhost:8443'}));
  assert.throws(() => localConfig({ADMIN_ORIGIN:'https://user:password@admin.localhost:8443'}));
});

test('invalid and injected network configuration is rejected before service startup', () => {
  for (const address of ['999.1.1.1', '192.168.1.1\nno-auth', '::1', '']) assert.throws(() => localConfig({LAN_IP:address}));
  assert.throws(() => localConfig({TURN_EXTERNAL_IP:'127.0.0.1\nno-auth'}));
  assert.throws(() => localConfig({CHAT_HOST:'chat.localhost\nadmin off'}));
  assert.throws(() => localConfig({TURN_MIN_PORT:'50000',TURN_MAX_PORT:'49999'}));
  assert.throws(() => localConfig({TURN_MAX_PORT:'65536'}));
});

test('quoted dotenv values work and explicit process environment takes precedence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vault-env-'));
  try {
    const file = join(directory, '.env');
    writeFileSync(file, 'CHAT_HOST="chat.vault.home.arpa"\nADMIN_HOST=admin.vault.home.arpa # comment\n');
    const target = {CHAT_HOST:'chat.localhost'};
    loadEnvironment(file, target);
    assert.equal(target.CHAT_HOST, 'chat.localhost');
    assert.equal(target.ADMIN_HOST, 'admin.vault.home.arpa');
  } finally { rmSync(directory, {recursive:true}); }
});
