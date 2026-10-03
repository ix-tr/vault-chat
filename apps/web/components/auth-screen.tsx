'use client';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { authText,product } from '@vault/shared';
import { AuthFlow,api,AuthError } from '../lib/auth-flow';
import type { Policy } from '../lib/device-client';
import { Button } from './ui/button';

function errorMessage(error:unknown,activation:boolean) {
  const code=error instanceof AuthError?error.code:error instanceof Error?error.message:'';
  if(code==='AUTH_NOT_READY')return authText.notReady;
  if(code==='UNSUPPORTED_BROWSER')return authText.unsupported;
  if(code==='DEVICE_STATE_MISSING')return authText.missingDevice;
  if(code==='PRF_REQUIRED' || code==='WRONG_PASSKEY')return authText.prfRequired;
  if(code==='UNLOCK_FAILED')return authText.badPassword;
  if(code==='DEVICE_ALREADY_EXISTS')return authText.deviceExists;
  if(code==='NETWORK_UNAVAILABLE')return authText.network;
  if(code==='RATE_LIMITED')return authText.rate;
  if(code==='PASSWORD_LENGTH')return authText.length;
  if(code==='PASSKEY_CANCELLED' || code==='USER_CANCELLED' || error instanceof DOMException && ['NotAllowedError','AbortError'].includes(error.name))return authText.cancelled;
  if(/STORAGE|STATE|SNAPSHOT|WORKER|CRYPTO|BINDING|PUBLIC_RECORD/.test(code))return authText.badStorage;
  return activation?authText.invalidLink:authText.failed;
}
export function AuthScreen({activation=false}:{activation?:boolean}) {
  const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[message,setMessage]=useState(''),[signedIn,setSignedIn]=useState(false);
  const [prompt,setPrompt]=useState<{purpose:'new'|'unlock';policy:Policy}>();
  const token=useRef<string>('');
  const pending=useRef<{resolve:(value:string)=>void;reject:(error:Error)=>void}>(undefined);
  const flow=useRef<AuthFlow>(undefined);
  const initial=useRef<Promise<void>>(undefined);
  const epoch=useRef(0);
  const form=useRef<HTMLFormElement>(null);
  useEffect(()=>{
    let current=true;
    if(!initial.current)initial.current=(async()=>{
      if(activation){
        token.current=new URLSearchParams(location.hash.slice(1)).get('activation')??'';
        history.replaceState(null,'',location.pathname);
        if(!/^[A-Za-z0-9_-]{43}$/.test(token.current))throw new AuthError('INVALID_LINK');
        await api('activation-info',{token:token.current});
      }else await api('policy');
    })();
    initial.current.then(()=>{if(current)setReady(true);},error=>{if(current)setMessage(errorMessage(error,activation));});
    return()=>{current=false;};
  },[activation]);
  useEffect(()=>{
    const lock=()=>{epoch.current++;form.current?.reset();flow.current?.close();pending.current?.reject(new Error('USER_CANCELLED'));pending.current=undefined;setSignedIn(false);};
    window.addEventListener('pagehide',lock);
    return()=>{window.removeEventListener('pagehide',lock);lock();};
  },[]);
  async function authenticate() {
    if(busy)return;setBusy(true);setMessage('');
    const attempt=++epoch.current;
    flow.current?.close();
    flow.current=new AuthFlow((purpose,policy)=>new Promise((resolve,reject)=>{pending.current={resolve,reject};setPrompt({purpose,policy});}));
    try{
      if(activation)await flow.current.enroll(token.current);else await flow.current.login();
      if(epoch.current!==attempt){flow.current?.close();return;}
      token.current='';setSignedIn(true);
      // Firefox may wait for a native permission decision indefinitely. This
      // optional request must never hold login/logout controls disabled.
      setMessage(authText.storageWarning);
      try{void navigator.storage?.persist?.().then(granted=>{if(epoch.current===attempt)setMessage(granted?'':authText.storageWarning);},()=>{if(epoch.current===attempt)setMessage(authText.storageWarning);});}catch{/* Keep the storage warning and usable controls. */}
    }catch(error){flow.current?.close();if(epoch.current===attempt)setMessage(errorMessage(error,activation));}
    finally{setBusy(false);setPrompt(undefined);pending.current=undefined;}
  }
  function submitPassword(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget);
    const password=String(data.get('password')??''),confirm=String(data.get('confirm')??'');
    if(prompt?.purpose==='new' && password!==confirm){setMessage(authText.mismatch);return;}
    const bytes=new TextEncoder().encode(password);const valid=prompt && bytes.length>=prompt.policy.min_password_bytes && bytes.length<=prompt.policy.max_password_bytes;bytes.fill(0);
    if(!valid){setMessage(authText.length);return;}
    event.currentTarget.reset();setMessage('');setPrompt(undefined);pending.current?.resolve(password);
  }
  async function logout(){epoch.current++;setBusy(true);try{await flow.current?.logout();setSignedIn(false);setMessage(authText.locked);}catch(error){setSignedIn(false);setMessage(errorMessage(error,false));}finally{setBusy(false);}}
  function cancel(){form.current?.reset();setPrompt(undefined);pending.current?.reject(new Error('USER_CANCELLED'));}
  return <main className="auth-page"><a className="brand" href="/" aria-label={product.name}><span className="mark">V</span>{product.name}</a><section className="auth-card">
    <span className="eyebrow">PRIVATE BY DESIGN</span>
    <h1>{signedIn?authText.signedIn:prompt?prompt.purpose==='new'?authText.newPassword:authText.unlockPassword:activation?authText.activate:authText.login}</h1>
    <p>{signedIn?authText.signedInDetail:prompt?prompt.purpose==='new'?authText.passwordHint:authText.localUnlockHint:activation?authText.activationIntro:authText.loginIntro}</p>
    {prompt?<form ref={form} onSubmit={submitPassword}><label htmlFor="local-password">{authText.password}</label><input id="local-password" name="password" type="password" required autoComplete={prompt.purpose==='new'?'new-password':'current-password'} autoFocus maxLength={prompt.policy.max_password_bytes}/>{prompt.purpose==='new'&&<><label htmlFor="confirm-password">{authText.confirmPassword}</label><input id="confirm-password" name="confirm" type="password" required autoComplete="new-password" maxLength={prompt.policy.max_password_bytes}/></>}<div className="auth-actions"><Button type="submit">{authText.continue}</Button><Button type="button" onClick={cancel}>{authText.cancel}</Button></div></form>:signedIn?<Button disabled={busy} onClick={()=>void logout()}>{authText.signOut}</Button>:<Button disabled={busy||!ready} onClick={()=>void authenticate()}>{busy?authText.working:activation?authText.activationAction:authText.loginAction}</Button>}
    <p role="status" aria-live="polite">{message}</p>
    {activation&&!signedIn&&<a href="/signin">{authText.alreadyActivated}</a>}
  </section><a href="/">{authText.back}</a></main>;
}
