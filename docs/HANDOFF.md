# Vault Chat — handoff

Updated: 2026-10-03. Work resumed; Phase 0 remains open. The owner wants the agent to run commands directly.

## Verified state

- Chat: https://vcht.netlify.app
- Admin: https://comfy-croquembouche-2be7d5.netlify.app
- Network access was enabled after resuming the CLI. All six independent HTTP checks now pass: two chat HTML/CSP responses, two admin closed-preview/CSP responses, manifest/icons and service-worker asset. The owner made the admin preview public; HTTP 401 no longer blocks checks.
- Local `pnpm check` passes, including nine infrastructure cases and Vitest.
- Full local browser matrix in the official Playwright 1.63.0 Noble Docker image: 42 passed, 3 skipped. Chromium, WebKit, Firefox, Android emulation and iOS emulation are covered.
- Live chat browser matrix in the same container: 37 passed, 3 skipped. The earlier chat command excluded admin. After the owner made admin public, all five live admin profile tests passed separately (Chromium, WebKit, Firefox, Android emulation, iOS emulation).
- Skips affect only browser offline emulation outside Chromium. Actual unavailable-network service-worker fallback tests passed on every profile through a loopback proxy. The proxy test explicitly registers the deployed worker; direct-origin tests separately verify hydration, layout, themes, keyboard navigation and simulated storage denial.
- Owner verified real iPhone Safari and Home Screen installation with a well-fitting layout, and reported persistent storage granted. Physical Android, radio-off, keyboard/safe-area edge cases and storage eviction remain unconfirmed. See DEVICE_TESTING.md for the distinction.
- GitHub Actions API confirms Checks #10 concluded failure, specifically at `pnpm test:e2e`. Installation, `pnpm check`, build and secret scan passed. Audit was skipped after the test failure. Run: https://github.com/ix-tr/vault-chat/actions/runs/37069887261 (commit `033a9607f6e40892b90f4556eca2f378541a4650`). New local fixes have not been published or verified in CI.

## Changes made

The HTTP verifier now assesses both separate origins, strict admin styles, fresh response nonces and the closed preview. Tests reject unsafe/shared origin overrides and permissive admin style policies.

The admin browser test now checks controls inside the application main region so Next.js development tools do not masquerade as admin actions. New tests cover denied persistent storage, keyboard access and real network failure for the service worker. No CSP was weakened. The owner subsequently changed Netlify visitor visibility to public for the closed admin foundation preview; application admin authentication remains unimplemented.

## Resume here

1. Live admin foundation verification is complete: six overall HTTP checks and five admin browser tests passed after the owner made the preview public. There is no implemented application admin login yet; no operational admin actions are exposed.
2. Publish the prepared local changes through the owner's authorized repository workflow and obtain a successful new CI run, including the dependency audit. The workspace has no usable Git metadata; do not claim a commit or push occurred.
3. Record real-device checks when available; emulation is already recorded separately.
4. Complete Phase 0 gates before the audited browser-crypto spike and ADR. No crypto protocol is selected; custom protocols are prohibited.

## Operational notes

Docker tests used a temporary source copy omitting credentials, with read-only dependency mounts. No system package install was needed. The recorded browser image digest is in DEVICE_TESTING.md. Hosted HTTP results are in ignored `test-results/hosted-http-report.json`; Docker browser outputs are under the temporary source directory. Local GitHub credentials and Supabase settings must never be disclosed or published.

Dependency follow-up: upgraded the development test runner from Vitest 3.2.7 to the patched 4.1.11 and updated pnpm-lock.yaml for GHSA-82fw-gwwq-j7x9 (https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9). After installation, `pnpm audit` reports no known vulnerabilities. The package cache required sandbox escalation; installation succeeded after approval. Browser tests use Playwright and were completed before this test-runner-only update.

Owner mobile report, 2026-10-03: the owner reports that mobile testing passed. Device/browser identities and whether installed-PWA, offline revisit, storage, keyboard and safe-area scenarios were tested are awaiting clarification. Record this as owner-reported mobile success, without marking all physical iOS/Android checklist items complete.

Physical iPhone clarification, 2026-10-03: the owner verified Safari and the installed Home Screen app, reported a well-fitting layout in both, and saw persistent storage granted. This supersedes the earlier unspecified mobile report. No physical Android, offline, push or keyboard-edge-case pass is inferred.

## Repository publication — 2026-10-03

Prepared a normal clone at `/tmp/vault-sync-01f3_aqp/repo` because the workspace `.git` is empty/read-only. Compared tracked source with remote main and preserved unrelated remote files. Staged diff checks and redacted gitleaks scan passed. Commit `c07316f3359bf5d0374c1e914903f69e6e33c40c` was pushed normally to `fix/phase-zero-verification`; draft PR: https://github.com/ix-tr/vault-chat/pull/5. Main was not merged or force-pushed. New CI runs #11 and #12 were in progress at publication. Earlier unpublished notes describe the prior state.

GitHub confirms `main` is unprotected. The protection and ruleset endpoints return HTTP 403 with “Upgrade to GitHub Pro or make this repository public to enable this feature.” Account plan is Free and the repository is private. No plan purchase, visibility change or protection bypass was performed. Preserve private visibility; until an eligible plan is chosen, reviewing PRs and checking CI is a process convention, not a GitHub-enforced branch rule. Official availability: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches.

## Current repository status — supersedes private/unpublished notes

The owner authorized public visibility to enable branch protection on GitHub Free. Repository is now public. History scan passed (seven commits at scan time), with no leaks detected. Main requires PRs, strict/up-to-date `verify` and `secrets` GitHub Actions checks, linear history and resolved conversations. Rules include admins; force pushes and deletion are disabled. No purchase or history rewrite occurred.

PR #5 contains commit `c07316f` and follow-up `6eee058`. Push CI #11 passed for c07316f. Its PR CI #12 failed because Gitleaks could not read PR metadata (`Resource not accessible by integration`), not because the local scan found a secret. The follow-up gives only the secrets job `pull-requests: read` and disables PR comments, retaining read-only tokens. New CI for this fix was still running when this update was prepared. Repository-visibility documentation is included in the same PR. Main has not been merged; do not claim the default branch was updated.
