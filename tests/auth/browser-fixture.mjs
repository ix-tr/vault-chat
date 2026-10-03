import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authDatabase } from './database.mjs';
import { authenticator } from './authenticator.mjs';
import { createActivationToken } from '../../server/activation-token.mjs';
import { handleChatAuth } from '../../server/chat-auth.mjs';

// Loopback-only isolated integration fixture; not imported by production code.
const policy=JSON.parse(await readFile('tests/auth/policy.json','utf8'));
const origin='https://localhost:3212',rpID='localhost';
const temp=await mkdtemp(join(tmpdir(),'vault-auth-browser-'));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
const db=await authDatabase();
const first=createActivationToken();await db.rpc('bootstrap',{settings:policy,token_hash:Buffer.from(first.hash).toString('hex')});
const authenticators=new Map();
async function body(request) {
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>policy.max_auth_body_bytes)throw new Error('FIXTURE_BODY_LIMIT');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
function json(response,value,status=200){response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(value));}
const server=createServer({key:await readFile(join(temp,'key.pem')),cert:await readFile(join(temp,'cert.pem'))},async(request,response)=>{
  try{
    const url=new URL(request.url,origin);
    if(url.pathname==='/fixture/ready'){json(response,{ready:true});return;}
    if(url.pathname==='/fixture/pending'){
      const link=createActivationToken();const account=await db.rpc('operator_create_account',{token_hash:Buffer.from(link.hash).toString('hex')});
      json(response,{...account,token:link.token});return;
    }
    if(url.pathname==='/fixture/credential'){
      const input=JSON.parse((await body(request)).toString());
      if(!/^[0-9a-f-]{36}$/.test(input.context_id))throw new Error('FIXTURE_ID');
      let entry=authenticators.get(input.context_id);
      if(input.kind==='create'){entry={passkey:authenticator(),accountId:input.account_id,counter:0};authenticators.set(input.context_id,entry);}
      if(!entry)throw new Error('FIXTURE_PASSKEY_MISSING');
      const options={origin,rpID,challenge:input.challenge,accountId:entry.accountId,uv:input.uv!==false};
      json(response,input.kind==='create'?entry.passkey.registration(options):entry.passkey.assertion({...options,counter:++entry.counter}));return;
    }
    if(url.pathname==='/fixture/revoke'){
      const input=JSON.parse((await body(request)).toString());if(!/^[0-9a-f-]{36}$/.test(input.device_id))throw new Error('FIXTURE_ID');
      db.sql(`update public.devices set revoked_at=clock_timestamp() where id='${input.device_id}';`);json(response,{revoked:true});return;
    }
    if(url.pathname.startsWith('/api/auth/')){
      const payload=request.method==='POST'?await body(request):undefined;
      const input=new Request(origin+url.pathname,{method:request.method,headers:request.headers,...(payload?{body:payload}:{})});
      const result=await handleChatAuth(input,url.pathname.slice('/api/auth/'.length),{origin,rpID,rpc:db.rpc});
      response.statusCode=result.status;
      for(const [key,value] of result.headers)if(key!=='set-cookie')response.setHeader(key,value);
      const cookies=result.headers.getSetCookie();if(cookies.length)response.setHeader('Set-Cookie',cookies);
      response.end(Buffer.from(await result.arrayBuffer()));return;
    }
    const upstream=await fetch('http://127.0.0.1:3200'+url.pathname+url.search,{headers:{accept:request.headers.accept??'*/*'}});
    response.statusCode=upstream.status;
    for(const [key,value] of upstream.headers)if(!['content-encoding','content-length','transfer-encoding','connection'].includes(key))response.setHeader(key,value);
    response.end(Buffer.from(await upstream.arrayBuffer()));
  }catch{json(response,{error:'FIXTURE_UNAVAILABLE'},500);}
});
server.listen(3212,'127.0.0.1',()=>console.log('Isolated HTTPS authentication fixture ready.'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
  server.close();db.close();rm(temp,{recursive:true,force:true}).finally(()=>process.exit(0));
});
