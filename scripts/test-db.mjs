import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Disposable SQL fixture, never a hosted project: no secrets, network or mounts.
const image = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const name = `vault-db-test-${randomUUID()}`;
const run = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', ...options });
let started = false;
try {
  run(['run', '--detach', '--name', name, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { stdio: 'ignore' }).status === 0) { ready = true; break; }
    await delay(500);
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready.');
  const sql = (file, transaction = true) => run(['exec', '-i', name, 'psql', '-h', '127.0.0.1', '-X', '-qAt', ...(transaction ? ['-1'] : []), '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], { input: readFileSync(file, 'utf8'), stdio: ['pipe', 'pipe', 'pipe'] });
  sql('tests/db/bootstrap.sql');
  const migrations = readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort();
  if (!migrations.length) throw new Error('No migrations found.');
  for (const file of migrations) sql(`supabase/migrations/${file}`);
  const tests = readdirSync('tests/db').filter(file => file.endsWith('.sql') && file !== 'bootstrap.sql').sort();
  if (!tests.length) throw new Error('No database tests found.');
  for (const file of tests) {
    sql(`tests/db/${file}`, false);
    console.log(`Passed: ${file}`);
  }
  console.log(`Applied ${migrations.length} migration(s); disposable database checks passed.`);
} catch (error) {
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  if (started) run(['rm', '--force', name], { stdio: 'ignore' });
}
