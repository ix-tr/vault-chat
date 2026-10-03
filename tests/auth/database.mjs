import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);
export async function authDatabase() {
  const name = `vault-auth-test-${randomUUID()}`;
  const run = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', ...options });
  run(['run','--detach','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data','--env','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24']);
  const close = () => run(['rm','--force',name], { stdio: 'ignore' });
  const sql = input => run(['exec','-i',name,'psql','-h','127.0.0.1','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'], { input, stdio: ['pipe','pipe','pipe'] });
  try {
    let ready = false;
    for (let attempt=0;attempt<60;attempt++) {
      if (spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'], { stdio:'ignore' }).status===0) { ready=true;break; }
      await delay(500);
    }
    if (!ready) throw new Error('Database fixture unavailable');
    sql(readFileSync('tests/db/bootstrap.sql','utf8'));
    for (const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) sql(readFileSync(`supabase/migrations/${file}`,'utf8'));
    return { close, sql, async query(input) {
      const child=execute('docker',['exec','-i',name,'psql','-h','127.0.0.1','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres']);
      child.child.stdin.end(input);
      return child;
    }, async rpc(action,input={}) {
      // Independent connection per operation, safe psql variable quoting; no shell.
      const child = execute('docker',['exec','-i',name,'psql','-h','127.0.0.1','-X','-qAt','-v','ON_ERROR_STOP=1','-v',`action=${action}`,'-v',`body=${JSON.stringify(input)}`,'-U','postgres']);
      child.child.stdin.end("set role service_role; select public.vault_auth(:'action',:'body'::jsonb);\n");
      try { const { stdout } = await child; return JSON.parse(stdout.trim()); }
      catch { throw new Error('AUTH_UNAVAILABLE'); }
    } };
  } catch (error) { close();throw error; }
}
