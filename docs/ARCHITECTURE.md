# Architecture draft

`apps/web` serves the chat origin. `apps/admin` is a separate Next.js app on the admin origin; sharing a repository does not share runtime browser storage, service workers, or sessions. `packages/shared` contains product name, centralized English UI text, validation and origin guards. `packages/crypto` is a deliberately empty protocol boundary until the Phase 0.5 decision. No message encryption is claimed.

Caddy terminates mkcert HTTPS and routes distinct hostnames to separate app ports. Supabase CLI owns its local database/auth/realtime/storage stack; Compose owns the gateway, TURN and SFU. Environment drives LAN addressing. No web app currently talks to Supabase.

Phase 1 must enforce separate host-only secure cookies, separate chat/admin token audiences, fresh passkey step-up, configurable short admin idle expiry, server-side role checks and restrictive admin-origin CORS. CORS alone is not authorization. Add chat-origin attack tests and cross-audience token tests when the endpoints exist. Admin role grants no content visibility; admins remain regular chat users with their own device keys.

Device-local encrypted history is authoritative. Backend message storage will be a time-partitioned delivery queue with configurable TTL and delivered-message grace. Recipient-device/time indexes, private authorized realtime channels, batched fan-out, pagination, virtualization, quotas and per-user rates belong in the delivery implementation.

First scaling pressures: private Realtime connections (plan capacity and connection lifecycle), Postgres envelope writes (batching/indexes/partition expiry), TURN bandwidth (relay capacity and geography), SFU CPU/network (room placement and horizontal instances). No local or hosted capacity measurements are available yet. `pnpm loadtest` must accompany actual message delivery; a fake shell benchmark would not measure it.

References: [Supabase local development](https://supabase.com/docs/guides/local-development), [Next.js CSP](https://nextjs.org/docs/app/guides/content-security-policy), [Caddy TLS](https://caddyserver.com/docs/caddyfile/directives/tls), [LiveKit ports](https://docs.livekit.io/transport/self-hosting/ports-firewall/).
