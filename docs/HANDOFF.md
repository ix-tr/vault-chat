# Vault Chat — handoff

Updated: 2026-10-03. Work is paused at the owner's request: wrap up now and continue later. Phase 1 is incomplete. The owner wants the agent to execute commands when work resumes. Phase 0 foundation verification is complete; Phase 0.5 has a working isolated OpenMLS browser experiment and a recorded protocol-core direction. Production crypto integration remains pending.

## Current repository

- Public GitHub repository: https://github.com/ix-tr/vault-chat. Main is protected: PRs, up-to-date verify/secrets checks, linear history, resolved conversations; admins included; force pushes/deletion disabled.
- PR #5 merged on owner instruction, squash commit `29f855fdebb178f52a4207bbb4a7f712be01fc39`. [Merged-main CI](https://github.com/ix-tr/vault-chat/actions/runs/37112662708) passed verify/secrets, including build/browser tests/audit.
- The workspace `.git` is unusable/read-only. A normal clone at `/tmp/vault-sync-01f3_aqp/repo` is used for branches/PRs. Its current continuation branch is `feat/passkey-server`. Do not overwrite unrelated remote changes. If the temporary clone disappears, recover the branch from GitHub.
- Local GitHub credentials and Supabase settings are ignored; never disclose or publish them. Compiler/browser stages contain only the files/dependencies needed for tests.

## Verified foundation

Separate chat https://vcht.netlify.app and admin https://comfy-croquembouche-2be7d5.netlify.app both pass current independent HTTP security checks. Closed admin preview is publicly reachable but has no operational actions/authentication. Six HTTP checks passed again after merging; exact Netlify deployment SHA was not verified.

Local browser matrix: 42 pass/3 skip. Live chat: 37 pass/3 skip; five live admin profile tests pass separately. Actual proxy-cut network/SW fallback passes all five profiles. Owner verified real iPhone Safari/Home Screen layout and storage granted. Physical Android is deferred. See PHASE_0.md and DEVICE_TESTING.md for emulation limits. `pnpm check` and JavaScript dependency audit pass; Vitest is patched to 4.1.11.

## Crypto continuation

Read [ADR 0001](adr/0001-crypto-stack.md) and [spike instructions](../spikes/crypto/README.md). OpenMLS 0.9.0's unmodified official WASM experiment compiles reproducibly and passes 15 tests in Chromium/WebKit/Firefox and iOS/Android emulation. It covers two/three-member traffic in separate Workers, replay/tamper rejection and known malformed-input/CSP failures. No physical device has tested this crypto experiment.

OpenMLS is the selected protocol-core direction for MLS one-to-one and group messaging. The independent audit covers core components, not providers/storage/WASM bindings or the app. The upstream wrapper is experimental, traps on malformed input and lacks removal/self-update/persistence APIs. It is not approved as the production adapter. `@vault/crypto` remains inactive; no real user keys/messages are generated. libsignal's unchanged WASM check failed at getrandom backend selection; ts-mls lacks the required audit.

Binding/storage continuation: a narrow OpenMLS binding and encrypted atomic IndexedDB state/outbox experiment now pass 50 combined tests across five profiles. It covers bounded/typed input errors, Worker restoration, update/removal, stale-writer conflicts, aborted/lost-response recovery and invalid snapshots. See CRYPTO_STATE.md for the limited rollback guard and scope. No independently audited application adapter is claimed. Next: credential-derived unlock/wrapping and verified device identities; then resolve remaining provider/review/delivery/history gates before connecting real account registration. Do not implement a custom protocol or silently substitute an unaudited one. If the audited core cannot satisfy the required browser path, ask the owner.

Generated spike artifacts are ignored. Rebuild with `pnpm build:crypto-spike` and `pnpm build:crypto-spike --adapter`, then run `pnpm test:crypto-spike`. The builder currently requires Linux x86-64, Docker, Node 24, Git and tar. Crypto spike CI repeats this separately from normal shell CI. Physical iOS/Android testing remains required when devices are available.

PR #6 merged on owner continuation, squash commit `737927232081159fb6bde9fcb85168e28e4dc6da`. Merged-main verify/secrets and original browser-mls CI passed: https://github.com/ix-tr/vault-chat/actions/runs/37114027504 and https://github.com/ix-tr/vault-chat/actions/runs/37114027508. The binding/storage continuation is a separate branch; new publication/check results are reported with its PR. No exact Netlify deploy SHA is claimed.

PR #7 merged on owner continuation, squash commit `2d46529b7afd8edf8240640b92bc44aefac569cd`. The subsequent credential-unlock experiment passes 75 combined browser tests and local check/audit. Read [DEVICE_UNLOCK.md](DEVICE_UNLOCK.md): Argon2id page reload is real MLS; PRF wrapping uses synthetic data and WebAuthn helper assertions are mocked. No backend authentication or production adapter is enabled. Build the additional bundle with `pnpm build:unlock-spike`. Next gates: real authenticator testing, server assertion verification, authenticated public member directory integration and independent boundary review before real account activation.

PR #8 follow-up: added four actual browser WebAuthn tests with CDP virtual CTAP2 authenticators in Chromium/Android emulation, covering PRF wrapping/reopening after page reload and new-enrollment Argon2id fallback when PRF is absent. This supersedes the earlier statement that no virtual authenticator was tested; physical device and server verification remain pending. Total coverage is 79 cases. The virtual test file is excluded from non-Chromium profiles explicitly; existing five-profile tests still run.

PR #8 is merged. Offline reopen follow-up is on `fix/offline-reopen`: standalone cached fallback, first-visit client control and page-close/network-cut/reopen tests across all five profiles. Local shell matrix 42 pass/3 existing skips; `pnpm check` passes. Owner clarified that the currently deployed installed app already shows the expected offline screen; previous failure interpretation is superseded. New hardening changes still need their own physical retest after deployment. See DEVICE_TESTING.md; do not claim a physical fix or browser-process restart test.

PR #9 merged on owner continuation, squash commit `66e0371a68644b47ed6c6f11cdd95ca2454ef762`. Phase 1 database foundation now exists independently of the still-inactive production crypto adapter: accounts/devices/settings, client grant revocations and scoped own-row RLS. `pnpm test:db` passes real SQL assertions in an isolated PostgreSQL 17 Docker fixture; `pnpm check` passes. See [PHASE_1.md](PHASE_1.md). No hosted Supabase changes, real login or activation are enabled. Next increment is server-verified passkey/activation challenges and scoped session issuance; do not expose service-role credentials or accept client-chosen account/session claims.

PR #10 merged on owner continuation. Next increment `feat/activation-transactions` adds server-only random activation-token/digest/link helpers and service-role-only atomic activation SQL. Local database suite includes three independent two-connection redemption races, each with exactly one winner; SQL replay/expiry/reissue/rollback/client denial and server token tests pass. See [ACTIVATION.md](ACTIVATION.md). Live Supabase and user-facing login remain inactive. Next is fresh passkey challenge verification and device ownership proof before exposing activation or issuing sessions.

PR #11 merged after verify/secrets/database success at the exact recorded head. The continuation branch is now `feat/passkey-server` in the temporary clone. See [CHAT_AUTH.md](CHAT_AUTH.md): verified passkey/device proof server, transactional scoped sessions, operator bootstrap, rate limits and role/audit invariants. Management token and service-role JWT in the correct root `.env.local` were privately verified against the hosted project (healthy; project REST 200), without exposing values. No hosted migrations, accounts or UI auth are enabled. Keep working toward the owner's instruction to finish Phase 1: production encrypted-device Worker, client enrollment/login, build integration, full browser/backend flows, hosted setup and clear emulation limits. Do not report the phase complete based on server tests alone.

## Pause checkpoint — 2026-10-03

The owner explicitly paused continuation after credential verification. [Draft PR #12](https://github.com/ix-tr/vault-chat/pull/12) preserves the passkey server work; implementation commit `caa7e882bc8d2bfd3f026f41b436e89072fda813`. At the pause check, secrets/database CI passed; verify/browser-mls were still running. Recheck the latest exact head on resumption; no all-green CI or merge is claimed. Leave this PR draft until its intended backend review and outstanding checks are resolved.

Local validation passed: frozen install, lint/typecheck, nine infrastructure cases, five unit/server cases, both database SQL suites plus three activation races, ten real-signature/PostgreSQL authentication scenarios, production builds and dependency audit. All 84 isolated crypto browser cases passed in the official Playwright Noble container across Chromium/WebKit/Firefox and mobile emulation. No physical authenticator, complete login UI or live Supabase migration was tested.

The selected flow is passkey authentication plus a local-only passphrase when PRF is unavailable. Never add password-only account authentication or upload the local password/PRF output. Server auth remains disabled by default. Root `.env.local` now holds verified project service-role and management credentials; `supabasesettings` supplies project configuration. Both are ignored and private. Next.js runs from `apps/web`, so root credentials are not proof that the deployed chat server has its required environment. Do not publish or print these files.

Resume with:

1. Read CHAT_AUTH.md, PHASE_1.md, DEVICE_UNLOCK.md and the crypto ADR; recheck PR #12 CI and any remote changes.
2. Implement the production device Worker using OpenMLS: client identity/public KeyPackage, possession proof, PRF/Argon2id key wrapping and encrypted atomic IndexedDB state. Persist keys before server enrollment completion; never regenerate existing keys during login.
3. Build activation/login screens with explicit fallback, cancellation/storage errors, fragment clearing and secret-free request serialization. Synced passkeys do not replace local device keys. Keep admin sessions/origin separate.
4. Add complete browser-to-backend flows on Chromium/WebKit/Firefox/mobile profiles and document synthetic/emulated versus physical results. Integrate reproducible crypto assets into production builds without weakening admin CSP.
5. After those gates pass, apply versioned hosted migrations, configure chat-server environment, run bootstrap with explicit settings and private link output, and verify hosted activation/login. Real user passkey enrollment requires the user's device interaction. Physical Android is still deferred; the owner's iPhone pass covered only shell/install/storage/offline behavior.

Do not start Phase 1b or claim Phase 1 complete while these items remain. No further implementation or deployment should run during the requested pause.
