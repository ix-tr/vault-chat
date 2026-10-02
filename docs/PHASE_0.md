# Phase 0 — scaffold prepared, validation incomplete

## Delivered files

pnpm workspace, two separate Next.js apps, centralized English text/product name, Tailwind/shadcn-compatible button and Zustand theme, mobile empty-state shell, private closed admin preview, PWA manifest/icons/generic offline page, install guidance and storage warning. Local Supabase config disables public signup. Compose provides HTTPS gateway, coturn and LiveKit; the local script generates ignored secrets and certificates. Tests, hooks, CI, dependency update configuration, license placeholder and security/setup docs are included.

## Validation on 2026-10-02

- Passed: Node syntax checks for orchestration, hook installer and service worker; JSON parsing of all package/config JSON; recovery decision consistency review; reset without the explicit data-loss flag correctly refuses to run.
- Blocked: pnpm bootstrap returned EAI_AGAIN resolving registry.npmjs.org; offline npm cache has no pnpm package.
- Blocked: Docker socket permission denied. No containers were started or image tags validated.
- Missing prerequisite: mkcert is not on PATH.
- Not run: dependency install, lockfile generation, lint, TypeScript, Vitest, Next.js builds, Playwright/Lighthouse, real iOS/Android, local HTTPS and service readiness.

## Follow-up validation

- Passed: three dependency-free infrastructure cases, covering distinct/matching HTTPS origins, invalid and injected IP/hostname/port configuration, quoted dotenv parsing and environment precedence.
- Passed: direct `docker compose --env-file .env.example -f infra/compose.yaml config --quiet` validation; this does not start services or verify image availability.
- Added `node scripts/doctor.mjs` for a secret-free prerequisite report from the owner's terminal. Child-process probes in the restricted agent may themselves return EPERM even where a direct command succeeds.
- Added each app's own `allowedDevOrigins` hostname for LAN reverse-proxy development; no cross-app wildcard. See [Next.js documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins).
- Package download retry still failed with EAI_AGAIN; Docker daemon and missing tools remain unresolved in this session.

## Completion gates

Do not call this phase finished until dependencies and lockfile are installed, all checks pass, Compose/Supabase start under trusted HTTPS and the device matrix passes or explicit emulation-only results are recorded. Image versions are scaffold choices and require registry verification. CI intentionally uses frozen installation and will fail until a real lockfile is committed.

No encrypted seed exists yet: it depends on the approved real client protocol and account schema. No load test pretends to measure messaging before messaging exists. Phase 0.5 starts after Phase 0 validation and records the audited crypto decision.

## Owner terminal verification

The owner ran the diagnostic: Docker daemon, Compose, Node.js, origin configuration and npm registry connection passed. pnpm, mkcert and gitleaks are absent; dependencies/lockfile and local certificates still need creation. Agent Docker/network access restrictions must not be confused with host failures.

Local CachyOS/Arch package metadata confirms mkcert and gitleaks are available. Its pnpm package is a different major version; install the project's exact pnpm version into ignored `.tools` rather than changing project tooling.

## Installed-tool validation

The owner installed dependencies, the local CA and leaf certificates. The owner diagnostic passed all prerequisites. The dependency lockfile now exists.

Agent checks: lint passed after adding the AbortSignal global, all four workspace TypeScript checks passed, three infrastructure cases passed and the Vitest origin test passed. Build and Playwright are still unverified: the web build failed when Turbopack tried to bind an internal port (EPERM); dev server startup also failed with listen EPERM. An alternate admin webpack attempt failed reading a child-process TypeScript config and does not count as successful validation.

The install reported ESLint 9 as unsupported. Package requirements now target ESLint 10 and its matching JS config; the installed typescript-eslint peer range supports ESLint 10. Dependency install/lockfile refresh and lint must run again before these tooling changes are considered verified.

An offline E2E case now verifies that only the generic /offline route is cached and that disconnected navigation displays it. Its TypeScript compilation passed; runtime execution remains pending. Root typechecking now includes test and Playwright/Vitest configuration files. Offline lockfile refresh for ESLint 10 failed because a transitive package metadata entry was not cached; use the owner terminal's networked pnpm install to finish the refresh.

## Owner E2E failure diagnosis

Owner result: 27 failed, 3 passed. Chromium/Firefox/Android error snapshots show Open WebUI login instead of Vault Chat: port 3000 was occupied and Playwright reused the unrelated server. Offline tests consequently waited for the wrong application's service worker. WebKit/iOS separately failed to launch because required native libraries were absent. The three passing admin preview checks do not validate chat behavior.

Fixed configuration: manual development uses 3100/3101 with matching Caddy upstreams; E2E uses isolated 3200/3201 and reuseExistingServer=false. Rerun is pending. Do not treat these failures as evidence that the chat UI is broken, or ignore WebKit coverage. The owner requested direct live testing; whether this means local running UI or a public demo remains awaiting clarification.

## Hosting decision — 2026-10-03

Owner clarified that direct live testing means Vercel + hosted Supabase. This supersedes the local-only target; local configuration remains optional. Lint and workspace/tooling typechecking passed after the port-isolation changes. Hosted deployment and browser validation are pending; no external resources have been created.

## Netlify preparation

Owner confirmed Netlify + hosted Supabase. Added per-app netlify.toml with root workspace builds, a separate hosted Playwright configuration with distinct HTTPS-origin validation, and provider setup instructions. Both TOML files parse. Full lint/typecheck/infra/Vitest checks passed before the final offline-test diagnostic assertion; that assertion is included in the subsequent typecheck/lint check. No external deployment or Git push is claimed; account connections/site URLs are pending.

## GitHub publishing preparation

Owner will select the GitHub repository in Netlify. Supabase settings were supplied as local `supabasesettings`, which is ignored and restricted to 0600. Added a temporary-metadata publisher for private `ix-tr/vault-chat`, with account verification, refusal of public/nonempty repos and a redacted staged secret scan. Preparation passed for 71 files; .token and supabasesettings were excluded. An actual attempt stopped at GitHub DNS/connectivity before remote creation or upload. App typechecks now run Next.js typegen first so fresh hosted builds do not depend on preexisting .next type files; typechecks passed.

Owner reported initial remote push denied with HTTP 403 / write access not granted. The remote repository is empty; publishing awaits corrected token repository/write permissions. No successful upload or Netlify deployment is recorded.
