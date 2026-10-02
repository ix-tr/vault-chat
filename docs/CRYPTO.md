# Cryptography status

No protocol or crypto library has been selected. Phase 0.5 must investigate libsignal browser feasibility, OpenMLS-WASM and ts-mls, and whether MLS can serve both one-to-one and group conversations. Record audit scope (including wrapper/binding coverage), maturity, maintenance, browser results, worker integration and bundle size in `docs/adr/0001-crypto-stack.md` before deciding.

Do not implement a custom ratchet or group protocol. If no audited browser-compatible candidate works, stop and ask the owner. Seeds must eventually use real approved client crypto; no fake plaintext seed is supplied in Phase 0.
