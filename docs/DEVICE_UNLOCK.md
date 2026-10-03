# Credential unlock evaluation

Updated: 2026-10-03. Phase 0.5 isolated experiment; production apps and `@vault/crypto` remain inactive.

## Implemented boundary

The state Worker creates a random AES-256-GCM storage key. It wraps the key with an independent credential-derived AES key and stores only its encrypted envelope. The initial envelope, encrypted MLS snapshot and revision marker commit in the same strict IndexedDB transaction. Subsequent snapshots retain that envelope. Neither a plaintext storage key nor a CryptoKey is persisted. There is no key-export RPC.

The password path uses pinned `libsodium-wrappers-sumo` 0.8.4, currently reporting underlying libsodium 1.0.22, with the explicit Argon2id13 algorithm. Salt and cost parameters are recorded and authenticated. Callers must supply password-length and KDF cost bounds; stored costs outside the bounds fail before derivation. The demo fixture uses three operations and 64 MiB; this is not a physical mobile performance measurement or an approved production policy. No custom password derivation is implemented. See [libsodium password hashing](https://doc.libsodium.org/password_hashing/default_phf).

The PRF wrapping path derives an AES key with Web Crypto HKDF-SHA-256 from a 32-byte PRF output, a random salt and device-bound context. Credential ID and PRF input are authenticated metadata. A PRF envelope cannot be opened by the password path. Missing PRF support can select password wrapping during new enrollment; it must never silently convert an existing PRF envelope.

`passkey-prf.mjs` requests `userVerification: required`, checks credential ID and authenticator presence/verification flags, and feature-detects actual extension output. Its explicit server-payload allowlist excludes extension results. The caller must obtain a fresh server challenge and verify the assertion, challenge, signature, origin, RP ID and flags on the server. Local flag checks do not replace that verification. No real registration, server assertion verification, admin step-up or session issuance is implemented. See [WebAuthn PRF extension](https://www.w3.org/TR/webauthn-3/#prf-extension).

Authenticated wrapper metadata binds purpose, schema, exact origin, account ID, device ID and MLS signature public key. Restored snapshot identity and public key must match the envelope. Missing envelopes, wrong credentials, wrong binding or tampering close the Worker without resetting history. Buffers are cleared best effort; JavaScript strings, browser copies and WASM memory are not claimed to have guaranteed zeroization. An unlocked chat-origin XSS remains a threat to local chat capabilities; origin binding does not establish admin authorization.

The MLS BasicCredential contains a canonical account/device identity. `device-identity.mjs` separately matches public credentials and signature keys against a caller-supplied trusted directory and rejects duplicates/key mismatches. This helper is tested with public fixtures; it is not yet wired to OpenMLS member enumeration or an authenticated backend. Directory matching alone does not prove an account identity or prevent a malicious directory server. A production verified-directory/key-transparency design remains pending.

## Evidence and remaining gates

75 tests passed without skips across Chromium, WebKit, Firefox, Android Chromium emulation and iOS WebKit emulation. The original 50 MLS/state tests remain intact. New cases exercise genuine MLS restore after a full page reload using Argon2id, replay rejection, wrong credentials/binding/origin, rejected KDF costs, tampered/missing envelopes, synthetic PRF wrapping, a mocked WebAuthn extension helper and public-directory matching.

PRF wrapping uses synthetic output; helper tests use mock assertions. No real or virtual authenticator was tested, and no physical phone tested this unlock flow. Automated WebKit/Chromium coverage meets the phase's fallback browser checklist only. Before production integration: test real PRF-capable and unsupported authenticators, physical iOS Safari/Home Screen and Android Chrome/installed PWA, measure KDF latency/memory, implement server assertion verification and trusted member-directory integration, and review the complete wrapper/provider/storage boundary independently. The OpenMLS core audit does not cover this code or libsodium's current JS bundle.

Full-database rollback remains undetectable by the local revision marker. Existing live MLS state must not be restored from an old backup. Credential rotation/recovery, rate limiting, remote device registration, settings authentication, retention and delivery are not implemented here.

## Reproduce

```sh
pnpm build:crypto-spike
pnpm build:crypto-spike --adapter
pnpm build:unlock-spike
pnpm exec playwright install --with-deps chromium webkit firefox
pnpm test:crypto-spike --workers=3
```

The unlock bundle is generated with pinned esbuild 0.28.2 and ignored. CI rebuilds it from the frozen lockfile. Only the loopback evaluation server serves these modules; the hosted chat/admin previews do not expose this experiment.
