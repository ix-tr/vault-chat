# Vault Chat — handoff

Updated: 2026-10-03. The owner wants the agent to execute commands. Phase 0 foundation verification is complete; Phase 0.5 has a working isolated OpenMLS browser experiment and a recorded protocol-core direction. Production crypto integration remains pending.

## Current repository

- Public GitHub repository: https://github.com/ix-tr/vault-chat. Main is protected: PRs, up-to-date verify/secrets checks, linear history, resolved conversations; admins included; force pushes/deletion disabled.
- PR #5 merged on owner instruction, squash commit `29f855fdebb178f52a4207bbb4a7f712be01fc39`. [Merged-main CI](https://github.com/ix-tr/vault-chat/actions/runs/37112662708) passed verify/secrets, including build/browser tests/audit.
- The workspace `.git` is unusable/read-only. A normal clone at `/tmp/vault-sync-01f3_aqp/repo` is used for branches/PRs. Its current continuation branch is `spike/browser-mls`. Do not overwrite unrelated remote changes.
- Local GitHub credentials and Supabase settings are ignored; never disclose or publish them. Compiler/browser stages contain only the files/dependencies needed for tests.

## Verified foundation

Separate chat https://vcht.netlify.app and admin https://comfy-croquembouche-2be7d5.netlify.app both pass current independent HTTP security checks. Closed admin preview is publicly reachable but has no operational actions/authentication. Six HTTP checks passed again after merging; exact Netlify deployment SHA was not verified.

Local browser matrix: 42 pass/3 skip. Live chat: 37 pass/3 skip; five live admin profile tests pass separately. Actual proxy-cut network/SW fallback passes all five profiles. Owner verified real iPhone Safari/Home Screen layout and storage granted. Physical Android is deferred. See PHASE_0.md and DEVICE_TESTING.md for emulation limits. `pnpm check` and JavaScript dependency audit pass; Vitest is patched to 4.1.11.

## Crypto continuation

Read [ADR 0001](adr/0001-crypto-stack.md) and [spike instructions](../spikes/crypto/README.md). OpenMLS 0.9.0's unmodified official WASM experiment compiles reproducibly and passes 15 tests in Chromium/WebKit/Firefox and iOS/Android emulation. It covers two/three-member traffic in separate Workers, replay/tamper rejection and known malformed-input/CSP failures. No physical device has tested this crypto experiment.

OpenMLS is the selected protocol-core direction for MLS one-to-one and group messaging. The independent audit covers core components, not providers/storage/WASM bindings or the app. The upstream wrapper is experimental, traps on malformed input and lacks removal/self-update/persistence APIs. It is not approved as the production adapter. `@vault/crypto` remains inactive; no real user keys/messages are generated. libsignal's unchanged WASM check failed at getrandom backend selection; ts-mls lacks the required audit.

Next: build/review a narrow binding around existing OpenMLS APIs and an encrypted, atomic persistence experiment, covering bounded input, typed errors, removal/update, verified device credentials and crash/reload behavior. Resolve the ADR gates before connecting real account/key registration. Do not implement a custom protocol or silently substitute an unaudited one. If the audited core cannot satisfy the required browser path, ask the owner.

Generated spike artifacts are ignored. Rebuild with `pnpm build:crypto-spike`, then run `pnpm test:crypto-spike`. The builder currently requires Linux x86-64, Docker, Node 24, Git and tar. Crypto spike CI repeats this separately from normal shell CI. Physical iOS/Android testing remains required when devices are available.
