import { randomBytes, randomUUID } from 'node:crypto';
import { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { hashActivationToken } from './activation-token.mjs';
import { verifyDeviceProof } from './device-proof.mjs';
import { productionAuthDependencies } from './auth-config.mjs';
import { validateAuthPolicy } from './auth-policy.mjs';

const flowCookie = '__Host-vault_flow';
const chatCookie = '__Host-vault_chat';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const methods = new Map([['policy', 'GET'], ['me', 'GET'], ['activation-info', 'POST'], ['enroll-options', 'POST'], ['enroll-finish', 'POST'], ['login-options', 'POST'], ['login-finish', 'POST'], ['logout', 'POST']]);
class Denied extends Error { constructor(status = 401) { super('AUTH_UNAVAILABLE'); this.status = status; } }
const hex = bytes => Buffer.from(bytes).toString('hex');
const digest = token => hex(hashActivationToken(token));
function uuid(value) { if (typeof value !== 'string' || !uuidPattern.test(value)) throw new Denied(400); return value; }
function binary(value, limit, exact) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > Math.ceil(limit * 4 / 3)) throw new Denied(400);
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value || bytes.length > limit || (exact && bytes.length !== exact)) throw new Denied(400);
  return bytes;
}
function positive(policy, name) { if (!Number.isSafeInteger(policy[name]) || policy[name] <= 0) throw new Denied(503); return policy[name]; }
function cookie(request, name) {
  const matches = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (matches.length !== 1) throw new Denied();
  const value = matches[0].slice(name.length + 1);
  binary(value, 32, 32);
  return value;
}
const cookieHeader = (name, value, ttl) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${ttl}`;
function response(data, status = 200, cookies = []) {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(data), { status, headers });
}
async function json(request, limit) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new Denied(415);
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new Denied(413);
  if (!request.body) throw new Denied(400);
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Denied(413); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Denied(400);
    return body;
  } finally { reader.releaseLock(); }
}
// Deliberately exclude every client extension value (including PRF output).
// Unknown fields are rejected rather than accidentally transmitting/storing secrets.
function credential(input, registration, limit) {
  if (!input || typeof input !== 'object' || Object.keys(input).some(k => !['id','rawId','type','response','authenticatorAttachment'].includes(k))) throw new Denied(400);
  binary(input.id, limit); binary(input.rawId, limit);
  if (input.id !== input.rawId || input.type !== 'public-key' || !input.response) throw new Denied(400);
  const fields = registration ? ['clientDataJSON','attestationObject','transports'] : ['clientDataJSON','authenticatorData','signature','userHandle'];
  if (Object.keys(input.response).some(k => !fields.includes(k))) throw new Denied(400);
  const out = {};
  for (const field of fields) {
    const value = input.response[field];
    if (field === 'transports') continue; // Hints aren't authentication evidence.
    if (field === 'userHandle' && (value === null || value === undefined)) { out[field] = null; continue; }
    binary(value, limit); out[field] = value;
  }
  return { id: input.id, rawId: input.rawId, type: 'public-key', response: out, clientExtensionResults: {} };
}
function exactBody(body, keys) { if (Object.keys(body).some(key => !keys.includes(key))) throw new Denied(400); }
async function rate(rpc, accountId) { if (!(await rpc('rate', accountId ? { account_id: accountId } : {})).allowed) throw new Denied(429); }

// Dependency injection only in the module used by isolated tests; the Next route
// always obtains the server-only Supabase store through production configuration.
export async function handleChatAuth(request, action, deps) {
  try {
    if (!methods.has(action)) return response({ error: 'NOT_FOUND' }, 404);
    if (request.method !== methods.get(action)) return response({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const { origin, rpID, rpc } = deps;
    const suppliedOrigin = request.headers.get('origin');
    const site = request.headers.get('sec-fetch-site');
    if ((request.method === 'POST' && suppliedOrigin !== origin) || (suppliedOrigin && suppliedOrigin !== origin) || (site && site !== 'same-origin' && site !== 'none')) throw new Denied(403);
    let policy;
    try { policy = validateAuthPolicy(await rpc('settings')); } catch { throw new Denied(503); }
    await rate(rpc);
    if (action === 'policy') return response({policy});
    if (action === 'me' || action === 'logout') {
      const token = cookie(request, chatCookie);
      const session = await rpc(action === 'me' ? 'session' : 'logout', { session_hash: digest(token), origin });
      if (action === 'me') { await rate(rpc, session.account_id); return response(session); }
      return response({ signed_out: true }, 200, [cookieHeader(chatCookie, '', 0), cookieHeader(flowCookie, '', 0)]);
    }
    const body = await json(request, positive(policy, 'max_auth_body_bytes'));
    if (action === 'activation-info') {
      exactBody(body, ['token']);
      const account = await rpc('activation_info', { token_hash: digest(body.token) });
      await rate(rpc, account.account_id);
      return response({ ...account, policy });
    }
    if (action === 'enroll-options' || action === 'login-options') {
      const enrollment = action === 'enroll-options';
      exactBody(body, enrollment ? ['token','device_id','public_key','key_package'] : ['device_id']);
      const id = randomUUID(); const challenge = randomBytes(32).toString('base64url'); const flow = randomBytes(32).toString('base64url');
      const input = { id, challenge, origin, device_id: uuid(body.device_id), browser_hash: digest(flow) };
      if (enrollment) Object.assign(input, { token_hash: digest(body.token), public_key: hex(binary(body.public_key,32,32)), key_package: hex(binary(body.key_package, positive(policy,'max_key_package_bytes'))) });
      const account = await rpc(enrollment ? 'begin_enroll' : 'begin_login', input);
      await rate(rpc, account.account_id);
      const timeout = positive(policy, 'auth_challenge_ttl_seconds') * 1000;
      const options = enrollment ? await generateRegistrationOptions({
        rpName: 'Vault Chat', rpID, challenge: Buffer.from(challenge, 'base64url'), userID: Buffer.from(account.account_id), userName: account.account_id,
        userDisplayName: 'Vault Chat', attestationType: 'none', timeout,
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      }) : await generateAuthenticationOptions({ rpID, challenge: Buffer.from(challenge, 'base64url'), userVerification: 'required', timeout });
      return response({ challenge_id: id, options, account_id: account.account_id, policy }, 200, [cookieHeader(flowCookie, flow, positive(policy,'auth_challenge_ttl_seconds'))]);
    }
    exactBody(body, ['challenge_id','credential','device_proof']);
    const browserHash = digest(cookie(request, flowCookie));
    const challenge = await rpc('take_challenge', { id: uuid(body.challenge_id), browser_hash: browserHash, origin });
    const enrollment = action === 'enroll-finish';
    if (challenge.kind !== (enrollment ? 'enroll' : 'login')) throw new Denied();
    await rate(rpc, challenge.account_id);
    const assertion = credential(body.credential, enrollment, positive(policy,'max_credential_bytes'));
    if (!verifyDeviceProof({ accountId: challenge.account_id, deviceId: challenge.payload.device_id, origin,
      challenge: binary(challenge.challenge,32,32), publicKey: Buffer.from(challenge.payload.public_key,'hex'), signature: binary(body.device_proof,64,64) })) throw new Denied();
    const input = { challenge_id: challenge.id, origin, browser_hash: browserHash, rp_id: rpID };
    if (enrollment) {
      const verified = await verifyRegistrationResponse({ response: assertion, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, requireUserPresence: true });
      if (!verified.verified || !verified.registrationInfo.userVerified) throw new Denied();
      const info = verified.registrationInfo;
      Object.assign(input, { credential_id: info.credential.id, credential_public_key: hex(info.credential.publicKey), counter: info.credential.counter, device_type: info.credentialDeviceType, backed_up: info.credentialBackedUp });
    } else {
      const stored = await rpc('credential', { id: assertion.id, origin });
      if (stored.account_id !== challenge.account_id || stored.rp_id !== rpID) throw new Denied();
      if (assertion.response.userHandle !== null && binary(assertion.response.userHandle,positive(policy,'max_credential_bytes')).toString('utf8') !== stored.account_id) throw new Denied();
      const verified = await verifyAuthenticationResponse({ response: assertion, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: stored.id, publicKey: new Uint8Array(Buffer.from(stored.public_key,'hex')), counter: Number(stored.counter) } });
      if (!verified.verified || !verified.authenticationInfo.userVerified) throw new Denied();
      Object.assign(input, { credential_id: stored.id, old_counter: stored.counter, counter: verified.authenticationInfo.newCounter, backed_up: verified.authenticationInfo.credentialBackedUp });
    }
    const token = randomBytes(32).toString('base64url'); input.session_hash = digest(token);
    const session = await rpc(enrollment ? 'finish_enroll' : 'finish_login', input);
    return response({ account_id: session.account_id, device_id: session.device_id }, 200, [cookieHeader(chatCookie, token, session.session_ttl_seconds), cookieHeader(flowCookie, '', 0)]);
  } catch (error) {
    return response({ error: 'AUTH_UNAVAILABLE' }, error instanceof Denied ? error.status : 401);
  }
}

export async function productionChatAuth(request, action) {
  let deps;
  try { deps = productionAuthDependencies(); }
  catch { return response({ error: 'AUTH_NOT_READY' }, 503); }
  return handleChatAuth(request, action, deps);
}
