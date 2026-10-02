# Threat model — draft

## Intended protection

Once an audited browser protocol is selected and implemented, servers and administrators must not possess message/media/call decryption keys. Opaque IDs, public key material, ciphertext, delivery state and operational metadata remain visible as necessary. Administrator accounts have ordinary private chat identities plus additional administrative permissions. The audit log records administrative actions, never private chat content.

## Limits

E2EE cannot protect users from a compromised device or a malicious server distributing modified JavaScript. Screenshots, recipients copying content, traffic analysis and infrastructure-observed IP addresses remain possible. No encryption guarantee applies to the Phase 0 preview, which stores no messages or identity keys. COOP/COEP and CSP are defense in depth, not proof of isolation or protection from malicious builds.

## Recovery

For now account recovery is only an admin-issued re-activation link. It invalidates sessions/public key material and requires new device-generated identity keys. **Without the user's own recovery backup, old history cannot be recovered by an administrator.** Contacts must see an identity-change warning. Encrypted history backup is not an alternative account-authentication recovery route. Email password reset is deferred to the final phase; no active or mandatory email field exists now.

## Browser and infrastructure risks

IndexedDB may be evicted, notably in non-installed iOS Safari. Persistent storage requests may be refused. The preview explains this risk; encrypted backup arrives later. Admin isolation requires distinct origins AND server-side role/session enforcement; the latter is not implemented yet. Development CSP permits eval for framework development tooling, never production. Chat permits inline styles; admin uses style nonces. Trusted Types enforcement and production HSTS remain hardening work.

Application access logging is absent. Supabase/coturn/SFU and platform logs may still contain IP or connection metadata; inspect and configure them before real-user testing. Do not put real data in the current environment. Tunnels send traffic through a third party and are for demo data only.
