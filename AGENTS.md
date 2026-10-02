# ADDENDUM (takes precedence over earlier text where they conflict)

## 1. Super admin is also a regular chat user
- A super_admin/admin account is a normal user account with an extra role. It has its own chat identity keys, devices and conversations like any user.
- Separation of duties: chat session and admin session are DIFFERENT sessions. Opening /admin requires a fresh passkey step-up (WebAuthn user verification) even when already logged in to chat, with a short admin-session lifetime (e.g. 15 min idle) that does not extend the chat session.
- Serve the admin panel from a SEPARATE ORIGIN (e.g. admin.localhost in dev, admin.<domain> in prod) with its own cookies, its own stricter CSP and no shared storage with the chat app, so an XSS in the chat UI can never reach admin capabilities. Document the local setup (mkcert certs must cover both origins).
- Admin chat content is exactly as private as any user's: other admins and the super admin themselves cannot read other people's messages. The audit log records admin ACTIONS only.
- Role changes, deleting the last super admin, and demoting oneself are blocked or require explicit confirmation + step-up. At least one super admin must always exist.
- Add tests: a chat-origin XSS payload cannot call any admin Edge Function; an admin session token cannot be used for chat decryption and vice versa.

## 2. Scale is unknown: design for 10 users to ~10k without rewrites
- All limits (max users, group size, message retention, storage quota, call participants) come from `app_settings`/env, never hard-coded.
- Partition `message_envelopes` by time (e.g. monthly) and use indexes that match delivery queries (recipient_device + created_at). Delete expired data by dropping partitions where possible instead of row-by-row deletes.
- Realtime: use per-recipient private channels with Realtime Authorization; avoid broadcasting to large channels. Large groups fan out per recipient device with batching.
- Provide `pnpm loadtest` (k6 or similar) that simulates N users sending messages and reports latency/error rates; document the observed limits of local Supabase vs hosted Supabase plans.
- Pagination and virtualization everywhere; no unbounded queries; per-user rate limits.
- Document which components are the first bottlenecks (Realtime connections, Postgres writes, TURN bandwidth, SFU CPU) and how to scale each.

## 3. Cross-platform: iPhone (Safari/WebKit) AND Android (Chrome) are both first-class
Test matrix: iOS Safari 17+ (in-browser AND installed to Home Screen), Android Chrome (in-browser AND installed), desktop Chrome/Firefox/Safari. Use Playwright with Chromium + WebKit (+ Firefox for desktop) and manual device checklists in docs/DEVICE_TESTING.md.
Handle these known differences explicitly (feature-detect, never user-agent sniff, provide graceful fallbacks, and tell the user clearly when something is unsupported):
- Web Push on iOS works only for PWAs installed to the Home Screen (iOS 16.4+): build an in-app "Install this app" onboarding for iOS (Share -> Add to Home Screen) because `beforeinstallprompt` does not exist there.
- Storage eviction: request persistent storage (`navigator.storage.persist()`), warn users that non-installed iOS Safari can evict IndexedDB; encrypted backup prompt for those cases.
- Voice messages: Safari records audio/mp4 (AAC), Chrome records audio/webm (Opus). Negotiate with `MediaRecorder.isTypeSupported`, store the MIME inside the encrypted metadata, and make playback work on both.
- WebAuthn PRF extension support varies: detect it; fall back to passphrase-derived (Argon2id) key wrapping when PRF is unavailable.
- E2EE for calls: Chrome uses `RTCRtpSender.createEncodedStreams`, Safari/Firefox use `RTCRtpScriptTransform` (Worker-based). Implement an abstraction that supports both; if a browser supports neither, block group calls for that browser with a clear message instead of silently sending unencrypted media.
- Audio autoplay/unlock gestures, getUserMedia in standalone mode, wake lock fallbacks (NoSleep-style), audio output routing (setSinkId unsupported on iOS), PiP differences, 100dvh/safe-area/keyboard-resize behavior, 300ms tap/zoom quirks (use correct viewport meta and `touch-action`).
- Camera/mic permissions denied or revoked mid-call must be handled gracefully.
- Local phone testing: document how to install the mkcert root CA on iPhone (install profile + enable full trust in Settings -> General -> About -> Certificate Trust Settings) and on Android (user CA install; note Chrome on Android trusts user CAs but some apps do not). Also document a tunnel alternative (e.g. cloudflared) for quick tests and clearly warn that it routes traffic through a third party, so use it only with demo data.
- Each phase's "done" checklist must include a pass on iOS Safari and Android Chrome (or WebKit/Chromium Playwright projects when real devices are unavailable), with a list of anything verified only on emulation.
