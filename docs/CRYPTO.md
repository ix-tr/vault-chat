# Cryptography status

Current continuation: see [DEVICE_ACTIVATION.md](DEVICE_ACTIVATION.md) for the application Worker, activation/login UI and complete browser test results. Earlier increment descriptions below are historical; hosted deployment and owner enrollment remain pending.

Phase 0.5 evaluated libsignal, OpenMLS-WASM and ts-mls. [ADR 0001](adr/0001-crypto-stack.md) selects OpenMLS as the protocol-core direction for both one-to-one and group messaging. The unmodified official WASM experiment passed actual two/three-member message exchanges in separate Workers on five browser profiles.

The application has no active encryption adapter yet. The official experimental bindings trap on malformed input, use ephemeral storage and lack APIs needed for secure device revocation and persistence. The independent audit covers core components; it does not certify providers, bindings or app integration. Do not ship the spike as a production dependency.

Finish the remaining identity/unlock/provider/review gates in the ADR before real key registration or messaging. `pnpm build:crypto-spike` and `pnpm test:crypto-spike` reproduce the experiment. No custom ratchet/group protocol or fake encrypted seed is permitted. If the audited core cannot support the required browser integration, stop and ask the owner.

Continuation: the isolated application binding and encrypted atomic IndexedDB state/outbox experiment are implemented and pass the five-profile combined matrix (50 tests). [Storage/binding status](CRYPTO_STATE.md) records typed input errors, restoration, self-update/removal, stale-writer conflicts and aborted/lost-reply recovery. This replaces neither the audit requirement nor the missing credential-unlock/device-identity work. `@vault/crypto` is still inactive.
