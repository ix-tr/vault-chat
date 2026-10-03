# Browser MLS evaluation

This directory evaluates the unmodified official OpenMLS WASM bindings. It uses only ephemeral demo identities and messages. Nothing here is imported by the chat/admin apps or exported by `@vault/crypto`. No production encryption capability is enabled.

On Linux x86-64 with Node 24, Docker, Git and tar:

```sh
pnpm build:crypto-spike
pnpm exec playwright install --with-deps chromium webkit firefox
pnpm test:crypto-spike
```

The builder pins upstream commit `3a3e35de3feeca8f6605143c464d5452ae584d43` (OpenMLS 0.9.0), its Cargo.lock, the Rust compiler image digest and the matching wasm-bindgen 0.2.126 archive checksum. It mounts only newly fetched public upstream source into Docker. Generated JS/WASM and provenance are ignored, and source/build caches remain in the printed temporary directory. The first run needs network access and several GB of temporary disk space. `Crypto spike` CI repeats the build and five-profile browser matrix.

The static test server listens only on `127.0.0.1:3210` and serves an allowlist. Its WASM permission is confined to the spike. `/blocked` deliberately omits that permission for both page and Worker. Production CSP remains unchanged.

Tests cover independent Workers, serialized KeyPackages/Welcome/ratchet trees, bidirectional two-member traffic, adding a third member with proposal/commit delivery, replay rejection, corrupted-ciphertext rejection and a subsequent valid message. The malformed-input test records a known upstream binding trap; a passing test means the hazard was reproduced, not fixed. Workers terminate after every scenario, and private keys are never exported to the harness.

See [the ADR](../../docs/adr/0001-crypto-stack.md) for the decision, audit boundary, measured sizes and unresolved production requirements. Browser emulation is not physical-device or installed-PWA evidence.
