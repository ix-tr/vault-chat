import { test,expect } from '@playwright/test';
import { activate,installAuthenticator,password,localPassword,pending } from './helpers';

test.beforeEach(async({page})=>installAuthenticator(page));
test('activation, encrypted persistence, reload/login and logout use real verification',async({page})=>{
  const bodies:string[]=[];page.on('request',request=>{if(request.url().includes('/api/auth/'))bodies.push(request.postData()??'');});
  const link=await activate(page);
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('vault-chat-device-v1')!));
  expect(before.binding.accountId).toBe(link.account_id);
  expect(JSON.stringify(before)).not.toContain(localPassword);
  const dbCheck=await page.evaluate(async(record)=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(`vault-chat-device:${record.binding.accountId}:${record.binding.deviceId}`);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
    try{return await new Promise<{encrypted:boolean;wrapped:boolean}>((resolve,reject)=>{
      const tx=db.transaction('state','readonly'),state=tx.objectStore('state'),current=state.get('current'),envelope=state.get('unlock');
      tx.oncomplete=()=>resolve({encrypted:current.result.ciphertext instanceof ArrayBuffer&&!('store' in current.result),wrapped:envelope.result.method.name==='argon2id13'&&envelope.result.ciphertext.length===48});tx.onabort=reject;
    });}finally{db.close();}
  },before);
  expect(dbCheck).toEqual({encrypted:true,wrapped:true});
  await page.goto('/signin');await page.getByRole('button',{name:'Sign in with passkey'}).click();await password(page);
  await expect(page.getByRole('heading',{name:'Your device is unlocked'})).toBeVisible();
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('vault-chat-device-v1')!));
  expect(after.publicKey).toBe(before.publicKey);expect(after.keyPackage).toBe(before.keyPackage);
  expect((await page.request.get('/api/auth/me')).status()).toBe(200);
  await page.getByRole('button',{name:'Sign out and lock'}).click();await expect(page.getByRole('status')).toContainText('This device is locked.');
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  for(const body of bodies){expect(body).not.toContain(localPassword);expect(body).not.toContain('passphrase');expect(body).not.toContain('clientExtensionResults');expect(body).not.toContain('prf');}
});
test('wrong local password and cancelled passkey preserve the original device',async({page})=>{
  await activate(page);const before=await page.evaluate(()=>localStorage.getItem('vault-chat-device-v1'));
  await page.goto('/signin');await page.getByRole('button',{name:'Sign in with passkey'}).click();await password(page,'wrong-demo-only-password');
  await expect(page.getByRole('status')).toContainText('could not unlock your keys');
  expect(await page.evaluate(()=>localStorage.getItem('vault-chat-device-v1'))).toBe(before);
  await page.evaluate(()=>sessionStorage.setItem('auth-fixture-cancel','true'));
  await page.getByRole('button',{name:'Sign in with passkey'}).click();await expect(page.getByRole('status')).toContainText('cancelled');
  await page.evaluate(()=>sessionStorage.removeItem('auth-fixture-cancel'));
  await page.getByRole('button',{name:'Sign in with passkey'}).click();await password(page);
  await expect(page.getByRole('heading',{name:'Your device is unlocked'})).toBeVisible();
});
test('missing storage and an unsupported browser report clear fallbacks',async({page})=>{
  await page.goto('/signin');await page.getByRole('button',{name:'Sign in with passkey'}).click();
  await expect(page.getByRole('status')).toContainText('No device keys were found');
  await page.evaluate(()=>Object.defineProperty(window,'PublicKeyCredential',{value:undefined}));
  await page.getByRole('button',{name:'Sign in with passkey'}).click();await expect(page.getByRole('status')).toContainText('This browser cannot use passkeys');
});
test('lost activation response recovers by login with the saved identity',async({page})=>{
  const link=await pending(page);
  await page.route('**/api/auth/enroll-finish',async route=>{await route.fetch();await route.abort();});
  await page.goto('/activate#activation='+link.token);await page.getByRole('button',{name:'Create passkey and activate'}).click();await password(page,localPassword,true);
  await expect(page.getByRole('status')).toContainText('Reconnect');
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('vault-chat-device-v1')!));expect(before.status).toBe('pending');
  await page.unroute('**/api/auth/enroll-finish');await page.goto('/signin');await page.getByRole('button',{name:'Sign in with passkey'}).click();await password(page);
  await expect(page.getByRole('heading',{name:'Your device is unlocked'})).toBeVisible();
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('vault-chat-device-v1')!));expect(after.publicKey).toBe(before.publicKey);expect(after.status).toBe('active');
});
test('mobile layout, fragment removal and Worker CSP stay bounded',async({page})=>{
  const link=await pending(page);await page.goto('/activate#activation='+link.token);
  await expect(page).toHaveURL('/activate');
  await page.setViewportSize({width:360,height:780});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const worker=await page.request.get('/crypto-assets/device-worker.js');expect(worker.status()).toBe(200);
  expect(worker.headers()['content-security-policy']).toContain("'wasm-unsafe-eval'");
  const html=await page.request.get('/activate');expect(html.headers()['content-security-policy']).not.toContain("'wasm-unsafe-eval'");
});
test('an unanswered storage permission request cannot disable sign-out',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator.storage,'persist',{value:()=>new Promise<boolean>(()=>{})}));
  await activate(page);
  await expect(page.getByRole('button',{name:'Sign out and lock'})).toBeEnabled();
  await page.getByRole('button',{name:'Sign out and lock'}).click();
  await expect(page.getByRole('status')).toContainText('This device is locked.');
});
test('tampered encrypted state fails closed without replacing device keys',async({page})=>{
  await activate(page);
  const before=await page.evaluate(()=>localStorage.getItem('vault-chat-device-v1'));
  await page.evaluate(async()=>{
    const record=JSON.parse(localStorage.getItem('vault-chat-device-v1')!);
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(`vault-chat-device:${record.binding.accountId}:${record.binding.deviceId}`);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
    try{await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),r=store.get('current');
      r.onsuccess=()=>{const damaged=new Uint8Array(r.result.ciphertext);damaged[damaged.length-1]^=1;store.put({...r.result,ciphertext:damaged.buffer},'current');};
      tx.oncomplete=()=>resolve();tx.onabort=reject;
    });}finally{db.close();}
  });
  await page.goto('/signin');await page.getByRole('button',{name:'Sign in with passkey'}).click();await password(page);
  await expect(page.getByRole('status')).toContainText('Encrypted device storage is unavailable or changed');
  expect(await page.evaluate(()=>localStorage.getItem('vault-chat-device-v1'))).toBe(before);
  await expect(page.getByRole('heading',{name:'Your device is unlocked'})).toHaveCount(0);
});
test('failed activation can retry with the same identity and a fresh passkey',async({page})=>{
  const link=await pending(page);await page.goto('/activate#activation='+link.token);
  await page.evaluate(()=>sessionStorage.setItem('auth-fixture-uv','false'));
  await page.getByRole('button',{name:'Create passkey and activate'}).click();await password(page,localPassword,true);
  await expect(page.getByRole('status')).toContainText('activation link');
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('vault-chat-device-v1')!));expect(before.status).toBe('pending');
  await page.evaluate(()=>sessionStorage.removeItem('auth-fixture-uv'));
  await page.getByRole('button',{name:'Create passkey and activate'}).click();await password(page);
  await password(page,localPassword,true);
  await expect(page.getByRole('heading',{name:'Your device is unlocked'})).toBeVisible();
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('vault-chat-device-v1')!));
  expect(after.publicKey).toBe(before.publicKey);expect(after.keyPackage).toBe(before.keyPackage);expect(after.status).toBe('active');expect(after.credentialId).not.toBe(before.credentialId);
});
