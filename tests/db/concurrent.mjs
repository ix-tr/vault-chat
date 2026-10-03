import { spawn, execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
export async function activationConcurrency(container) {
  const args = ['exec', '-i', container, 'psql', '-h', '127.0.0.1', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'];
  const query = (input) => execFileSync('docker', args, { input, encoding: 'utf8' });
  query("insert into public.app_settings(key,value) values('activation_ttl_seconds','900');");
  const attempt = (input) => new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stdout.resume();
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stderr }));
    child.stdin.end(input);
  });
  for (let round = 0; round < 3; round++) {
    const account = randomUUID(), hash = randomBytes(32).toString('hex');
    query(`insert into public.accounts(id) values('${account}'); select * from public.issue_account_activation('${account}',decode('${hash}','hex'));`);
    const request = () => `begin; set local role service_role; select public.complete_account_activation(decode('${hash}','hex'),'${randomUUID()}',decode('${randomBytes(32).toString('hex')}','hex')); select pg_sleep(0.2); commit;`;
    const results = await Promise.all([attempt(request()), attempt(request())]);
    if (results.filter(result => result.status === 0).length !== 1 || !results.some(result => result.status !== 0 && result.stderr.includes('ACTIVATION_UNAVAILABLE'))) throw new Error('Concurrent activation did not have exactly one winner.');
    const committed = query(`select (select count(*) from public.devices where account_id='${account}')=1 and (select status='active' from public.accounts where id='${account}') and (select consumed_at is not null from public.account_activations where account_id='${account}');`).trim();
    if (committed !== 't') throw new Error('Concurrent activation left inconsistent state.');
  }
  console.log('Passed: concurrent activation (three independent two-connection races).');
}
