import { createPublicKey, verify } from 'node:crypto';

// Possession of the device's OpenMLS Ed25519 identity, independent of a synced
// passkey. This signs enrollment/login metadata, never a message protocol.
export function verifyDeviceProof({ accountId, deviceId, origin, challenge, publicKey, signature }) {
  if (publicKey.length !== 32 || challenge.length !== 32 || signature.length !== 64) return false;
  const identity = JSON.stringify(['vault-chat-device', 1, accountId, deviceId]);
  const payload = Buffer.from(JSON.stringify(['vault-device-enrollment', 1, identity, origin, [...challenge], [...publicKey]]));
  const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(publicKey).toString('base64url') }, format: 'jwk' });
  return verify(null, payload, key, signature);
}
