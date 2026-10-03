# Security status

This foundation is not ready for real-user data. Production authentication, authorization, passkey session separation, encryption, audit chain and abuse limits remain incomplete. Account/device database grants and RLS are implemented and tested in isolation; no hosted migration or real account activation is enabled. See [Phase 1 scope](PHASE_1.md). Report security issues privately to the repository owner until a reporting address is selected.

Never commit private certificates, environment secrets or service-role keys. Local secrets are generated into ignored files with restrictive modes. Production must use managed secret storage, restricted cookies, verified token audiences and app settings, not development credentials. Pre-commit gitleaks and CI dependency checks are configured but not yet executed.

CSP uses request nonces with dynamic rendering, separate app policies, no inline scripts, and dev-only eval. Production Trusted Types, HSTS, reproducible build hashes, dependency/image digest pinning and parser fuzzing are pending. A generated lockfile must be reviewed and committed before CI can run reproducibly.

Verification update, 2026-10-03: GitHub Checks #10 secret scan passed; its verification job failed at E2E, so the dependency audit was skipped there. The agent subsequently ran the local audit, upgraded Vitest to patched 4.1.11 for GHSA-82fw-gwwq-j7x9, and obtained a clean `pnpm audit` result. Local lint/typecheck/tests and local/live-chat browser results are recorded in HANDOFF.md. New changes remain unpublished; pre-commit execution and successful updated CI are not claimed.
