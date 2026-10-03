export type Policy = Record<string, number>;
export type Binding = {origin:string;accountId:string;deviceId:string;signaturePublicKey?:number[]};
export type UnlockMethod = {name:'argon2id13'} | {name:'webauthn-prf-hkdf-sha256';credentialId:number[];prfInput:number[]};
export type PublicDevice = {binding:Binding;signaturePublicKey:Uint8Array;keyPackage:Uint8Array;method?:UnlockMethod};
export type Credentials = {kind:'passphrase';passphrase:Uint8Array} | {kind:'prf';result:Uint8Array;credentialId:Uint8Array;prfInput:Uint8Array};
export function workerConfig(binding:Binding,policy:Policy) {
  return {binding,limits:{maxWireBytes:policy.max_wire_bytes,maxSnapshotBytes:policy.max_snapshot_bytes,maxOutbox:policy.max_outbox,maxKeyPackageBytes:policy.max_key_package_bytes},cryptoPolicy:{
    minPasswordBytes:policy.min_password_bytes,maxPasswordBytes:policy.max_password_bytes,minOps:policy.min_kdf_ops,maxOps:policy.max_kdf_ops,
    minMemoryBytes:policy.min_kdf_memory_bytes,maxMemoryBytes:policy.max_kdf_memory_bytes,createOps:policy.create_kdf_ops,createMemoryBytes:policy.create_kdf_memory_bytes,
    maxIdentityBytes:policy.max_identity_bytes,maxDirectoryEntries:policy.max_directory_entries,maxCredentialBytes:policy.max_credential_bytes}};
}
export class DeviceClient {
  private worker:Worker;
  private sequence=0;
  private closed=false;
  private pending=new Map<number,{resolve:(result:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  constructor(private policy:Policy) {
    this.worker=new Worker('/crypto-assets/device-worker.js',{type:'module'});
    this.worker.onmessage=({data})=>{
      const request=this.pending.get(data.id);if(!request)return;
      this.pending.delete(data.id);clearTimeout(request.timer);
      if(data.ok)request.resolve(data.result);else{request.reject(new Error(data.code));this.close();}
    };
    this.worker.onerror=()=>this.close();
  }
  call<T>(op:'prepare'|'inspect'|'restore'|'seal'|'proof',value:unknown):Promise<T> {
    if(this.closed)return Promise.reject(new Error('WORKER_CLOSED'));
    return new Promise((resolve,reject)=>{
      const id=++this.sequence;
      const timer=setTimeout(()=>this.close(),this.policy.auth_challenge_ttl_seconds*1000);
      this.pending.set(id,{resolve:result=>resolve(result as T),reject,timer});
      try{
        this.worker.postMessage({id,op,value});
        const credentials=(value as {credentials?:Credentials})?.credentials;
        if(credentials?.kind==='passphrase')credentials.passphrase.fill(0);
        if(credentials?.kind==='prf')credentials.result.fill(0);
      }catch{this.close();}
    });
  }
  close() {
    if(this.closed)return;this.closed=true;this.worker.terminate();
    for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(new Error('WORKER_CLOSED'));}this.pending.clear();
  }
}
