# Phase 0 — local and hosted browser validation passed, updated CI pending

## Current scope

The owner superseded local-only deployment with Netlify + hosted Supabase. Local Docker/mkcert services remain optional and are not a hosted completion gate. The project remains a foundation preview: no working account activation/login, admin capabilities or message encryption/delivery.

## Delivered

- pnpm workspace with separate Next.js chat/admin apps and shared English text/product configuration.
- Mobile layout, light/dark theme, Tailwind/shadcn-compatible button and Zustand state.
- Manifest/icons, generic offline fallback, installation guidance and persistent-storage request/warning.
- Separate CSP policies, per-request script nonces, COOP/COEP and other baseline headers.
- Netlify per-app build files and local/hosted Playwright configurations.
- Optional local Supabase, Caddy, coturn/LiveKit configuration and prerequisite diagnostic.
- CI, dependency update configuration, secret scanning/publishing helpers and security/setup documentation.

## Recorded sites

| App | Origin | Evidence |
| --- | --- | --- |
| Chat | https://vcht.netlify.app | Owner reports the corrected deploy succeeded and the site now works. |
| Admin | https://comfy-croquembouche-2be7d5.netlify.app | Owner reports the expected Administration / Access unavailable preview. |

These are user-reported results. Agent web requests remain inaccessible and shell DNS is restricted; no independent hosted HTTP/CSP/PWA pass is claimed.

## Verification

Passed locally: lint, all workspace and test/config TypeScript checks, infrastructure cases, Vitest origin validation, JSON/TOML parsing, Node syntax checks, staged secret scans and three scoped-update safety tests. Native Node tests report three cases when invoked directly. Next.js type generation runs before app typechecking for fresh checkouts.

Owner prerequisite checks passed after installing pnpm/mkcert/gitleaks and generating trusted local certificates. A pnpm lockfile exists; ESLint was updated to version 10. Initial E2E results (27 failures, 3 passes) were invalid for chat: the tests reused Open WebUI on port 3000. Dedicated test ports and server reuse refusal fix that configuration; WebKit also lacked native libraries on CachyOS. A subsequent Netlify chat build correctly selected apps/web but linted generated .netlify dependencies. Generated-directory exclusions fix that issue while retaining project lint rules; the owner now reports successful redeployment.

## Remaining completion gates

- Verify hosted chat theme/settings and admin closed preview/security headers. Chat HTTP security-header checks passed in the owner's latest probe; browser behavior remains separate.
- Pass Chromium + WebKit/mobile projects, and Firefox, on a suitable runner; distinguish emulation from physical devices.
- Verify iPhone Safari/Android Chrome as available, install behavior, safe areas, layouts and storage warning.
- Verify offline revisits show only the generic fallback, and no conversations are cached.
- Confirm GitHub CI result; successful Netlify deployment does not by itself prove the browser matrix passed.

Phase 0 is not marked complete until these results are recorded. See DEVICE_TESTING.md. The next phase is the audited browser-crypto spike and ADR; no custom protocol may be substituted. Real encrypted seeds and delivery load tests depend on later implemented crypto/schema/message delivery.

## Latest continuation

Owner confirmed public chat access works and said both checks look good. Do not infer detailed physical-device, installation or offline passes from that general report. Added a dependency-free hosted HTTP verifier and independent regression cases rejecting reused/mismatched nonces, unsafe scripts, missing headers and cached dynamic HTML. pnpm check and all three direct header cases passed. Actual hosted probes remain blocked in the agent; the owner can run the verifier without pnpm/PATH setup. Phase 0 completion still awaits runtime evidence.

## Hosted CSP failure — 2026-10-03

The owner's HTTP probe passed manifest/icons and the service-worker asset, but both HTML responses failed script nonce matching. The root cause is not yet established: the report contained no per-script evidence and the agent cannot fetch the hosted page. The pasted GitHub Actions list contains durations but no conclusions, so Checks #10 is not recorded as successful.

The verifier now reports script index, inline/external classification, framework-asset classification and nonce presence/match booleans, without script content, URLs or nonce values. It also compares consecutive response nonces even when the first page fails another check. Attribute parsing rejects `data-nonce` as a substitute for `nonce` and accepts whitespace around attribute assignment. Four direct regression cases pass. These changes improve diagnosis; they do not establish that the deployed CSP issue is fixed. Run `node scripts/verify-hosted.mjs` again and provide its terminal diagnostics before selecting a deployment fix. No production CSP relaxation was introduced. Phase 0 remains open; crypto work is deferred.

Owner's subsequent diagnostics show all nine application scripts (seven framework assets, two inline scripts) match the response nonce on both requests. Only the tenth, external non-framework script lacks a nonce. This rules out an application-wide nonce propagation failure in the observed responses. Its URL is intentionally not captured, so its identity is not yet confirmed.

The likely source is Netlify's edge-injected Powered by Netlify badge / pre-launch toolbar. Official documentation confirms injection for dynamically rendered pages and incompatibility with strict script CSP: https://docs.netlify.com/manage/projects/powered-by-netlify-badge/. Disable the badge in each project's Project configuration > General > Powered by Netlify badge and save; the documented setting takes effect on the next request without redeployment. Retest before declaring resolved. If the extra script remains, investigate the pre-launch toolbar, RUM or configured snippet injection with additional source identification. Do not add unsafe-inline or automatically grant a nonce to the injected script. No new application deploy is required for this proposed platform-setting fix.

### Resolution verified by owner — 2026-10-03

After the badge-disable instructions, the owner reran `node scripts/verify-hosted.mjs` and supplied four PASS results: Chat response and CSP 1, Chat response and CSP 2, PWA manifest and icons, and Same-origin service worker asset. The observed chat nonce failure is resolved without weakening CSP. This is owner-run hosted HTTP evidence, not an independent agent fetch or browser/device pass. The exact injected script URL was never captured. Admin HTTP verification, hydration/theme behavior, installed-PWA/offline tests and CI conclusions remain outstanding; Phase 0 is still open.

### Resumed checks — 2026-10-03

Local checks passed again. The hosted HTTP verifier now checks the separate admin origin twice, including nonce freshness, security headers, the stricter style policy and the closed preview. Nine directly executed infrastructure cases pass. Both origins can be overridden through `CHAT_TEST_ORIGIN` and `ADMIN_TEST_ORIGIN`; unsafe or shared-host overrides are rejected before requests.

Fresh hosted requests failed in the restricted agent environment. Local Playwright could not start because binding `127.0.0.1:3200` returned `EPERM`. These are environment failures, not evidence of an application regression or a browser pass. The earlier owner-run chat HTTP results remain valid historical evidence. Run the expanded verifier from a network-enabled terminal; the browser/device and CI gates remain open.

### Independent network and browser verification — 2026-10-03

After the owner enabled CLI network access, independent chat HTML/CSP checks (two responses), manifest/icons and service-worker asset checks passed. Admin returned HTTP 401 on both requests, so its live application headers and closed preview remain unverified.

The local five-profile matrix passed in the official Playwright 1.63.0 Noble container: 42 passed, 3 skipped. The live chat matrix passed: 37 passed, 3 skipped; the admin test was explicitly excluded because of HTTP 401. Skips cover only unreliable offline emulation outside Chromium; a loopback proxy test with the real worker and cached fallback passed on every profile when its network was cut. This does not verify installed-PWA or physical-phone behavior. DEVICE_TESTING.md records exact limitations and the container digest.

`pnpm check` passed again. GitHub Actions API confirms Checks #10 failed at E2E, with check/build/secret scan passing and audit skipped. Local test fixes are prepared but unpublished; no successful new CI conclusion is claimed. The historical network-blocked notes above are superseded by these results. Phase 0 remains open for live admin access/header checks, successful updated CI (including audit), and separately recorded device testing as available. Crypto work has not started.

Dependency follow-up: upgraded the development test runner from Vitest 3.2.7 to the patched 4.1.11 and updated pnpm-lock.yaml for GHSA-82fw-gwwq-j7x9 (https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9). After installation, `pnpm audit` reports no known vulnerabilities. The package cache required sandbox escalation; installation succeeded after approval. Browser tests use Playwright and were completed before this test-runner-only update.

Latest admin follow-up, 2026-10-03: the owner made the closed admin preview public. The agent reran `node scripts/verify-hosted.mjs`: all six checks passed, including two admin responses with fresh nonces and the stricter style CSP. `pnpm test:hosted --grep "admin preview"` passed all five profiles. This supersedes the earlier HTTP 401 blocker. Application admin authentication/actions are still absent. Phase 0 remains open for updated successful CI; real-device verification remains separately pending.

Owner mobile report, 2026-10-03: the owner reports that mobile testing passed. Device/browser identities and whether installed-PWA, offline revisit, storage, keyboard and safe-area scenarios were tested are awaiting clarification. Record this as owner-reported mobile success, without marking all physical iOS/Android checklist items complete.

Physical iPhone clarification, 2026-10-03: the owner verified Safari and the installed Home Screen app, reported a well-fitting layout in both, and saw persistent storage granted. This supersedes the earlier unspecified mobile report. No physical Android, offline, push or keyboard-edge-case pass is inferred.
