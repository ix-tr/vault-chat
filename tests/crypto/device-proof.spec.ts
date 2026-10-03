import { test,expect } from '@playwright/test';
import { createPublicKey,verify } from 'node:crypto';

test('OpenMLS identity signs the exact server device-possession challenge',async({page})=>{
  await page.goto('/');
  const fixture=await page.evaluate(async()=>{
    const path='/generated-adapter/openmls_wasm.js';
    const {default:init,Provider,Identity}=await import(path);
    await init();
    const accountId=crypto.randomUUID(),deviceId=crypto.randomUUID();
    const name=JSON.stringify(['vault-chat-device',1,accountId,deviceId]);
    const provider=new Provider(1048576,8388608);
    const identity=new Identity(provider,name);
    const challenge=crypto.getRandomValues(new Uint8Array(32));
    try {
      let invalid='';
      try {identity.prove_enrollment(provider,location.origin,new Uint8Array(31));}catch(error){invalid=error instanceof Error?error.message:'unknown';}
      return {accountId,deviceId,origin:location.origin,challenge:[...challenge],publicKey:[...identity.public_key()],signature:[...identity.prove_enrollment(provider,location.origin,challenge)],invalid};
    }finally{identity.free();provider.free();}
  });
  expect(fixture.invalid).toContain('INVALID_CHALLENGE');
  const identity=JSON.stringify(['vault-chat-device',1,fixture.accountId,fixture.deviceId]);
  const payload=Buffer.from(JSON.stringify(['vault-device-enrollment',1,identity,fixture.origin,fixture.challenge,fixture.publicKey]));
  const key=createPublicKey({key:{kty:'OKP',crv:'Ed25519',x:Buffer.from(fixture.publicKey).toString('base64url')},format:'jwk'});
  expect(verify(null,payload,key,Buffer.from(fixture.signature))).toBe(true);
  payload[payload.length-1]^=1;
  expect(verify(null,payload,key,Buffer.from(fixture.signature))).toBe(false);
});
