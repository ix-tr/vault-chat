import { DeviceClient,workerConfig,type Binding,type Credentials,type Policy,type PublicDevice,type UnlockMethod } from './device-client';
import { base64,binary,createPasskey,getPasskey,prfResult,prfEnabled,serialize,type CreationOptions,type RequestOptions } from './passkey';

const storageKey='vault-chat-device-v1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export class AuthError extends Error {constructor(public code:string){super(code);}}
export type Descriptor={version:1;binding:Binding;credentialId:string;publicKey:string;keyPackage:string;status:'pending'|'active'};
type Options<T>={challenge_id:string;account_id:string;policy:Policy;options:T};
type AskPassword=(purpose:'new'|'unlock',policy:Policy)=>Promise<string>;
export async function api<T>(action:string,body?:unknown):Promise<T> {
  let response:Response;
  try{response=await fetch(`/api/auth/${action}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});}
  catch{throw new AuthError('NETWORK_UNAVAILABLE');}
  if(!response.ok)throw new AuthError(response.status===503?'AUTH_NOT_READY':response.status===429?'RATE_LIMITED':'AUTH_UNAVAILABLE');
  return response.json() as Promise<T>;
}
function supported(){if(!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials?.create || !navigator.credentials?.get || !window.Worker || !window.indexedDB || !crypto.subtle)throw new AuthError('UNSUPPORTED_BROWSER');}
function descriptor(policy:Policy):Descriptor|null {
  let raw:string|null;try{raw=localStorage.getItem(storageKey);}catch{throw new AuthError('STORAGE_UNAVAILABLE');}
  if(!raw)return null;
  if(new TextEncoder().encode(raw).length>policy.max_auth_body_bytes)throw new AuthError('INVALID_PUBLIC_RECORD');
  let value:Descriptor;try{value=JSON.parse(raw);}catch{throw new AuthError('INVALID_PUBLIC_RECORD');}
  if(value.version!==1 || value.binding?.origin!==location.origin || !uuid.test(value.binding.accountId) || !uuid.test(value.binding.deviceId) || !['pending','active'].includes(value.status) || typeof value.credentialId!=='string' || typeof value.publicKey!=='string' || typeof value.keyPackage!=='string')throw new AuthError('INVALID_PUBLIC_RECORD');
  if(binary(value.publicKey).length!==32 || binary(value.credentialId).length>policy.max_credential_bytes || binary(value.keyPackage).length>policy.max_key_package_bytes)throw new AuthError('INVALID_PUBLIC_RECORD');
  return value;
}
function save(value:Descriptor) {try{localStorage.setItem(storageKey,JSON.stringify(value));}catch{throw new AuthError('STORAGE_UNAVAILABLE');}}
function passwordBytes(password:string,policy:Policy) {
  const bytes=new TextEncoder().encode(password);
  if(bytes.length<policy.min_password_bytes || bytes.length>policy.max_password_bytes){bytes.fill(0);throw new AuthError('PASSWORD_LENGTH');}return bytes;
}
export class AuthFlow {
  private worker?:DeviceClient;
  private readonly abort=new AbortController();
  private ensureOpen(){if(this.abort.signal.aborted)throw new AuthError('USER_CANCELLED');}
  constructor(private askPassword:AskPassword){}
  close(){this.abort.abort();this.worker?.close();this.worker=undefined;}
  private async method(record:Descriptor,policy:Policy):Promise<UnlockMethod> {
    const inspector=new DeviceClient(policy);
    try{return (await inspector.call<{method:UnlockMethod}>('inspect',workerConfig(record.binding,policy))).method;}finally{inspector.close();}
  }
  private async credentials(record:Descriptor,policy:Policy,method:UnlockMethod,options:RequestOptions) {
    const credential=await getPasskey(options,record.credentialId,method.name==='webauthn-prf-hkdf-sha256'?new Uint8Array(method.prfInput):undefined,this.abort.signal);
    let secret:Credentials;
    if(method.name==='webauthn-prf-hkdf-sha256'){
      const result=prfResult(credential);
      if(!result)throw new AuthError('PRF_REQUIRED');
      if(base64(new Uint8Array(method.credentialId))!==record.credentialId)throw new AuthError('WRONG_PASSKEY');
      secret={kind:'prf',result,credentialId:binary(record.credentialId),prfInput:new Uint8Array(method.prfInput)};
    }else secret={kind:'passphrase',passphrase:passwordBytes(await this.askPassword('unlock',policy),policy)};
    return {credential,secret};
  }
  async enroll(token:string) {
    supported();
    if(!navigator.locks?.request)throw new AuthError('UNSUPPORTED_BROWSER');
    return navigator.locks.request('vault-chat-enrollment',{ifAvailable:true},async lock=>{
      if(!lock)throw new AuthError('ENROLLMENT_IN_PROGRESS');
      return this.enrollLocked(token);
    });
  }
  private async enrollLocked(token:string) {
    this.worker?.close();supported();this.ensureOpen();
    const info=await api<{account_id:string;policy:Policy}>('activation-info',{token});
    this.ensureOpen();
    const policy=info.policy;let old=descriptor(policy);
    // An incomplete enrollment reuses its identity and KeyPackage. A fresh
    // passkey can rewrap that same encrypted state; no existing keys are reset.
    if(old && (old.binding.accountId!==info.account_id || old.status==='active'))throw new AuthError('DEVICE_ALREADY_EXISTS');
    const binding:Binding=old?.binding??{origin:location.origin,accountId:info.account_id,deviceId:crypto.randomUUID()};
    this.worker=new DeviceClient(policy);
    let publicDevice:PublicDevice|undefined;
    if(!old)publicDevice=await this.worker.call<PublicDevice>('prepare',workerConfig(binding,policy));
    const options=await api<Options<CreationOptions>>('enroll-options',{token,device_id:binding.deviceId,public_key:old?.publicKey??base64(publicDevice!.signaturePublicKey),key_package:old?.keyPackage??base64(publicDevice!.keyPackage)});
    if(old){
      const method=await this.method(old,policy);
      const {secret}=await this.credentials(old,policy,method,{challenge:options.options.challenge,rpId:options.options.rp.id});
      publicDevice=await this.worker.call<PublicDevice>('restore',{...workerConfig(binding,policy),credentials:secret});
      if(base64(publicDevice.signaturePublicKey)!==old.publicKey || base64(publicDevice.keyPackage)!==old.keyPackage)throw new AuthError('INVALID_PUBLIC_RECORD');
    }
    const prfInput=crypto.getRandomValues(new Uint8Array(32));
    const credential=await createPasskey(options.options,prfInput,this.abort.signal);
    this.ensureOpen();
    let result=prfResult(credential);
    if(!result && prfEnabled(credential))result=prfResult(await getPasskey({challenge:options.options.challenge,rpId:options.options.rp.id},credential.id,prfInput,this.abort.signal));
    this.ensureOpen();
    const secret:Credentials=result?{kind:'prf',result,credentialId:binary(credential.id),prfInput}:{kind:'passphrase',passphrase:passwordBytes(await this.askPassword('new',policy),policy)};
    publicDevice=await this.worker.call<PublicDevice>('seal',{credentials:secret});
    old={version:1,binding:publicDevice.binding,credentialId:credential.id,publicKey:base64(publicDevice.signaturePublicKey),keyPackage:base64(publicDevice.keyPackage),status:'pending'};
    save(old);
    const proof=await this.worker.call<Uint8Array>('proof',{challenge:binary(options.options.challenge)});
    const session=await api<{account_id:string;device_id:string}>('enroll-finish',{challenge_id:options.challenge_id,credential:serialize(credential,true),device_proof:base64(proof)});
    if(session.account_id!==binding.accountId || session.device_id!==binding.deviceId)throw new AuthError('WRONG_DEVICE_BINDING');
    save({...old,status:'active'});
    return session;
  }
  async login() {
    this.worker?.close();supported();this.ensureOpen();
    const {policy}=await api<{policy:Policy}>('policy');
    const record=descriptor(policy);if(!record)throw new AuthError('DEVICE_STATE_MISSING');
    const options=await api<Options<RequestOptions>>('login-options',{device_id:record.binding.deviceId});
    if(options.account_id!==record.binding.accountId)throw new AuthError('WRONG_DEVICE_BINDING');
    const method=await this.method(record,policy);
    const {credential,secret}=await this.credentials(record,policy,method,options.options);
    this.ensureOpen();
    this.worker=new DeviceClient(policy);
    await this.worker.call<PublicDevice>('restore',{...workerConfig(record.binding,policy),credentials:secret});
    const proof=await this.worker.call<Uint8Array>('proof',{challenge:binary(options.options.challenge)});
    const session=await api<{account_id:string;device_id:string}>('login-finish',{challenge_id:options.challenge_id,credential:serialize(credential,false),device_proof:base64(proof)});
    if(session.account_id!==record.binding.accountId || session.device_id!==record.binding.deviceId)throw new AuthError('WRONG_DEVICE_BINDING');
    save({...record,status:'active'});return session;
  }
  async logout(){this.close();await api('logout',{});}
}
