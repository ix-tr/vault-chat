# Security status

This foundation is not ready for real-user data. Authentication, authorization, RLS, passkey separation, encryption, audit chain and abuse limits are not implemented. Report security issues privately to the repository owner until a reporting address is selected.

Never commit private certificates, environment secrets or service-role keys. Local secrets are generated into ignored files with restrictive modes. Production must use managed secret storage, restricted cookies, verified token audiences and app settings, not development credentials. Pre-commit gitleaks and CI dependency checks are configured but not yet executed.

CSP uses request nonces with dynamic rendering, separate app policies, no inline scripts, and dev-only eval. Production Trusted Types, HSTS, reproducible build hashes, dependency/image digest pinning and parser fuzzing are pending. A generated lockfile must be reviewed and committed before CI can run reproducibly.
