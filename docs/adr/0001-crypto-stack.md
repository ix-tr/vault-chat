# ADR 0001 — MLS with OpenMLS for browser messaging

Date: 2026-10-03. Status: select OpenMLS as the protocol-core direction for development; production adapter approval is pending. The experiment is not the application encryption layer.

## Context and decision

The owner permits MLS for both one-to-one and group conversations, requires an audited protocol implementation, and forbids a custom ratchet/group protocol. Use the OpenMLS Rust core compiled to WASM. Model a one-to-one conversation as an MLS group with the participants' device leaves; two users with several devices can require more than two leaves. Future group conversations use the same protocol. Account roles do not grant membership or decryption capability.

The audited OpenMLS implementation ran in browsers in this spike. This establishes feasibility, not a production security certification. Do not ship the upstream experimental binding unchanged. Develop a narrow application binding to the existing OpenMLS APIs, preserving the protocol implementation, and resolve the requirements below before implementing real encrypted accounts/messages. `@vault/crypto` remains inactive and the production apps do not import the experiment.

## Candidate comparison

| Candidate | Audit and maturity | Browser evidence | Outcome |
| --- | --- | --- | --- |
| Official libsignal, commit `257105c55a7389ca6b1e85185e2769465e6729f1` | Signal's maintained implementation; outside use is explicitly unsupported. Published TypeScript integration uses native Node add-ons. Protocol analysis does not establish an independently audited browser wrapper. | Attempted `cargo check --locked -p libsignal-protocol --target wasm32-unknown-unknown` in Rust Docker. Upstream toolchain resolved to 1.98.1. Compilation failed because getrandom 0.4.3 does not enable its WASM backend. No browser round trip, bundle-size or performance result is claimed. This is a failure of the unchanged build, not proof a custom binding is impossible. | Do not patch in an unsupported browser stack in this time-boxed spike. |
| OpenMLS 0.9.0, commit `3a3e35de3feeca8f6605143c464d5452ae584d43` | Independent SRLabs assessment of the core; actively released by upstream. The official WASM API is explicitly experimental. The selected later release is not claimed to be wholly re-audited. | Release build succeeded with locked dependencies. Five browser profiles passed genuine two/three-member MLS traffic in separate Workers, including integrity/replay cases. | Selected protocol-core direction; adapter/storage are separate release gates. |
| ts-mls, commit `8ee2f5f1ad01ddd442d2d8a7e04353789c9bf848` | Its security policy explicitly says no professional audit; maintained by a volunteer. | Not installed or benchmarked after failing the mandatory audit gate. No browser pass or measured bundle size is claimed. | Excluded until an appropriate independent audit exists. |

Sources: [libsignal upstream](https://github.com/signalapp/libsignal/tree/257105c55a7389ca6b1e85185e2769465e6729f1), [OpenMLS release](https://github.com/openmls/openmls/releases/tag/openmls-v0.9.0), [official WASM experiment](https://github.com/openmls/openmls/tree/3a3e35de3feeca8f6605143c464d5452ae584d43/openmls-wasm), [ts-mls security policy](https://github.com/LukaJCB/ts-mls/blob/8ee2f5f1ad01ddd442d2d8a7e04353789c9bf848/SECURITY.md).

Wire CoreCrypto was also considered as a follow-up lead: its upstream repository supplies browser bindings and persistent storage, but this investigation did not establish an independent audit of the specific current MLS/WASM integration. Do not transfer old Wire/Proteus audit claims to its current MLS stack. It was not installed, compiled or browser-tested here. [Upstream](https://github.com/wireapp/core-crypto).

## Audit boundary

The SRLabs report (v1.2, 11 March 2026) covers `openmls`, `traits` and `basic_credential`. Crypto/storage providers and proof-of-concept clients/delivery code are outside scope; the browser wrapper is not listed as covered. The core audit therefore does not certify RustCrypto, in-memory storage, this JavaScript harness, WASM bindings, device authentication or application persistence. [Full assessment](https://blog.openmls.tech/SRL-OpenMLS_security_assurance_assessment.pdf).

Upstream's May 2026 announcement reports eight findings and fixes in the 0.8.1/0.7.3 lines, with one low-severity item still pending at announcement time. Review current advisories and the changes since the assessed source before production approval; this spike has not established a new independent audit of 0.9.0. [Maintainer announcement](https://blog.openmls.tech/posts/2026-05-27-independent-audit/).

## Reproducible experiment

`pnpm build:crypto-spike` compiles the unchanged upstream release with its Cargo.lock, `--release --no-default-features` and the `wasm32-unknown-unknown` target. The official binding enables the `js` feature. Rust image: `rust:1.93.1-slim@sha256:c0a38f5662afdb298898da1d70b909af4bda4e0acff2dc52aea6360a9b9c6956`. Matching wasm-bindgen: 0.2.126, `--target web`. Archive SHA-256: `064948d58e2d6c0a745216477a639ba696216d6309aaa902939d1b865b1d869d`. Two clean builds produced identical WASM hashes in this environment.

| Artifact | Raw bytes | gzip level 9 bytes |
| --- | ---: | ---: |
| WASM | 2,668,665 | 755,156 |
| Generated JS glue | 24,447 | 4,488 |

WASM SHA-256: `19a5f1521c6467e94a4364a3dc08e4ad26008cd054961671576ab6ed9b127813`. These sizes exclude application code and are not a downloaded production bundle measurement.

The wrapper fixes the suite to `MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519`. No post-quantum claim is made. Draft extensions are disabled. Each participant generates keys inside a dedicated module Worker and exchanges serialized public key packages, Welcome, proposals, commits, ratchet trees and ciphertext. Private identity/group keys are not returned to the harness. The provider is ephemeral in-memory RustCrypto; there is no persistence or server.

## Browser results and limits

Official Playwright 1.63.0 Noble container, digest `sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`: **15 passed, no skips** across desktop Chromium, WebKit, Firefox, Pixel 7 Chromium emulation and iPhone 13 WebKit emulation. Each profile covers:

- Bidirectional two-member traffic, adding a third member, proposal/commit processing by the existing peer, and successful third-member traffic to both peers.
- Duplicate/corrupted ciphertext rejection, a subsequent valid message, and no demo plaintext string in the wire ciphertext.
- Malformed bytes reproduce a `WebAssembly.RuntimeError` from upstream's unchecked deserialization. This test documents a failure mode; it does not fix it.
- Omitting WASM execution permission from Worker CSP prevents initialization. Only the isolated spike allows `'wasm-unsafe-eval'`; production policies are unchanged.

Physical iOS Safari, Home Screen PWA and Android Chrome **have not run this crypto experiment**. The owner's earlier iPhone layout/storage report covers only the Phase 0 shell. No cross-engine wire interoperability, durable state restoration, device removal, self-update, long-term replay protection, malicious-member fuzzing, forward-secrecy/PCS proof or 10k-user performance result is claimed. Tests are functional evidence, not a security audit. `pnpm audit` covers JavaScript dependencies; Rust advisory/provider review remains a production requirement.

## Required before real accounts/messages

1. Replace panic/`todo!` input paths in a reviewed application binding with bounded decoding and typed failures; never log private keys, plaintext or raw decoded structures. Reject wrong message kinds/trailing bytes, and make catastrophic Worker failures fail closed.
2. Expose existing OpenMLS removal, self-update, identity/membership inspection, configuration and durable-state operations. Bind each device credential to an authenticated, verifiable account/device identity. Display identity changes; an admin role cannot bypass membership checks.
3. Implement encrypted IndexedDB persistence with atomic MLS transitions and crash/reload recovery. Never reuse a sending generation after rollback. Wrapped keys, WebAuthn PRF fallback, storage eviction and encrypted backups need their own tests. A Worker reduces accidental key exposure but does not protect against same-origin XSS sending authorized RPCs.
4. Review Rust dependencies, provider selection, audit remediations, license obligations and changes since the audited core. Add membership removal, epoch changes, concurrent commits, out-of-order delivery and cross-browser wire tests. Independent security review is still required before production release.
5. Configure limits through settings/env, cap wire inputs before WASM decoding, and use per-device private delivery with bounded batching. Do not embed application-specific limits or custom protocol logic into the binding.
6. Add the narrow WASM CSP permission only when the actual app adapter requires it, keeping separate admin policy/storage. Test physical iPhone Safari/PWA and Android Chrome/PWA, cold load, persistence and interrupted operations.

The next code task is the reviewed OpenMLS application boundary and persistence experiment. Phase 1 authentication/key registration depends on that boundary. If it cannot satisfy these requirements using the audited core APIs, stop and ask the owner rather than substitute an unaudited protocol.
