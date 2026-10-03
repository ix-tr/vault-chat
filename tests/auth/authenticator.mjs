import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

const hash = bytes => createHash('sha256').update(bytes).digest();
const b64 = bytes => Buffer.from(bytes).toString('base64url');
// Synthetic authenticator with real P-256 signing. Only a test fixture; the
// application still executes unmocked SimpleWebAuthn verification and SQL.
export function authenticator() {
  const { privateKey,publicKey } = generateKeyPairSync('ec',{ namedCurve:'prime256v1' });
  const jwk = publicKey.export({format:'jwk'});
  const id = randomBytes(32);
  const cose = isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
  function client(type,challenge,origin) { return Buffer.from(JSON.stringify({type,challenge,origin,crossOrigin:false})); }
  function authData(rpID,flags,counter) { const count=Buffer.alloc(4); count.writeUInt32BE(counter); return Buffer.concat([hash(Buffer.from(rpID)),Buffer.from([flags]),count]); }
  return {
    registration({ challenge,origin,rpID,uv=true }) {
      const length=Buffer.alloc(2); length.writeUInt16BE(id.length);
      const data=Buffer.concat([authData(rpID,uv?0x45:0x41,0),Buffer.alloc(16),length,id,Buffer.from(cose)]);
      const attestation = isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(data)]]));
      return {id:b64(id),rawId:b64(id),type:'public-key',response:{clientDataJSON:b64(client('webauthn.create',challenge,origin)),attestationObject:b64(attestation)}};
    },
    assertion({ challenge,origin,rpID,accountId,counter=1,uv=true }) {
      const data=authData(rpID,uv?0x05:0x01,counter);
      const clientData=client('webauthn.get',challenge,origin);
      return {id:b64(id),rawId:b64(id),type:'public-key',response:{clientDataJSON:b64(clientData),authenticatorData:b64(data),signature:b64(sign('sha256',Buffer.concat([data,hash(clientData)]),privateKey)),userHandle:b64(Buffer.from(accountId))}};
    },
  };
}

export function deviceIdentity(accountId,deviceId,origin) {
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const bytes=Buffer.from(publicKey.export({format:'jwk'}).x,'base64url');
  return { publicKey:b64(bytes), prove(challenge) {
    const identity=JSON.stringify(['vault-chat-device',1,accountId,deviceId]);
    const payload=Buffer.from(JSON.stringify(['vault-device-enrollment',1,identity,origin,[...Buffer.from(challenge,'base64url')],[...bytes]]));
    return b64(sign(null,payload,privateKey));
  } };
}
