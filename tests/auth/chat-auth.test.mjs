import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { authDatabase } from './database.mjs';
import { authenticator,deviceIdentity } from './authenticator.mjs';
import { handleChatAuth,productionChatAuth } from '../../server/chat-auth.mjs';
import { createActivationToken } from '../../server/activation-token.mjs';

const origin='https://chat.example.test';
const rpID='chat.example.test';
const policy=JSON.parse(readFileSync('tests/auth/policy.json','utf8'));
let db;
before(async()=>{db=await authDatabase();const link=createActivationToken();await db.rpc('bootstrap',{settings:policy,token_hash:Buffer.from(link.hash).toString('hex')});});
after(()=>db?.close());
async function request(action,body={},cookie='',headers={}) {
  const method=action==='me'?'GET':'POST';
  return handleChatAuth(new Request(`${origin}/api/auth/${action}`,{method,headers:{'content-type':'application/json',origin,'sec-fetch-site':'same-origin',cookie,...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})}),action,{origin,rpID,rpc:db.rpc});
}
function cookies(response) { return response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '); }
async function pending() {
  const link=createActivationToken();
  const {account_id:accountId}=await db.rpc('operator_create_account',{token_hash:Buffer.from(link.hash).toString('hex')});
  const deviceId=randomUUID(); const device=deviceIdentity(accountId,deviceId,origin);const passkey=authenticator();
  const response=await request('enroll-options',{token:link.token,device_id:deviceId,public_key:device.publicKey,key_package:Buffer.from('fixture-public-key-package').toString('base64url')});
  assert.equal(response.status,200); const options=await response.json();
  return {accountId,deviceId,device,passkey,link,options,flow:cookies(response)};
}
async function enroll(context,overrides={}) {
  const {options,device,passkey,flow}=context;
  return request('enroll-finish',{challenge_id:options.challenge_id,credential:passkey.registration({challenge:options.options.challenge,origin,rpID,...overrides}),device_proof:device.prove(options.options.challenge)},flow);
}
async function login(context,overrides={}) {
  const response=await request('login-options',{device_id:context.deviceId}); assert.equal(response.status,200);
  const options=await response.json();
  const body={challenge_id:options.challenge_id,credential:context.passkey.assertion({challenge:options.options.challenge,origin,rpID,accountId:context.accountId,...overrides}),device_proof:context.device.prove(options.options.challenge)};
  const flow=cookies(response);
  return {response:await request('login-finish',body,flow),body,flow};
}
test('verified registration/login, scoped opaque cookies, session fencing and logout',async()=>{
  const ctx=await pending(); const registered=await enroll(ctx); assert.equal(registered.status,200);
  assert.match(registered.headers.getSetCookie().find(c=>c.startsWith('__Host-vault_chat=')),/Secure; HttpOnly; SameSite=Strict/);
  assert.equal((await request('me',{},cookies(registered))).status,200);
  const logged=await login(ctx); assert.equal(logged.response.status,200);
  assert.equal((await request('me',{},cookies(registered))).status,401);
  const session=cookies(logged.response);
  assert.equal((await request('me',{},session)).status,200);
  assert.equal((await request('login-finish',logged.body,logged.flow)).status,401);
  assert.equal((await request('logout',{},session)).status,200);
  assert.equal((await request('me',{},session)).status,401);
});
test('registration rejects missing UV, wrong signed origin/RP/challenge without activation',async()=>{
  for (const override of [{uv:false},{origin:'https://admin.example.test'},{rpID:'admin.example.test'},{challenge:'A'.repeat(43)}]) {
    const ctx=await pending(); assert.equal((await enroll(ctx,override)).status,401);
    assert.equal((await request('activation-info',{token:ctx.link.token})).status,200);
    assert.equal((await enroll(ctx)).status,401); // Failed verification spent the challenge.
  }
});
test('login rejects missing UV, wrong origin/RP, invalid signature and stale counters',async()=>{
  const ctx=await pending();assert.equal((await enroll(ctx)).status,200);
  for (const override of [{uv:false},{origin:'https://admin.example.test'},{rpID:'admin.example.test'}]) assert.equal((await login(ctx,override)).response.status,401);
  const logged=await login(ctx,{counter:2});assert.equal(logged.response.status,200);
  assert.equal((await login(ctx,{counter:1})).response.status,401);
  const optionsResponse=await request('login-options',{device_id:ctx.deviceId});const options=await optionsResponse.json();
  const credential=ctx.passkey.assertion({challenge:options.options.challenge,origin,rpID,accountId:ctx.accountId,counter:3});
  credential.response.signature=Buffer.alloc(64).toString('base64url');
  assert.equal((await request('login-finish',{challenge_id:options.challenge_id,credential,device_proof:ctx.device.prove(options.options.challenge)},cookies(optionsResponse))).status,401);
});
test('another browser cannot spend the flow and a synced passkey cannot substitute device proof',async()=>{
  const ctx=await pending();const body={challenge_id:ctx.options.challenge_id,credential:ctx.passkey.registration({challenge:ctx.options.options.challenge,origin,rpID}),device_proof:ctx.device.prove(ctx.options.options.challenge)};
  assert.equal((await request('enroll-finish',body,'__Host-vault_flow='+createActivationToken().token)).status,401);
  const winner=await request('enroll-finish',body,ctx.flow);assert.equal(winner.status,200);
  const other=deviceIdentity(ctx.accountId,ctx.deviceId,origin);
  const resp=await request('login-options',{device_id:ctx.deviceId});const opts=await resp.json();
  assert.equal((await request('login-finish',{challenge_id:opts.challenge_id,credential:ctx.passkey.assertion({challenge:opts.options.challenge,origin,rpID,accountId:ctx.accountId}),device_proof:other.prove(opts.options.challenge)},cookies(resp))).status,401);
});
test('simultaneous redemption has one verified winner and no partial credential/device state',async()=>{
  const ctx=await pending();const responses=await Promise.all([enroll(ctx),enroll(ctx)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);
  const id=ctx.accountId;
  const count=db.sql(`select (select count(*) from public.devices where account_id='${id}') || ':' || (select count(*) from public.auth_passkeys where account_id='${id}');`);
  assert.equal(count.trim(),'1:1');
});
test('challenge expiry, session idle timeout, account disable and device revocation fail closed',async()=>{
  const expired=await pending();db.sql(`update public.auth_challenges set expires_at=clock_timestamp()-interval '1 second' where id='${expired.options.challenge_id}';`);
  assert.equal((await enroll(expired)).status,401);
  for (const mutation of ['idle','disabled','revoked']) {
    const ctx=await pending();const registered=await enroll(ctx);assert.equal(registered.status,200);
    if (mutation==='idle') db.sql(`update public.chat_sessions set last_seen_at=clock_timestamp()-interval '1 hour' where device_id='${ctx.deviceId}';`);
    if (mutation==='disabled') db.sql(`update public.accounts set status='disabled' where id='${ctx.accountId}';`);
    if (mutation==='revoked') db.sql(`update public.devices set revoked_at=clock_timestamp() where id='${ctx.deviceId}';`);
    assert.equal((await request('me',{},cookies(registered))).status,401);
  }
});
test('admin origin, unsupported method, secret extension/password fields and unbounded bodies rejected',async()=>{
  assert.equal((await request('activation-info',{},'',{origin:'https://admin.example.test'})).status,403);
  assert.equal((await request('me',{},'',{'sec-fetch-site':'same-site'})).status,403);
  assert.equal((await request('activation-info',{password:'never-send-this'})).status,400);
  assert.equal((await request('activation-info',{token:'x'.repeat(policy.max_auth_body_bytes)})).status,413);
  const ctx=await pending();const credential=ctx.passkey.registration({challenge:ctx.options.options.challenge,origin,rpID});credential.clientExtensionResults={prf:{results:{first:'never-send-this'}}};
  assert.equal((await request('enroll-finish',{challenge_id:ctx.options.challenge_id,credential,device_proof:ctx.device.prove(ctx.options.options.challenge)},ctx.flow)).status,400);
  assert.equal((await request('bootstrap',{})).status,404);
  const production=await productionChatAuth(new Request(`${origin}/api/auth/me`),'me');assert.equal(production.status,503);
});
test('last super admin, second bootstrap, client RPC/table denial, audit hash chain',async()=>{
  await assert.rejects(db.rpc('bootstrap',{settings:policy,token_hash:Buffer.from(createActivationToken().hash).toString('hex')}));
  assert.throws(()=>db.sql("update public.account_roles set role='user' where role='super_admin';"));
  assert.throws(()=>db.sql("delete from public.account_roles where role='super_admin';"));
  assert.equal(db.sql("select has_function_privilege('anon','public.vault_auth(text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.vault_auth(text,jsonb)','EXECUTE');").trim(),'f');
  assert.equal(db.sql("select has_sequence_privilege('authenticated','public.admin_audit_sequence_seq','USAGE');").trim(),'f');
  for (const table of ['auth_passkeys','auth_challenges','chat_sessions','admin_audit','device_key_packages']) assert.equal(db.sql(`select has_table_privilege('service_role','public.${table}','SELECT');`).trim(),'f');
  assert.equal(db.sql("select bool_and(event_hash=extensions.digest(previous_hash||convert_to(canonical_event,'UTF8'),'sha256')) from public.admin_audit;").trim(),'t');
  assert.equal(db.sql("select bool_and(previous_hash=coalesce(prev,decode(repeat('00',32),'hex'))) from (select previous_hash,lag(event_hash) over(order by sequence) prev from public.admin_audit) chain;").trim(),'t');
});
test('account/global throttling and missing policy fail closed; admin cookies cannot authenticate chat',async()=>{
  const ctx=await pending();const registered=await enroll(ctx);assert.equal(registered.status,200);
  const session=cookies(registered);
  assert.equal((await request('me',{},session.replace('__Host-vault_chat=','__Host-vault_admin='))).status,401);
  db.sql(`insert into public.auth_rate_buckets(key,window_started_at,attempts) values('${ctx.accountId}',clock_timestamp(),${policy.auth_account_requests_per_window}) on conflict(key) do update set attempts=${policy.auth_account_requests_per_window},window_started_at=clock_timestamp();`);
  assert.equal((await request('me',{},session)).status,429);
  db.sql(`update public.auth_rate_buckets set attempts=${policy.auth_global_requests_per_window},window_started_at=clock_timestamp() where key='global';`);
  assert.equal((await request('activation-info',{token:ctx.link.token})).status,429);
  db.sql("delete from public.auth_rate_buckets; delete from public.app_settings where key='min_kdf_ops';");
  assert.equal((await request('me',{},session)).status,503);
  db.sql(`insert into public.app_settings(key,value) values('min_kdf_ops','${policy.min_kdf_ops}');`);
});
test('concurrent repeatable-read demotions cannot remove every super admin',async()=>{
  const second=await pending();
  const first=db.sql("select account_id from public.account_roles where role='super_admin' limit 1;").trim();
  db.sql(`update public.account_roles set role='super_admin' where account_id='${second.accountId}';`);
  const demote=id=>db.query(`begin isolation level repeatable read; select count(*) from public.account_roles where role='super_admin'; select pg_sleep(0.5); update public.account_roles set role='user' where account_id='${id}'; commit;`);
  const results=await Promise.allSettled([demote(first),demote(second.accountId)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(db.sql("select count(*) from public.account_roles where role='super_admin';").trim(),'1');
});
