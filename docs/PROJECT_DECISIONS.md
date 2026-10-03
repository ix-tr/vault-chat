# Project decisions

Confirmed by the project owner on 2026-10-02. These decisions override conflicting requirements in PROJECT_SPEC.md. AGENTS.md remains applicable.

## Initial usable release

Build the local environment, admin-managed account creation and activation, secure login, admin panel, and one-to-one text messaging first. Other features remain later-phase work.

## Cryptography

MLS is acceptable for both one-to-one and group conversations if an audited implementation works in browsers. Signal is not mandatory. Before selecting an implementation, document each candidate's audit scope, maturity, and maintenance status in the crypto ADR. If no audited option works in the browser, stop and ask the owner; do not implement a custom protocol.

## Account reset and recovery

An admin-triggered reset cannot recover old history when the user has no recovery backup. Document this explicitly in THREAT_MODEL.md and ADMIN_GUIDE.md when those documents are created.

Do not implement email password reset now; defer it to the final phase.

For now, account recovery is available only through an admin-issued re-activation link. Leave an extension point in the database and code for future email recovery, but do not activate email collection or make an email field mandatory. User-controlled encrypted history backups are distinct from account recovery and do not introduce another account recovery method.

## Admin authentication

Passkeys are mandatory for admin access, on a separate origin with a separate session and fresh WebAuthn user verification. TOTP alone is insufficient; it may only serve as additional verification.

## Message history and delivery

History lives on user devices. The server holds only a time-limited ciphertext delivery queue. Delete delivered ciphertext after a short grace period. Transfer history to a new device via an existing device or an encrypted backup. Queue retention and deletion grace periods must be configurable; their defaults are not yet specified.

## Deployment scope

Updated by the owner on 2026-10-03: use Netlify and hosted Supabase directly for development and device testing. Netlify replaces the initially selected Vercel provider following the owner's confirmation. This supersedes the earlier local-only deployment decision. Keep local tooling as an optional path. This change does not imply production readiness or completion of security gates. Deploy chat and admin as separate Netlify sites/origins.

## Product name and language

Keep the name Vault Chat. Ship an English-only interface. Cancel the Turkish + English and next-intl requirements. Centralize UI text in one place for future localization, without building multilingual infrastructure now.

## Design

Use a simple, mobile-first design with light and dark themes.

## Security priority

Security takes precedence over convenience. When choosing between alternatives, choose the secure option and document the reason.

## Hosted site record

Chat origin: https://vcht.netlify.app (owner reported successful deployment). Admin origin: https://comfy-croquembouche-2be7d5.netlify.app (owner provided URL after reporting the expected admin preview). Do not configure a shared origin or register production passkeys before stable origins and authentication are ready.
