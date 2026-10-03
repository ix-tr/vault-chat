# Device activation integration

Updated 2026-10-03. Phase 1 now has an application device-key Worker and activation/sign-in screens. Hosted deployment and owner enrollment are still pending; this is hosted development, not an independently certified messaging release.

## Boundary

`packages/crypto/src` shares the tested identity, Argon2id/PRF wrapping and strict IndexedDB transaction implementation with the experiments. The application Worker imports the checksummed pinned OpenMLS binding. It exposes only prepare, inspect, seal, restore and challenge-specific possession proof. Private provider snapshots, CryptoKeys and signers never return to the page. Encrypted state and its wrapped random DEK commit atomically before server enrollment. Existing keys are never regenerated during login or incomplete-activation retry. Retry restores and rewraps the same identity and KeyPackage. A synced passkey without this device’s encrypted state cannot restore chat keys.

Passkeys always authenticate the account. If fresh enrollment cannot use WebAuthn PRF, the local password derives an Argon2id13 wrapping key (libsodium); it does not authenticate the server. Passwords and PRF outputs are omitted from every request. PRF-protected existing state cannot downgrade to a password. JS strings and WASM memory do not offer guaranteed forensic zeroization; byte-array copies are cleared and the Worker is terminated on lock/error/page exit.

Activation URLs use a fragment cleared before verification; bearer links belong in private operator output only. LocalStorage contains only a bounded public device descriptor. IndexedDB stores authenticated encrypted state and the wrapped DEK. Whole-database rollback remains outside the partial CAS guard; messaging and encrypted-history backup stay gated until sender-state rollback is addressed.

The page retains its nonce CSP without WASM permission. Only the same-origin Worker asset response permits `wasm-unsafe-eval`, with matching COEP and CORP. Admin policy, origin and session remain separate; the admin app is still closed until Phase 1b.

## Assets and dependency review

`pnpm build:auth-assets` verifies the pinned revision, Rust binding hash, WASM hash and generated glue hash before bundling. Netlify builds without Docker using committed reviewed artifacts. Crypto CI rebuilds from pinned upstream source/compiler/bindgen and compares exact shipped WASM/glue bytes. License texts and exact source links are served at `/crypto-assets/licenses.json`, with `LICENSE` and `SOURCE-NOTICE.txt`; the unchanged MPL-2.0 HPKE dependency sources are available through their exact linked source archives.

A cargo-audit 0.22.2 review of the pinned upstream workspace found RUSTSEC-2026-0258 (h2 0.4.15), RUSTSEC-2026-0285 (rustls 0.23.43), and unmaintained warnings for atomic-polyfill 1.0.3 / proc-macro-error2 2.0.1. None is in the selected wasm32 normal/build dependency graph. Do not call the whole workspace clean or expand the upstream core audit to this binding/provider/app. The WASM inventory covers 144 normal/build packages. Independent app boundary review remains required before production messaging release.

## Verification

44 complete browser integration cases pass across Chromium, WebKit, Firefox, Android and iOS emulation. The Worker, OpenMLS identity/KeyPackage, encrypted storage, actual signature verification and real disposable PostgreSQL transactions run unmocked. Five-profile UI cases use a synthetic P-256 authenticator; four Chromium/Android cases use native browser WebAuthn with CDP virtual CTAP2 authenticators for PRF and local-password fallback. Cases cover activation, reload/login/logout, wrong password, cancelled WebAuthn, missing/changed storage, lost finish response, failed activation retry, mobile width and an unanswered persist permission request. The shared-module refactor also passes all 84 crypto regression cases.

These are emulated browser/virtual authenticator results, not physical phone, iCloud/Google synced passkey or installed-PWA authentication evidence. The owner’s previous iPhone pass covered layout/install/storage/offline only. Physical Android remains deferred. Before real release, repeat activation/login/reload/lock on iPhone Safari and Home Screen, Android Chrome and installed mode; never reset device data to conceal a failure.

## Hosted setup

Chat site only: `VAULT_AUTH_ENABLED=true`, `VAULT_CHAT_ORIGIN=https://vcht.netlify.app`, the project `SUPABASE_URL`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. Netlify Production context and Builds/Functions scopes; mark the key secret. No `NEXT_PUBLIC_` key, management PAT or Netlify PAT is required in the deployed app. The owner reports entering these settings.

`node --env-file=.env.local scripts/hosted-migrations.mjs` inspects matching exact source history; add `--apply` to commit pending DDL and version records atomically. Supply `SUPABASE_URL` explicitly when it lives in the separate ignored settings file. No reset, automatic repair or account creation occurs. Bootstrap runs separately, with an explicit deployment policy and a new 0600 output file under ignored `infra/runtime`. Generate the first link after deployment so its expiry does not pass while CI runs.

The explicit starter policy is `infra/hosted-development-auth-policy.json`: 100 accounts, five devices/passkeys per account, one-hour activation links, five-minute challenges, 24-hour chat sessions with one-hour idle expiry, global 120/account 20 requests per minute, Argon2id creation at 64 MiB and three operations. This is an editable hosted-development policy, not a measured 10k-user capacity or messaging policy.

Follow-up: Web Locks serialize activation across tabs; unsupported locking fails closed. An AbortController cancels native WebAuthn on lock/page exit, and a closed flow cannot generate keys after a delayed activation lookup. Five-profile tests exercise competing activation tabs and page exit during lookup.

Hosted verification found that Netlify serves public crypto files directly without Next response headers. Chat `netlify.toml` now sets the isolated Worker policy explicitly for `/crypto-assets/*`; `pnpm verify:hosted` checks live Worker headers, WASM bytes, provenance and license distribution as well as page CSP. Do not bootstrap until that hosted check passes.
