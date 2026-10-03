# Phase 1 — account/device database foundation

Updated: 2026-10-03. This is the first database increment, not completed Phase 1 or production activation. The isolated crypto adapter still has review and real-authenticator/device integration gates. Schema development proceeds separately without issuing real accounts, sessions or keys.

## Implemented

A versioned migration creates `accounts`, `devices` and `app_settings`. Accounts use opaque UUIDs with pending/active/disabled state. Devices contain only an Ed25519 public signature key, owning account, opaque ID and timestamps. Key length and uniqueness, owning-account foreign key and revocation timestamp constraints are enforced. A composite account/created-time/ID index supports future bounded device pagination. Email, phone number, private keys, passwords, wrapped secrets and message content are absent.

Client table privileges are explicitly revoked, including grants through PUBLIC and legacy Supabase defaults. Every table enables and forces RLS. Authenticated clients get SELECT only on accounts/devices. Both a verified JWT subject equal to the account UUID and the server-controlled top-level claim `session_kind: chat` are required. Missing/wrong scope fails closed; an admin session cannot read these chat records. Devices additionally require an active owning account. Admin/super-admin role claims confer no extra access. Admin users with a separate normal chat session can read their own chat account/device records like anyone else. No client writes or client settings reads are enabled.

`service_role` receives explicit table privileges for future trusted backend operations and bypasses RLS. It must stay server-side. This is not an admin user session; administrative endpoints still need independent origin/session/passkey authorization. Account UUID-to-authentication-subject binding and the session-kind claim must be issued by a reviewed authentication backend, never accepted from client-chosen metadata. No token issuer or endpoints exist yet, so ordinary Supabase tokens lacking this claim cannot access these rows.

Settings have no seeded policy values: future endpoints must validate required settings and fail closed when absent. No user/group/retention/storage/call limits are invented here. No activation links, account roles, last-super-admin invariant, admin capabilities, passkey records, rate-limit counters, message delivery or partitions are implemented in this increment.

## Verification

`pnpm test:db` creates a disposable PostgreSQL 17 container pinned by digest, with no network interface or port mapping and tmpfs database data. It creates test-only Supabase-like roles and `auth.uid()/auth.jwt()` helpers, applies migrations transactionally and runs real SQL grant/RLS assertions. The container is removed on completion. It never reads hosted Supabase credentials or modifies an existing database.

Cases cover own-account/device reads, another account's isolation, disabled/missing identity denial, missing/admin session scope denial, super-admin chat-session isolation, all client write privilege revocations, settings denial, and RLS denial after deliberately adding accidental grants. Constraints reject short/reused keys, unknown owning accounts and null settings. Fixture JWT claims test database policy behavior; these are not signed-JWT, GoTrue, PostgREST or Edge Function authentication tests.

Local `pnpm test:db` and `pnpm check` pass. CI includes a separate `database` job. No hosted migration or device-authentication flow was exercised. Existing shell browser CI retains WebKit/Chromium mobile profiles; it does not validate new login UI because none exists. The phase remains incomplete until actual authentication, activation, device registration and cross-platform flows pass.

[Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) explains the independent grants/policy checks and the server-only service role.

## Next increment

Design server-verified passkey registration/assertion, single-use expiring activation challenges, authenticated account-subject binding and scoped session issuance. Add replay, expiry, failed verification and race tests before connecting the UI. Implement admin role invariants and bootstrap with separate admin step-up in their own guarded increment. Hosted migration and real account activation wait for those complete boundaries.

Activation continuation: server-only token creation and transactional issuance/completion now exist, with expiry, reissue revocation, replay rejection, atomic device/account commit and three two-connection race tests. See [ACTIVATION.md](ACTIVATION.md). This supersedes the earlier absence of activation SQL primitives; no public activation endpoint or verified authentication enrollment is enabled.

Passkey server continuation now adds verified WebAuthn registration/assertions, device identity possession proofs, browser-bound single-use challenges, opaque scoped chat sessions, rate controls, role preservation and a private-output bootstrap CLI. See [CHAT_AUTH.md](CHAT_AUTH.md) for the current architecture and exact limitations; it supersedes earlier statements that no session issuer, roles or HTTP route code exists. Routes remain disabled by default; no production Worker, activation/login UI, live migration or real account is enabled. Phase 1 is still incomplete.
