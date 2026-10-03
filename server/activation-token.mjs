// Server-only bearer token utility. No real enrollment endpoint is enabled.
import { randomBytes, createHash } from 'node:crypto';
function decode(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('INVALID_ACTIVATION_TOKEN');
  const bytes = Buffer.from(token, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== token) throw new Error('INVALID_ACTIVATION_TOKEN');
  return bytes;
}
export function hashActivationToken(token) {
  const bytes = decode(token);
  try { return new Uint8Array(createHash('sha256').update(bytes).digest()); }
  finally { bytes.fill(0); }
}
export function createActivationToken() {
  const bytes = randomBytes(32);
  try {
    const token = bytes.toString('base64url');
    return { token, hash: hashActivationToken(token) };
  } finally { bytes.fill(0); }
}
export function activationLink(chatOrigin, token) {
  decode(token).fill(0);
  const origin = new URL(chatOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('INVALID_CHAT_ORIGIN');
  const link = new URL('/activate', origin);
  link.hash = `activation=${token}`;
  return link.href;
}
