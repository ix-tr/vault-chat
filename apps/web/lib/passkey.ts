export function base64(bytes:ArrayBuffer|Uint8Array) {
  let value='';for(const byte of new Uint8Array(bytes))value+=String.fromCharCode(byte);
  return btoa(value).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export function binary(value:string) {
  const bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  if(base64(bytes)!==value)throw new Error('INVALID_PUBLIC_RECORD');return bytes;
}
export interface CreationOptions extends Omit<PublicKeyCredentialCreationOptions,'challenge'|'user'|'excludeCredentials'|'extensions'> {
  challenge:string;user:{id:string;name:string;displayName:string};excludeCredentials?:{id:string;type:'public-key'}[];
}
export interface RequestOptions extends Omit<PublicKeyCredentialRequestOptions,'challenge'|'allowCredentials'|'extensions'> {
  challenge:string;allowCredentials?:{id:string;type:'public-key'}[];
}
type PrfInput = AuthenticationExtensionsClientInputs & {prf:{eval:{first:Uint8Array<ArrayBuffer>}}};
type PrfOutput = AuthenticationExtensionsClientOutputs & {prf?:{enabled?:boolean;results?:{first?:ArrayBuffer}}};
function checked(value:Credential|null) {
  if(!value || value.type!=='public-key')throw new Error('PASSKEY_CANCELLED');return value as PublicKeyCredential;
}
export function serialize(credential:PublicKeyCredential,registration:boolean) {
  const common={id:credential.id,rawId:base64(credential.rawId),type:'public-key'};
  if(registration){const r=credential.response as AuthenticatorAttestationResponse;return {...common,response:{clientDataJSON:base64(r.clientDataJSON),attestationObject:base64(r.attestationObject)}};}
  const r=credential.response as AuthenticatorAssertionResponse;
  return {...common,response:{clientDataJSON:base64(r.clientDataJSON),authenticatorData:base64(r.authenticatorData),signature:base64(r.signature),userHandle:r.userHandle?base64(r.userHandle):null}};
}
export async function createPasskey(options:CreationOptions,prfInput:Uint8Array<ArrayBuffer>,signal?:AbortSignal) {
  const extensions:PrfInput={prf:{eval:{first:prfInput}}};
  return checked(await navigator.credentials.create({signal,publicKey:{...options,challenge:binary(options.challenge),user:{...options.user,id:binary(options.user.id)},excludeCredentials:options.excludeCredentials?.map(c=>({...c,id:binary(c.id)})),extensions},}));
}
export async function getPasskey(options:RequestOptions,credentialId:string,prfInput?:Uint8Array<ArrayBuffer>,signal?:AbortSignal) {
  const extensions:PrfInput|undefined=prfInput?{prf:{eval:{first:prfInput}}}:undefined;
  const result=checked(await navigator.credentials.get({signal,publicKey:{...options,challenge:binary(options.challenge),allowCredentials:[{type:'public-key',id:binary(credentialId)}],userVerification:'required',extensions}}));
  if(result.id!==credentialId)throw new Error('WRONG_PASSKEY');return result;
}
export function prfResult(credential:PublicKeyCredential) {
  const result=(credential.getClientExtensionResults() as PrfOutput).prf?.results?.first;
  return result instanceof ArrayBuffer && result.byteLength===32?new Uint8Array(result):undefined;
}
export function prfEnabled(credential:PublicKeyCredential) {return (credential.getClientExtensionResults() as PrfOutput).prf?.enabled===true;}
