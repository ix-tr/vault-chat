import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadEnvironment, localConfig } from './config.mjs';
const action=process.argv[2];
loadEnvironment();
function run(cmd,args){const result=spawnSync(cmd,args,{stdio:'inherit',shell:process.platform==='win32'});if(result.error||result.status!==0)throw new Error(`${cmd} failed. Check installation and permissions.`);}
function compose(args){run('docker',['compose','--env-file',existsSync('.env')?'.env':'.env.example','-f','infra/compose.yaml',...args]);}
const {chat, admin, ip, external, min, max} = localConfig();
process.env.CHAT_HOST = chat;
process.env.ADMIN_HOST = admin;
if(action==='certs'){mkdirSync('infra/certs',{recursive:true});run('mkcert',['-install']);run('mkcert',['-cert-file','infra/certs/local.pem','-key-file','infra/certs/local-key.pem',chat,admin,'localhost','127.0.0.1',ip]);}
else if(action==='start'){
 if(!existsSync('infra/certs/local.pem'))throw new Error('Run pnpm certs first.');
 run('docker',['info','--format','{{.ServerVersion}}']);
 mkdirSync('infra/runtime',{recursive:true});
 if(!existsSync('infra/runtime/secrets.json'))writeFileSync('infra/runtime/secrets.json',JSON.stringify({turn:randomBytes(32).toString('hex'),livekit:randomBytes(32).toString('hex')}),{mode:0o600});
 const secrets=JSON.parse(readFileSync('infra/runtime/secrets.json','utf8'));
 writeFileSync('infra/runtime/turnserver.conf',`listening-port=3478\nfingerprint\nuse-auth-secret\nstatic-auth-secret=${secrets.turn}\nrealm=vault-chat.local\nexternal-ip=${external}\nmin-port=${min}\nmax-port=${max}\nno-cli\nno-multicast-peers\nno-loopback-peers\nno-tls\nno-dtls\nlog-file=stdout\n`,{mode:0o600});
 writeFileSync('infra/runtime/livekit.yaml',`port: 7880\nbind_addresses: ["0.0.0.0"]\nrtc:\n  tcp_port: 7881\n  port_range_start: 50000\n  port_range_end: 50100\n  use_external_ip: false\nkeys:\n  vault-local: ${secrets.livekit}\nlogging:\n  level: warn\n`,{mode:0o600});
 run('pnpm',['exec','supabase','start']);compose(['up','-d']);
 const child=spawn('pnpm',['dev'],{stdio:'inherit',shell:process.platform==='win32'});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 child.on('exit',code=>{process.exitCode=code||0;});
}else if(action==='stop'){compose(['down']);run('pnpm',['exec','supabase','stop']);}
else if(action==='reset'){if(!process.argv.includes('--confirm-local-data-loss'))throw new Error('Reset destroys local data. Add --confirm-local-data-loss.');run('pnpm',['exec','supabase','db','reset']);}
else throw new Error('Expected start, stop, reset, or certs');
