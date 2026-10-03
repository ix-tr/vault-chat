// The caller must obtain and verify a fresh challenge on its authentication
// server. This helper does not authenticate an account or create an admin session.
export async function evaluatePasskeyPrf({ challenge, rpId, credentialId, prfInput }, getCredential = (options) => navigator.credentials.get(options)) {
  if (!(challenge instanceof Uint8Array) || !challenge.length || !(credentialId instanceof Uint8Array) || !credentialId.length || !(prfInput instanceof Uint8Array) || prfInput.length !== 32 || typeof rpId !== 'string' || !rpId.length) throw new Error('INVALID_PASSKEY_REQUEST');
  let assertion;
  try {
    assertion = await getCredential({ publicKey: { challenge, rpId, allowCredentials: [{ type: 'public-key', id: credentialId }], userVerification: 'required', extensions: { prf: { eval: { first: prfInput } } } } });
  } catch { throw new Error('PASSKEY_DENIED'); }
  if (!assertion || assertion.type !== 'public-key' || !(assertion.rawId instanceof ArrayBuffer) || new Uint8Array(assertion.rawId).toString() !== credentialId.toString()) throw new Error('WRONG_PASSKEY');
  const response = assertion.response;
  if (!(response?.authenticatorData instanceof ArrayBuffer) || response.authenticatorData.byteLength < 37 || (new Uint8Array(response.authenticatorData)[32] & 5) !== 5) throw new Error('USER_VERIFICATION_REQUIRED');
  const result = assertion.getClientExtensionResults()?.prf?.results?.first;
  // Explicit allowlist: never include client extension results in server payload.
  const serverAssertion = { id: assertion.id, type: assertion.type, rawId: assertion.rawId, response: { clientDataJSON: response.clientDataJSON, authenticatorData: response.authenticatorData, signature: response.signature, userHandle: response.userHandle } };
  if (!(result instanceof ArrayBuffer) || result.byteLength !== 32) return { supported: false, serverAssertion };
  return { supported: true, credential: { kind: 'prf', result: new Uint8Array(result), credentialId, prfInput }, serverAssertion };
}
