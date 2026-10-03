const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export function deviceIdentity(binding, maxIdentityBytes) {
  for (const field of ['accountId', 'deviceId']) {
    if (typeof binding?.[field] !== 'string' || !/^[A-Za-z0-9_-]+$/.test(binding[field]) || encoder.encode(binding[field]).length > maxIdentityBytes) throw new Error('INVALID_DEVICE_BINDING');
  }
  return JSON.stringify(['vault-chat-device', 1, binding.accountId, binding.deviceId]);
}
export function decodeDeviceIdentity(bytes, maxIdentityBytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > maxIdentityBytes * 2 + 64) throw new Error('INVALID_DEVICE_BINDING');
  let identity;
  try { identity = JSON.parse(decoder.decode(bytes)); } catch { throw new Error('INVALID_DEVICE_BINDING'); }
  if (!Array.isArray(identity) || identity.length !== 4 || identity[0] !== 'vault-chat-device' || identity[1] !== 1) throw new Error('INVALID_DEVICE_BINDING');
  const binding = { accountId: identity[2], deviceId: identity[3] };
  if (deviceIdentity(binding, maxIdentityBytes) !== decoder.decode(bytes)) throw new Error('INVALID_DEVICE_BINDING');
  return binding;
}
export function matchMemberDirectory(members, directory, policy) {
  if (!Array.isArray(directory) || !Array.isArray(members) || directory.length > policy.maxDirectoryEntries || members.length > policy.maxDirectoryEntries) throw new Error('DIRECTORY_LIMIT');
  const expected = new Map();
  for (const entry of directory) {
    const id = deviceIdentity(entry, policy.maxIdentityBytes);
    if (expected.has(id) || !(entry.signaturePublicKey instanceof Uint8Array) || entry.signaturePublicKey.length !== 32) throw new Error('INVALID_DEVICE_DIRECTORY');
    expected.set(id, entry.signaturePublicKey);
  }
  const seen = new Set();
  const indices = new Set();
  return members.map(([index, identity, publicKey]) => {
    if (!Number.isSafeInteger(index) || index < 0 || index > 0xffffffff || indices.has(index)) throw new Error('INVALID_DEVICE_DIRECTORY');
    indices.add(index);
    const binding = decodeDeviceIdentity(identity, policy.maxIdentityBytes);
    const id = deviceIdentity(binding, policy.maxIdentityBytes);
    const key = expected.get(id);
    if (seen.has(id) || !key || !(publicKey instanceof Uint8Array) || publicKey.length !== 32 || !key.every((byte, offset) => byte === publicKey[offset])) throw new Error('UNVERIFIED_DEVICE');
    seen.add(id);
    return { index, ...binding, signaturePublicKey: publicKey };
  });
}
