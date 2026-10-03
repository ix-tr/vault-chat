import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,dirname,sep } from 'node:path';
import { productionAuthDependencies } from '../server/auth-config.mjs';
import { validateAuthPolicy } from '../server/auth-policy.mjs';
import { createActivationToken,activationLink } from '../server/activation-token.mjs';

// Explicit trusted operator action, never imported by a browser route. No
// account is created by simply building, starting or deploying the application.
const [action,settingsPath,outputPath,...extra] = process.argv.slice(2);
try {
  if (extra.length || !['bootstrap','create-account'].includes(action) || !settingsPath || !outputPath) throw new Error('usage');
  const settings = validateAuthPolicy(JSON.parse(await readFile(settingsPath,'utf8')));
  const { rpc,origin } = productionAuthDependencies({ ...process.env,VAULT_AUTH_ENABLED:'true' });
  const target=resolve(outputPath);
  if (!target.startsWith(resolve('infra/runtime')+sep)) throw new Error('private-output-required');
  await mkdir(dirname(target), { recursive:true,mode:0o700 });
  // Reserve the file before issuing a bearer link; refuse overwriting any file.
  const {token,hash}=createActivationToken();
  const activation_url=activationLink(origin,token);
  await writeFile(target,JSON.stringify({activation_url},null,2)+'\n', {flag:'wx',mode:0o600});
  const account=await rpc(action==='bootstrap'?'bootstrap':'operator_create_account',{token_hash:Buffer.from(hash).toString('hex'),...(action==='bootstrap'?{settings}:{})});
  await writeFile(target,JSON.stringify({account_id:account.account_id,activation_url},null,2)+'\n',{mode:0o600});
  console.log('Activation details saved to the requested private file. Keep this bearer link private.');
} catch {
  console.error('Bootstrap unavailable. Supply bootstrap|create-account, explicit settings JSON and a new output path under ignored infra/runtime; verify server configuration and migrations. No credential values are printed.');
  process.exitCode=1;
}
