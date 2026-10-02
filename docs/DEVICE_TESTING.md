# Device testing

## Local certificate trust

Run `mkcert -CAROOT` on the development computer. Transfer only `rootCA.pem` to devices; **never transfer `rootCA-key.pem`**. Generate a leaf certificate covering both chat/admin DNS names and the LAN IP. Both names must resolve from each phone.

On iPhone, install the root certificate profile in Settings, then enable full trust in Settings → General → About → Certificate Trust Settings. Test HTTPS in Safari before installing to the Home Screen. On Android, install the CA using Settings → Security → Encryption & credentials (wording varies) → Install a certificate → CA certificate. Chrome generally trusts user-installed CAs; other apps may not. Remove development trust when no longer needed.

Alternative: a cloudflared or similar HTTPS tunnel may simplify demo testing, but routes traffic through a third party. This is not the initial supported local-only setup; use only demo data if explicitly choosing it. Separate chat/admin origins are still required.

## Required matrix per phase

- iOS Safari 17+: browser and installed Home Screen app.
- Android Chrome: browser and installed app.
- Desktop Chromium, Firefox and Safari/WebKit.
- Layout widths: 360, 390, 768, 1280px; keyboard open, rotation, safe areas, 44px targets, focus, dark theme, reduced motion and zoom.

Use `pnpm test:e2e` for Chromium/WebKit/Firefox and mobile emulation. Emulation does not verify actual Home Screen installation, push, storage eviction, media codecs, microphone permissions, backgrounding, audio routing, passkey PRF or call transforms. Record real-device results separately.

## Phase 0 checklist — pending

- [ ] Chromium and WebKit automated tests pass (including mobile projects).
- [ ] Desktop Firefox automated tests pass.
- [ ] No overflow at all four widths; theme and keyboard focus work.
- [ ] Both LAN HTTPS origins have trusted certificates.
- [ ] iPhone Safari + Home Screen installation; manual install guidance works.
- [ ] Android Chrome + installed app; install event works when offered.
- [ ] Persistent-storage denial produces a clear warning.
- [ ] Revisit offline after opening online; only a generic offline page appears.
- [ ] Admin preview offers no administrative action.

No browser emulation or real-device checks have been run in the initial agent environment. Later phases must extend this list for audio MIME negotiation, PRF fallback, stream-transform support, revoked permissions, autoplay, wake locks, output routing and PiP as features arrive. Use feature detection, never user-agent sniffing.
