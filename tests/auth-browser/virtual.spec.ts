import { test,expect } from '@playwright/test';
import { pending,password,localPassword } from './helpers';
for(const hasPrf of [true,false])test(`real browser virtual authenticator: ${hasPrf?'PRF':'local password'} activates and reopens device keys`,async({page,context})=>{
  const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',ctap2Version:'ctap2_1',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf}});
  try{
    const bodies:string[]=[];page.on('request',request=>{if(request.url().includes('/api/auth/'))bodies.push(request.postData()??'');});
    const link=await pending(page);await page.goto('/activate#activation='+link.token);
    await page.getByRole('button',{name:'Create passkey and activate'}).click();
    if(!hasPrf)await password(page,localPassword,true);
    await expect(page.getByRole('heading',{name:'Your device is unlocked'})).toBeVisible();
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('vault-chat-device-v1')!));
    await page.goto('/signin');await page.getByRole('button',{name:'Sign in with passkey'}).click();
    if(!hasPrf)await password(page);
    await expect(page.getByRole('heading',{name:'Your device is unlocked'})).toBeVisible();
    expect((await page.request.get('/api/auth/me')).status()).toBe(200);
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('vault-chat-device-v1')!));expect(after.publicKey).toBe(before.publicKey);
    for(const body of bodies){expect(body).not.toContain('clientExtensionResults');expect(body).not.toContain(localPassword);expect(body).not.toContain('prf');}
  }finally{await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});await cdp.detach();}
});
