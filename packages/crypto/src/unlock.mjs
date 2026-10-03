import sodium from 'libsodium-wrappers-sumo';
import { deviceIdentity } from './identity.mjs';
const text = new TextEncoder();
const purpose = 'vault-chat-device-key';
function fixed(value, length) {
  if (!Array.isArray(value) || value.length !== length || value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('INVALID_UNLOCK_RECORD');
  return new Uint8Array(value);
}
export function unlockPolicy(value) {
  for (const name of ['minPasswordBytes', 'maxPasswordBytes', 'minOps', 'maxOps', 'minMemoryBytes', 'maxMemoryBytes', 'createOps', 'createMemoryBytes', 'maxIdentityBytes', 'maxDirectoryEntries', 'maxCredentialBytes']) {
    if (!Number.isSafeInteger(value?.[name]) || value[name] <= 0 || value[name] > 0xffffffff) throw new Error('INVALID_UNLOCK_POLICY');
  }
  if (value.minPasswordBytes > value.maxPasswordBytes || value.minOps > value.maxOps || value.minMemoryBytes > value.maxMemoryBytes) throw new Error('INVALID_UNLOCK_POLICY');
  checkCost(value.createOps, value.createMemoryBytes, value);
  return value;
}
function checkCost(ops, memoryBytes, policy) {
  if (!Number.isSafeInteger(ops) || !Number.isSafeInteger(memoryBytes) || ops < policy.minOps || ops > policy.maxOps || memoryBytes < policy.minMemoryBytes || memoryBytes > policy.maxMemoryBytes) throw new Error('KDF_POLICY');
}
function bind(value, policy) {
  deviceIdentity(value, policy.maxIdentityBytes);
  if (value.origin !== self.location.origin) throw new Error('WRONG_UNLOCK_ORIGIN');
  const publicKey = value.signaturePublicKey instanceof Uint8Array ? value.signaturePublicKey : fixed(value.signaturePublicKey, 32);
  if (publicKey.length !== 32) throw new Error('INVALID_DEVICE_BINDING');
  return { origin: value.origin, accountId: value.accountId, deviceId: value.deviceId, signaturePublicKey: Array.from(publicKey) };
}
function metadata(envelope, expected, policy) {
  if (envelope?.version !== 1 || envelope.purpose !== purpose) throw new Error('INVALID_UNLOCK_RECORD');
  const binding = bind(envelope.binding, policy);
  if (binding.origin !== expected.origin || binding.accountId !== expected.accountId || binding.deviceId !== expected.deviceId) throw new Error('WRONG_DEVICE_BINDING');
  if (expected.signaturePublicKey) {
    const expectedKey = expected.signaturePublicKey instanceof Uint8Array ? expected.signaturePublicKey : fixed(expected.signaturePublicKey, 32);
    if (expectedKey.length !== 32 || !fixed(binding.signaturePublicKey, 32).every((byte, index) => byte === expectedKey[index])) throw new Error('WRONG_DEVICE_BINDING');
  }
  let method;
  if (envelope.method?.name === 'argon2id13') {
    const { ops, memoryBytes } = envelope.method;
    checkCost(ops, memoryBytes, policy);
    method = { name: 'argon2id13', salt: Array.from(fixed(envelope.method.salt, 16)), ops, memoryBytes };
  } else if (envelope.method?.name === 'webauthn-prf-hkdf-sha256') {
    const id = envelope.method.credentialId;
    if (!Array.isArray(id) || !id.length || id.length > policy.maxCredentialBytes) throw new Error('INVALID_UNLOCK_RECORD');
    method = { name: envelope.method.name, credentialId: Array.from(fixed(id, id.length)), prfInput: Array.from(fixed(envelope.method.prfInput, 32)), salt: Array.from(fixed(envelope.method.salt, 32)) };
  } else throw new Error('INVALID_UNLOCK_RECORD');
  return { version: 1, purpose, binding, method };
}
async function wrappingKey(credential, meta, policy) {
  if (meta.method.name === 'argon2id13') {
    if (credential?.kind !== 'passphrase' || !(credential.passphrase instanceof Uint8Array) || credential.passphrase.length < policy.minPasswordBytes || credential.passphrase.length > policy.maxPasswordBytes) throw new Error('INVALID_CREDENTIAL');
    let derived;
    try {
      await sodium.ready;
      derived = sodium.crypto_pwhash(32, credential.passphrase, fixed(meta.method.salt, 16), meta.method.ops, meta.method.memoryBytes, sodium.crypto_pwhash_ALG_ARGON2ID13);
      return await crypto.subtle.importKey('raw', derived, 'AES-GCM', false, ['encrypt', 'decrypt']);
    } catch { throw new Error('KDF_FAILED'); }
    finally { credential.passphrase.fill(0); derived?.fill(0); }
  }
  if (credential?.kind !== 'prf' || !(credential.result instanceof Uint8Array) || credential.result.length !== 32 || !(credential.credentialId instanceof Uint8Array) || !(credential.prfInput instanceof Uint8Array) || credential.credentialId.toString() !== meta.method.credentialId.toString() || credential.prfInput.toString() !== meta.method.prfInput.toString()) throw new Error('PRF_REQUIRED');
  try {
    const material = await crypto.subtle.importKey('raw', credential.result, 'HKDF', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: fixed(meta.method.salt, 32), info: text.encode(JSON.stringify([purpose, 'wrapping', meta.binding])) }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally { credential.result.fill(0); }
}
export async function createDeviceKey(credential, binding, policyInput) {
  const policy = unlockPolicy(policyInput);
  const method = credential?.kind === 'passphrase'
    ? { name: 'argon2id13', salt: Array.from(crypto.getRandomValues(new Uint8Array(16))), ops: policy.createOps, memoryBytes: policy.createMemoryBytes }
    : { name: 'webauthn-prf-hkdf-sha256', credentialId: Array.from(credential?.credentialId ?? []), prfInput: Array.from(credential?.prfInput ?? []), salt: Array.from(crypto.getRandomValues(new Uint8Array(32))) };
  const meta = metadata({ version: 1, purpose, binding, method }, binding, policy);
  const wrapping = await wrappingKey(credential, meta, policy);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: text.encode(JSON.stringify(meta)) }, wrapping, raw);
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return { key, envelope: { ...meta, iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(encrypted)) } };
  } finally { raw.fill(0); }
}
export async function unwrapDeviceKey(envelope, credential, expected, policyInput) {
  const policy = unlockPolicy(policyInput);
  deviceIdentity(expected, policy.maxIdentityBytes);
  if (expected.origin !== self.location.origin) throw new Error('WRONG_UNLOCK_ORIGIN');
  const meta = metadata(envelope, expected, policy);
  const iv = fixed(envelope.iv, 12);
  const encrypted = fixed(envelope.ciphertext, 48);
  const wrapping = await wrappingKey(credential, meta, policy);
  let raw;
  try {
    raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: text.encode(JSON.stringify(meta)) }, wrapping, encrypted));
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } catch { throw new Error('UNLOCK_FAILED'); }
  finally { raw?.fill(0); }
}
export function inspectDeviceEnvelope(envelope, expected, policyInput) {
  return metadata(envelope, expected, unlockPolicy(policyInput));
}
