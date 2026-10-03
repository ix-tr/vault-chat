import { expect,type Page } from '@playwright/test';
export const localPassword='demo-only-device-password';
export async function installAuthenticator(page:Page) {
  await page.addInitScript(()=>{
    const encode=(value:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
    const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)).buffer;
    const contextId=sessionStorage.getItem('auth-fixture-context')??crypto.randomUUID();sessionStorage.setItem('auth-fixture-context',contextId);
    async function ceremony(kind:'create'|'get',options:CredentialCreationOptions|CredentialRequestOptions) {
      if(sessionStorage.getItem('auth-fixture-cancel')==='true')throw new DOMException('Cancelled','NotAllowedError');
      const publicKey=options.publicKey as PublicKeyCredentialCreationOptions;
      const result=await fetch('/fixture/credential',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context_id:contextId,kind,challenge:encode(publicKey.challenge as ArrayBuffer),account_id:kind==='create'?new TextDecoder().decode(publicKey.user.id):undefined,uv:sessionStorage.getItem('auth-fixture-uv')!=='false'})});
      const serialized=await result.json();
      const response:Record<string,ArrayBuffer|null>={};for(const [key,value] of Object.entries(serialized.response))response[key]=typeof value==='string'?decode(value):null;
      return {id:serialized.id,rawId:decode(serialized.rawId),type:'public-key',response,getClientExtensionResults:()=>({})};
    }
    Object.defineProperty(navigator,'credentials',{value:{create:(options:CredentialCreationOptions)=>ceremony('create',options),get:(options:CredentialRequestOptions)=>ceremony('get',options)}});
  });
}
export async function pending(page:Page) {const response=await page.request.get('/fixture/pending');expect(response.ok()).toBe(true);return response.json() as Promise<{token:string;account_id:string}>;}
export async function password(page:Page,value=localPassword,confirm=false) {
  await page.getByLabel('Local password',{exact:true}).fill(value);
  if(confirm)await page.getByLabel('Confirm local password').fill(value);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
}
export async function activate(page:Page) {
  const link=await pending(page);await page.goto('/activate#activation='+link.token);
  await expect(page).toHaveURL('/activate');
  await page.getByRole('button',{name:'Create passkey and activate'}).click();
  await password(page,localPassword,true);
  await expect(page.getByRole('heading',{name:'Your device is unlocked'})).toBeVisible();
  return link;
}
