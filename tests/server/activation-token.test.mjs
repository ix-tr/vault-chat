import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createActivationToken, hashActivationToken, activationLink } from '../../server/activation-token.mjs';
test('activation secret uses 256 random bits and only its digest belongs in the database', () => {
  const first = createActivationToken(), second = createActivationToken();
  expect(first.token).not.toBe(second.token);
  expect(first.hash).not.toEqual(second.hash);
  expect(first.hash).toEqual(new Uint8Array(createHash('sha256').update(Buffer.from(first.token, 'base64url')).digest()));
  const link = new URL(activationLink('https://chat.example.test', first.token));
  expect(link.pathname).toBe('/activate');
  expect(link.search).toBe('');
  expect(link.hash).toBe(`#activation=${first.token}`);
});
test('ambiguous tokens and unsafe origin configuration are rejected', () => {
  for (const token of ['', 'a'.repeat(42), 'a'.repeat(44), 'a'.repeat(42)+'=', 'a'.repeat(42)+'_']) expect(() => hashActivationToken(token)).toThrow('INVALID_ACTIVATION_TOKEN');
  const { token } = createActivationToken();
  for (const origin of ['http://chat.example.test', 'https://user:password@chat.example.test', 'https://chat.example.test/path', 'https://chat.example.test/?x=1', 'https://chat.example.test/#x']) expect(() => activationLink(origin, token)).toThrow('INVALID_CHAT_ORIGIN');
});
