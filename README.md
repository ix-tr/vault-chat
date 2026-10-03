# Vault Chat

English-only, mobile-first private messenger. **Phase 0 foundation only: no working authentication, admin actions, message delivery, or cryptographic protocol yet.** Confirmed scope lives in [project decisions](docs/PROJECT_DECISIONS.md).

## Hosting direction

The owner now prefers Netlify + hosted Supabase for development/testing; see [deployment](docs/DEPLOYMENT.md). Local setup below remains optional. The hosted preview is not a completed secure messenger.

## Prerequisites

Node.js 24 LTS, pnpm 10.28.2, Docker Engine/Desktop with Compose and working socket access, mkcert, and gitleaks. Use Linux, macOS, or Windows through WSL/Docker Desktop. Install tools using their official installers; do not run the development environment as root. Supabase CLI is a pinned-by-lockfile project dependency after installation.

```sh
pnpm install
cp .env.example .env
pnpm certs
pnpm dev:all
```

`pnpm certs` installs the mkcert CA and generates a certificate covering **both origins**. Trust installation may request OS-level authorization outside this agent. Open `https://chat.localhost:8443` and `https://admin.localhost:8443`. Add both hostnames to your local hosts resolver pointing to 127.0.0.1 if necessary. `pnpm dev:stop` stops the services. `pnpm dev:reset -- --confirm-local-data-loss` resets the local database; it destroys local database data and does not clear browser data.

`pnpm dev:all` starts Supabase via its CLI, Caddy/coturn/LiveKit via Compose, then both Next.js apps. Ctrl+C stops the UI processes; use `pnpm dev:stop` for containers. Generated secrets and private certificates live under ignored `infra/runtime` and `infra/certs`. Keep them private. No real identities or chat data are supported by this preview.

## CachyOS/Arch prerequisite setup

The local package database provides mkcert and gitleaks. Install them with `sudo pacman -S --needed mkcert gitleaks nss`. System package installation and mkcert root trust must be performed from the owner's terminal; the agent cannot write system locations or invoke privileged installation in this session.

Keep pnpm at the version recorded in package.json without a global npm install:

```sh
npm install --prefix .tools --no-save pnpm@10.28.2
export PATH="$PWD/.tools/node_modules/.bin:$PATH"
pnpm install
pnpm certs
node scripts/doctor.mjs
```

Run these from the repository root. Repeat the PATH export in new terminals. `.tools` is ignored. Workspace configuration permits only the named installation hooks needed for Supabase CLI and native build tooling; do not enable all dependency scripts indiscriminately.

## Phones on the same Wi-Fi

Set `LAN_IP` and `TURN_EXTERNAL_IP` in `.env` to your computer's LAN IPv4 address. Use two distinct LAN-resolvable names for `CHAT_HOST` and `ADMIN_HOST`, e.g. `chat.vault.home.arpa` and `admin.vault.home.arpa`, and update both origin variables. Configure your router/local DNS to resolve both to the computer. A phone's localhost points to the phone, not the computer. Regenerate the certificate with `pnpm certs` whenever names or LAN IP change.

Trust the root CA on your phones following [device testing](docs/DEVICE_TESTING.md). Allow HTTPS TCP 8443 on the trusted LAN. The apps bind development ports 3100/3101 so the container gateway can reach the host: restrict direct access to these ports with your firewall and never use them as secure LAN origins. Supabase's own services may bind additional ports; restrict 54320–54324 to local development and do not expose them to the internet.

TURN uses TCP/UDP 3478 and the configurable UDP range `TURN_MIN_PORT`–`TURN_MAX_PORT` (defaults 49160–49200). LiveKit uses TCP 7880/7881 and UDP 50000–50100 in this draft. These call services are not connected to the UI yet; LAN ICE candidate and relay behavior must be verified in Phase 7. No router internet port forwarding is needed or intended.

## Environment diagnostic

Run `node scripts/doctor.mjs` before installing dependencies to report missing tools, Docker access, local configuration and registry connectivity without printing secret values. Dependency-free infrastructure tests run with `node --test tests/infra/*.test.mjs`.

## Checks

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium webkit firefox
pnpm test:e2e
```

On supported Linux distributions, Playwright can install system dependencies with `--with-deps`; CachyOS/Arch needs its own package manager if missing shared libraries are reported.

After installation, commit the generated `pnpm-lock.yaml`; CI deliberately requires it with `--frozen-lockfile`. The owner generated a lockfile during initial installation. Refresh it with `pnpm install` after dependency changes before frozen CI installation. Initialize Git when ready and run `pnpm prepare` to install the pre-commit hook (lint, typecheck, tests, gitleaks).

See [Phase 0 status](docs/PHASE_0.md), [architecture](docs/ARCHITECTURE.md), and [threat model](docs/THREAT_MODEL.md).

Development UIs use ports 3100/3101. Automated browser tests use dedicated ports 3200/3201 and refuse to reuse existing servers, so another app on port 3000 cannot be mistaken for Vault Chat.

Two Netlify sites are configured by `apps/web/netlify.toml` and `apps/admin/netlify.toml`. Set each site's Package directory to its app folder and leave Base directory unset; detailed account setup and hosted tests are in [deployment](docs/DEPLOYMENT.md).

For initial GitHub publication from the owner's terminal, run `python3 scripts/publish_github.py`. It creates a private `ix-tr/vault-chat` repository and uploads the foundation after scanning staged files. Credentials in `.token` and `supabasesettings` stay local. See deployment instructions before running.

For hosted chat/admin HTTP security checks and chat PWA assets, run `node scripts/verify-hosted.mjs` from the repository root. It defaults to both recorded Netlify origins and writes a secret-free ignored report. Override them with `CHAT_TEST_ORIGIN` and `ADMIN_TEST_ORIGIN` when needed; browser/device checks remain separate.
