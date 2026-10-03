# Phase 0 — foundation verification complete

Updated: 2026-10-03. Foundation changes merged through [PR #5](https://github.com/ix-tr/vault-chat/pull/5), squash commit `29f855fdebb178f52a4207bbb4a7f712be01fc39`. Main CI completed successfully, including checks/build, browser matrix, dependency audit and secret scan: [run](https://github.com/ix-tr/vault-chat/actions/runs/37112662708).

The application is still a preview: no working activation/login, operational admin actions or encrypted message delivery. Phase 0.5 now evaluates the audited browser crypto stack; see [ADR 0001](adr/0001-crypto-stack.md).

## Delivered

- pnpm workspace, separate Next.js chat/admin origins, English-only mobile layout and themes.
- Manifest/icons, generic offline fallback, installation guidance and persistent-storage request/warning.
- Separate nonce-based CSP policies and baseline security headers.
- Netlify per-app configuration; optional Supabase/Caddy/mkcert/call-service local tooling.
- CI, dependency updates, secret scanning and protected public main branch requiring PRs and successful verify/secrets checks.

## Completion evidence

| Gate | Recorded result |
| --- | --- |
| Local checks | `pnpm check` passed: lint/typecheck, nine infrastructure tests and Vitest. |
| Full local browser matrix | 42 passed, 3 skipped, across Chromium/WebKit/Firefox and Android/iOS emulation. |
| Live chat browser matrix | 37 passed, 3 skipped; admin excluded from this earlier run. |
| Live admin browser matrix | Five profile tests passed after the owner made the closed preview public. |
| Live HTTP checks | Six checks passed independently, including fresh chat/admin nonces, strict admin styles, manifest/icons and SW. Repeated after the merge with the same result. |
| Offline | Real worker/cache/fallback tested through a proxy that cuts network on every profile. Three separate unreliable `context.setOffline` cases remain skipped outside Chromium. Only the generic `/offline` document is cached. |
| Physical iPhone | Owner verified Safari and Home Screen app layout and reported storage granted; device model/iOS version unspecified. |
| Physical Android | Deferred by owner. Chromium/mobile emulation covers the phase's fallback gate. |
| GitHub CI | Final PR head and merged main both passed verify/secrets. |

Chat: https://vcht.netlify.app. Admin: https://comfy-croquembouche-2be7d5.netlify.app. HTTP passes verify current served behavior, not the exact Netlify deploy commit; no deploy-SHA evidence was available.

The earlier nonce failure was limited to an injected non-framework script and disappeared after the owner disabled Netlify's badge. Production CSP was not weakened. The earlier CI admin-control failure came from including Next.js development controls in application assertions; tests now scope to the admin main region. WebKit runs in the official Playwright container because CachyOS lacks required native libraries.

## Remaining device verification

The phase is complete using the explicitly permitted WebKit/Chromium emulation fallback. Physical Android, radio-off installed-PWA behavior, keyboard/safe-area edge cases and storage eviction remain unverified. These are recorded limitations, not device passes. Push, calls and account security belong to later phases. See [device checklist](DEVICE_TESTING.md).

## Offline reopen correction — 2026-10-03

Following the owner report, the worker now caches only the standalone `/offline.html` document in `vault-shell-v2` and claims open clients after successful installation/activation. The fallback has no external assets or Next.js hydration dependency. Failed navigation or HTTP 5xx serves this generic screen; a missing cache returns a plain reconnect message. Old shell caches are removed during activation. The retry link returns to the online shell when the network recovers. No conversations or account data are cached.

The five-profile network-proxy test now checks first-visit control without reloading, closes the page, cuts actual network access, and opens a fresh page using the same browser storage. It also tests an upstream 503 and successful retry. Local result: 42 passed, 3 existing offline-emulation skips; `pnpm check` passes. This simulates page closure/reopening, not killing an iOS app/browser process or rebooting a phone. The physical offline cold-start failure remains unverified until the owner retests the deployed update; no exact cause on the phone is claimed.
