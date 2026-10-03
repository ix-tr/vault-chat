import init, { Provider, Identity, KeyPackage } from '../vendor/openmls/openmls_wasm.js';
import { openStore,readState,commitState,readUnlockEnvelope } from './store.mjs';
import { createDeviceKey,unwrapDeviceKey,unlockPolicy,inspectDeviceEnvelope } from './unlock.mjs';
import { deviceIdentity } from './identity.mjs';

// The only RPCs are prepare, inspect, seal, restore and proof. No private state,
// CryptoKey, signer, generic signing or messaging operation is exported.
let provider,identity,db,key,binding,policy,limits,namespace,keyPackage;
let failed=false, sealed=false;
let revision=0;
let queue=Promise.resolve();
const text=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
const ready=init(new URL('./openmls_wasm_bg.wasm',self.location.href));
const aad=revision=>text.encode(JSON.stringify(['vault-chat-device-state',1,binding.origin,namespace,revision]));
function configure(value) {
  if (db) throw new Error('ALREADY_INITIALIZED');
  policy=unlockPolicy(value.cryptoPolicy);
  binding=value.binding;
  if (binding?.origin!==self.location.origin) throw new Error('WRONG_UNLOCK_ORIGIN');
  for (const field of ['accountId','deviceId']) if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(binding?.[field]??'')) throw new Error('INVALID_DEVICE_BINDING');
  limits=value.limits;
  for (const field of ['maxWireBytes','maxSnapshotBytes','maxOutbox','maxKeyPackageBytes']) if (!Number.isSafeInteger(limits?.[field]) || limits[field]<=0 || limits[field]>0x7fffffff) throw new Error('INVALID_LIMITS');
  if (limits.maxSnapshotBytes<limits.maxWireBytes) throw new Error('INVALID_LIMITS');
  namespace=`${binding.accountId}:${binding.deviceId}`;
  return deviceIdentity(binding,policy.maxIdentityBytes);
}
function publicData() {
  return {signaturePublicKey:identity.public_key(),keyPackage:new Uint8Array(keyPackage),binding:{...binding,signaturePublicKey:[...identity.public_key()]}};
}
async function open(value) {
  const name=configure(value);
  db=await openStore(namespace,'vault-chat-device');
  return name;
}
async function prepare(value) {
  const name=await open(value);
  if (await readState(db) || await readUnlockEnvelope(db)) throw new Error('DEVICE_ALREADY_EXISTS');
  provider=new Provider(limits.maxWireBytes,limits.maxSnapshotBytes);
  identity=new Identity(provider,name);
  const generated=identity.key_package(provider);
  try {keyPackage=generated.to_bytes();}finally{generated.free();}
  if (!keyPackage.length || keyPackage.length>limits.maxKeyPackageBytes) throw new Error('KEY_PACKAGE_LIMIT');
  const validated=KeyPackage.from_bytes(provider,keyPackage);validated.free();
  return publicData();
}
async function inspect(value) {
  await open(value);
  const record=await readState(db), envelope=await readUnlockEnvelope(db);
  if (!record || !envelope) throw new Error('DEVICE_STATE_MISSING');
  const meta=inspectDeviceEnvelope(envelope,binding,policy);
  // Public method parameters only, never the wrapped DEK or ciphertext.
  return {binding:meta.binding,method:meta.method};
}
async function seal(credentials) {
  if (!identity || !Number.isSafeInteger(revision+1)) throw new Error('INVALID_TRANSITION');
  const created=await createDeviceKey(credentials,{...binding,signaturePublicKey:identity.public_key()},policy);
  key=created.key;
  const snapshot=provider.snapshot();let plaintext;
  try {
    plaintext=text.encode(JSON.stringify({version:1,name:deviceIdentity(binding,policy.maxIdentityBytes),publicKey:[...identity.public_key()],keyPackage:[...keyPackage],store:decoder.decode(snapshot)}));
    if (plaintext.length>limits.maxSnapshotBytes) throw new Error('SNAPSHOT_LIMIT');
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(revision+1)},key,plaintext);
    await commitState(db,revision,{version:1,revision:revision+1,iv,ciphertext},[],limits.maxOutbox,created.envelope);
    revision++;
    sealed=true;
    return {...publicData(),method:created.envelope.method};
  } finally {snapshot.fill(0);plaintext?.fill(0);}
}
async function restore(value) {
  const name=await open(value);
  const record=await readState(db),envelope=await readUnlockEnvelope(db);
  if (!record || !envelope) throw new Error('DEVICE_STATE_MISSING');
  if (record.version!==1 || !Number.isSafeInteger(record.revision) || record.revision<=0 || !(record.iv instanceof Uint8Array) || record.iv.length!==12 || !(record.ciphertext instanceof ArrayBuffer) || record.ciphertext.byteLength>limits.maxSnapshotBytes+16) throw new Error('INVALID_SNAPSHOT');
  key=await unwrapDeviceKey(envelope,value.credentials,binding,policy);
  let plaintext,store;
  try {
    plaintext=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv,additionalData:aad(record.revision)},key,record.ciphertext));
    const snapshot=JSON.parse(decoder.decode(plaintext));
    if (snapshot.version!==1 || snapshot.name!==name || JSON.stringify(snapshot.publicKey)!==JSON.stringify(envelope.binding.signaturePublicKey) || typeof snapshot.store!=='string' || !Array.isArray(snapshot.keyPackage) || snapshot.keyPackage.length>limits.maxKeyPackageBytes || snapshot.keyPackage.some(b=>!Number.isInteger(b)||b<0||b>255)) throw new Error('INVALID_SNAPSHOT');
    store=text.encode(snapshot.store);
    provider=Provider.restore(store,limits.maxWireBytes,limits.maxSnapshotBytes);
    identity=Identity.restore(provider,name,new Uint8Array(snapshot.publicKey));
    keyPackage=new Uint8Array(snapshot.keyPackage);
    const validated=KeyPackage.from_bytes(provider,keyPackage);validated.free();
    revision=record.revision;sealed=true;return publicData();
  } finally {plaintext?.fill(0);store?.fill(0);}
}
async function run(op,value) {
  if (failed) throw new Error('WORKER_CLOSED');
  await ready;
  if (op==='prepare') return prepare(value);
  if (op==='inspect') return inspect(value);
  if (op==='restore') return restore(value);
  if (op==='seal') return seal(value.credentials);
  if (op==='proof') {
    if (!identity || !sealed) throw new Error('DEVICE_LOCKED');
    if (!(value.challenge instanceof Uint8Array) || value.challenge.length!==32) throw new Error('INVALID_CHALLENGE');
    return identity.prove_enrollment(provider,binding.origin,value.challenge);
  }
  throw new Error('UNSUPPORTED_OPERATION');
}
self.onmessage=({data:{id,op,value}})=>{
  queue=queue.then(async()=>{
    try {self.postMessage({id,ok:true,result:await run(op,value)});}
    catch(error){
      failed=true;db?.close();
      try {identity?.free();provider?.free();}catch{/* Never reuse a trapped instance. */}
      db=identity=provider=key=undefined;
      self.postMessage({id,ok:false,code:/^[A-Z][A-Z_]+$/.test(error?.message??'')?error.message:'DEVICE_CRYPTO_FAILED'});
    }finally{
      for (const secret of [value?.credentials?.passphrase,value?.credentials?.result]) if(secret instanceof Uint8Array) secret.fill(0);
    }
  });
};
