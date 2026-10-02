# Admin guide — planned behavior

The admin origin currently displays a closed preview. No account bootstrap, passkey login or administrative actions are implemented.

Admins must use a passkey with fresh user verification for a separate, short-lived admin session; TOTP cannot replace it. An admin's normal chat session stays distinct. User activation generates keys on the user's device; administrators never choose user passphrases or hold private chat keys.

Current recovery policy: issue a single-use, expiring re-activation link. Re-activation replaces identity material and revokes sessions. **Administrators cannot restore old history without the user's own recovery backup.** Contacts receive an identity-change warning. Email password reset is deferred to the final phase.

Admins may eventually see permitted account and delivery metadata and perform audited management actions. They cannot read private conversations, filenames, group names or keys. User-submitted reports disclose only explicitly selected content via a dedicated report key. The last super admin must remain; sensitive role changes require step-up and explicit safeguards.
