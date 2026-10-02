import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvironment, localConfig } from './config.mjs';
let failures = 0;
function report(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
function command(name, executable, args) {
  const result = spawnSync(executable, args, {encoding:'utf8', timeout:5000, shell:process.platform === 'win32'});
  report(name, !result.error && result.status === 0, result.error?.code ?? (result.status === 0 ? '' : 'unavailable or permission denied'));
}
report('Node.js 24+', Number(process.versions.node.split('.')[0]) >= 24);
command('pnpm', 'pnpm', ['--version']);
command('mkcert', 'mkcert', ['--version']);
command('gitleaks', 'gitleaks', ['version']);
command('Docker daemon access', 'docker', ['info', '--format', '{{.ServerVersion}}']);
command('Docker Compose configuration', 'docker', ['compose','--env-file',existsSync('.env')?'.env':'.env.example','-f','infra/compose.yaml','config','--quiet']);
try { loadEnvironment(); localConfig(); report('Local origin/network configuration', true); }
catch { report('Local origin/network configuration', false, 'review .env hostnames, origins, IPv4 addresses and port range'); }
report('Dependency lockfile', existsSync('pnpm-lock.yaml'), 'generate with pnpm install');
report('Local certificates', existsSync('infra/certs/local.pem') && existsSync('infra/certs/local-key.pem'), 'generate with pnpm certs');
try {
  const response = await fetch('https://registry.npmjs.org/pnpm', {signal:AbortSignal.timeout(5000)});
  report('npm registry connection', response.ok);
} catch { report('npm registry connection', false, 'network or DNS unavailable in this terminal'); }
console.log('No secret values are included in this report.');
process.exitCode = failures ? 1 : 0;
