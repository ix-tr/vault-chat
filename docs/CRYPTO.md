# Cryptography status

Phase 0.5 evaluated libsignal, OpenMLS-WASM and ts-mls. [ADR 0001](adr/0001-crypto-stack.md) selects OpenMLS as the protocol-core direction for both one-to-one and group messaging. The unmodified official WASM experiment passed actual two/three-member message exchanges in separate Workers on five browser profiles.

The application has no active encryption adapter yet. The official experimental bindings trap on malformed input, use ephemeral storage and lack APIs needed for secure device revocation and persistence. The independent audit covers core components; it does not certify providers, bindings or app integration. Do not ship the spike as a production dependency.

Next implement/review the narrow OpenMLS application binding and encrypted atomic storage, satisfying the ADR gates before real key registration or messaging. `pnpm build:crypto-spike` and `pnpm test:crypto-spike` reproduce the experiment. No custom ratchet/group protocol or fake encrypted seed is permitted. If the audited core cannot support the required browser integration, stop and ask the owner.
