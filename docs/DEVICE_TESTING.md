# Device testing

## Local certificate trust

Run `mkcert -CAROOT` on the development computer. Transfer only `rootCA.pem` to devices; **never transfer `rootCA-key.pem`**. Generate a leaf certificate covering both chat/admin DNS names and the LAN IP. Both names must resolve from each phone.

On iPhone, install the root certificate profile in Settings, then enable full trust in Settings → General → About → Certificate Trust Settings. Test HTTPS in Safari before installing to the Home Screen. On Android, install the CA using Settings → Security → Encryption & credentials (wording varies) → Install a certificate → CA certificate. Chrome generally trusts user-installed CAs; other apps may not. Remove development trust when no longer needed.

Alternative: a cloudflared or similar HTTPS tunnel may simplify demo testing, but routes traffic through a third party. The initial local-only target has been superseded by hosted Netlify HTTPS; a tunnel is an optional local-debugging alternative, use only demo data if explicitly choosing it. Separate chat/admin origins are still required.

## Required matrix per phase

- iOS Safari 17+: browser and installed Home Screen app.
- Android Chrome: browser and installed app.
- Desktop Chromium, Firefox and Safari/WebKit.
- Layout widths: 360, 390, 768, 1280px; keyboard open, rotation, safe areas, 44px targets, focus, dark theme, reduced motion and zoom.

Use `pnpm test:e2e` for Chromium/WebKit/Firefox and mobile emulation. Emulation does not verify actual Home Screen installation, push, storage eviction, media codecs, microphone permissions, backgrounding, audio routing, passkey PRF or call transforms. Record real-device results separately.

## Phase 0 checklist — automated checks recorded, physical devices pending

- [x] Chromium and WebKit automated tests pass (including mobile projects).
- [x] Desktop Firefox automated tests pass.
- [x] No overflow at all four widths; theme and keyboard focus work.
- [x] Both hosted HTTPS origins load in automated browsers without certificate exceptions (physical-phone checks remain separate).
- [x] Owner verified iPhone Safari and successful Home Screen installation; layout fits in both. The install-guidance wording itself was not separately assessed.
- [ ] Android Chrome + installed app; install event works when offered.
- [x] Persistent-storage denial produces a clear warning (permission refusal simulated).
- [x] Revisit offline after opening online; only a generic offline page appears (see automation limitations below).
- [x] Local and live admin previews offer no administrative action across all five browser profiles.

On 2026-10-03, the full local matrix passed in the official `mcr.microsoft.com/playwright:v1.63.0-noble` image: 42 passed, 3 skipped. The image digest was `sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`. A temporary source copy omitted local credentials and generated output; dependency mounts were read-only. The native CachyOS installation lacked WebKit libraries, so no system packages were changed.

The three skips are only `context.setOffline` scenarios for WebKit, Firefox and iOS emulation. A separate test forwards the actual chat page, service worker and offline response through a loopback proxy, explicitly registers the worker, then breaks its network connection. That test passes on all five profiles. This proves fallback behavior of the real worker and cached response; it is not an installed-PWA or physical-radio test. Chromium and Android emulation also pass direct offline navigation on the application origin. Layout/theme and keyboard tests exercise hydration directly on the application origin.

Real iPhone/Android installation, storage eviction and radio-off tests have not been performed. Later phases must extend this list for audio MIME negotiation, PRF fallback, stream-transform support, revoked permissions, autoplay, wake locks, output routing and PiP as features arrive. Use feature detection, never user-agent sniffing.

## Current hosted test targets

Chat: https://vcht.netlify.app
Admin: https://comfy-croquembouche-2be7d5.netlify.app

Direct hosted URLs need no mkcert installation on phones. The agent independently passed chat HTTP security/PWA checks after network access was enabled. After the owner made admin public, both admin HTTP checks and all five live admin browser profile tests passed. These verify the closed foundation preview, not future admin login or authorization.

Live chat matrix on 2026-10-03: 37 passed, 3 skipped using `pnpm test:hosted --grep-invert "admin preview"` with the recorded origins in the same Docker image. Live admin was explicitly excluded due to HTTP 401. The same offline-emulation/proxy limitations apply to the hosted run. No physical-device pass is claimed.

Admin follow-up, 2026-10-03: `pnpm test:hosted --grep "admin preview"` passed all five profiles after public visitor access was enabled by the owner. `node scripts/verify-hosted.mjs` passed all six HTTP checks. The earlier HTTP 401 limitation is resolved.

Owner mobile report, 2026-10-03: the owner reports that mobile testing passed. Device/browser identities and whether installed-PWA, offline revisit, storage, keyboard and safe-area scenarios were tested are awaiting clarification. Record this as owner-reported mobile success, without marking all physical iOS/Android checklist items complete.

### Physical iPhone result — owner report, 2026-10-03

The owner opened chat in iPhone Safari, added it to the Home Screen, and opened the installed app. Layout fit well in both contexts. The persistent-storage request displayed “Persistent storage granted.” This records a successful persistence request, not a guarantee against future data loss or a separate localStorage test. iOS version and phone model were not supplied. Offline revisits, push, keyboard-open/safe-area edge cases, admin behavior on the phone and Android physical-device testing remain unconfirmed. This clarification supersedes the earlier unspecified mobile report.

## Phase 0.5 crypto experiment — 2026-10-03

The isolated official OpenMLS 0.9.0 WASM experiment passed 15 tests (no skips) across desktop Chromium/WebKit/Firefox and Pixel 7/iPhone 13 Playwright emulation in the same official 1.63.0 Noble container. Cases cover separate Worker keys, real two/three-member messages, replay/tamper rejection, the upstream malformed-input trap and CSP denial. See [ADR 0001](adr/0001-crypto-stack.md).

This is emulation only. The owner's physical iPhone report predates this experiment and covers the shell. Before real account/message integration, run physical iOS Safari/Home Screen and Android Chrome/installed-PWA checks for crypto cold load, reload/persistence, interrupted operations and device membership changes. Those flows are not yet implemented. No new physical-device pass is claimed.

Binding/storage continuation: 50 combined tests passed without skips in the same five-profile container matrix, including encrypted IndexedDB snapshots, strict transactions, Worker restart, update/removal, stale-writer conflicts, aborted/lost-reply sends and invalid snapshots. See [exact scope](CRYPTO_STATE.md). Physical devices, OS power loss and a credential-unlocked page reload remain unverified; only Worker restoration was exercised.

Credential-unlock continuation: 75 combined tests passed across the five profiles, including genuine MLS restoration after a full page reload with Argon2id. This supersedes the earlier Worker-only restoration limitation. PRF outputs and assertion helper tests are synthetic/mocked; no authenticator or physical device pass is claimed. See [DEVICE_UNLOCK.md](DEVICE_UNLOCK.md) for remaining checks.

## Virtual authenticator follow-up — 2026-10-03

Four additional tests pass in desktop Chromium and Android Chromium emulation using CDP virtual CTAP2 authenticators and actual browser `navigator.credentials.create/get` calls. Both PRF-capable key wrapping/reopening and new-enrollment password fallback without PRF survive a full page reload. No mock assertion is used in these four tests. The earlier 75 tests remain passing; combined coverage is 79 cases. CDP virtual authenticator support is Chromium-only, so this file is explicitly excluded from WebKit/Firefox/iOS projects; their existing fallback/primitive coverage remains. The test uses a localhost RP origin, public demo envelopes and fixture challenges; no backend assertion verification or session is created. Physical phone/authenticator tests and complete Worker integration remain pending. See [CDP WebAuthn options](https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/#type-VirtualAuthenticatorOptions).
