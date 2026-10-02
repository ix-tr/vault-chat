# Deployment — Netlify and hosted Supabase

Owner-confirmed on 2026-10-03: use Netlify and hosted Supabase for development and real-device testing. Netlify replaces Vercel; local Docker tooling remains optional. No site or cloud project has been created or deployed by this agent yet.

## Two separate sites

Create two Netlify sites from the same private GitHub repository. Distinct HTTPS hostnames, independent cookies/sessions and no shared browser storage remain mandatory. Platform-provided `netlify.app` names are sufficient initially; use stable names before passkey registration. The admin preview has no login or administrative actions yet.

| Setting | Chat | Admin |
| --- | --- | --- |
| Package directory | `apps/web` | `apps/admin` |
| Base directory | Unset (repository root) | Unset (repository root) |
| Configuration | `apps/web/netlify.toml` | `apps/admin/netlify.toml` |
| Build command | `pnpm check && pnpm --filter @vault/web build` | `pnpm check && pnpm --filter @vault/admin build` |
| Publish directory, relative to base | `apps/web/.next` | `apps/admin/.next` |

Keep the shared workspace and committed pnpm lockfile available to both builds. Node 24 and pnpm 10.28.2 are specified in each configuration. Netlify automatically supplies its Next.js adapter; do not export this app as static HTML, because CSP nonces require request-time rendering. After deploy, verify CSP headers, hydration, stylesheet loading and PWA behavior on the actual hosted routes. Adapter compatibility is not confirmed by merely parsing TOML.

References: [Netlify monorepo configuration](https://docs.netlify.com/build/configure-builds/monorepos/) and [Next.js support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

## Account connections and repository

The owner provided GitHub account `ix-tr` and a local `.token` file. That file is ignored and restricted to mode 0600. Do not paste credentials into chat, commit them, put them in Git remotes, or expose them in application environment variables. The agent cannot initialize Git in its read-only `.git` path or access external APIs from the restricted shell. GitHub/Supabase integrations were offered but no connection is confirmed. Netlify has no available integration in this session; the dashboard is a fallback.

The prepared publisher reads `.token` locally, stages only Git-visible files into temporary metadata, runs a redacted gitleaks scan, verifies the token belongs to `ix-tr`, and creates a private `vault-chat` repository if absent. It refuses a public/nonempty existing repository and never force-pushes. The local read-only `.git` path is not modified. Run from the owner's network-enabled terminal:

```sh
python3 scripts/publish_github.py
```

The token needs permission to create the repository and push its contents/workflow files. No remote action is taken until local staging and scanning pass. To inspect preparation without contacting GitHub, use `--prepare-only`. After publishing, select `ix-tr/vault-chat` in Netlify for each of the two sites. This publisher initializes the remote only; use a normal authenticated clone for subsequent Git collaboration rather than treating the temporary metadata as a persistent checkout.

## Supabase development project

Use a dedicated development project. Disable public account signup and anonymous sign-ins in Auth settings. Do not enable email password recovery now. The foundation UI has no Supabase client and needs no Supabase credentials to deploy. The owner stored Supabase connection details in ignored `supabasesettings` (mode 0600); its contents have not been printed or uploaded. A public project URL can be recorded once the project exists; database migrations, activation and crypto integrations belong to later phases. No fake demo accounts or plaintext seed are provisioned.

Before connecting data: deny-by-default RLS, admin-origin/session enforcement and private storage are required. Put service-role or secret keys only in server/Edge Function secret storage, never `NEXT_PUBLIC_*` or the chat site's client bundle. Recovery remains admin-issued re-activation only. See [Supabase deployment checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

## Hosted browser and phone checks

The dedicated hosted configuration does not start a local server. Set the URLs to the two actual sites:

```sh
export CHAT_TEST_ORIGIN=https://YOUR-CHAT-SITE.netlify.app
export ADMIN_TEST_ORIGIN=https://YOUR-ADMIN-SITE.netlify.app
pnpm test:hosted
```

Run in a terminal with the project's pnpm on PATH. Full coverage still requires Chromium, WebKit, Firefox and mobile projects. Hosted HTTPS does not install missing native browser libraries on CachyOS; run WebKit in the existing Ubuntu CI or test real Safari and record the distinction. Do not count a manual pass as an automated pass.

## Remaining gates

The current foundation is not a completed secure messenger: authentication, authorization, audited crypto and message delivery are absent. First validate the hosted shell with demo data only. Production readiness still requires the crypto ADR, RLS and token isolation tests, account lifecycle, delivery expiry, admin audit chain, rate limits, infrastructure metadata/log review, dependency/build integrity and device matrix. Hosted TURN/SFU services will be chosen in the calls phase. Free-tier quotas are not a capacity guarantee for 10k users.

## Push permission troubleshooting

Owner reported `Write access to repository not granted` / HTTP 403 on the initial push. The repository exists but remains empty. For a fine-grained token, select resource owner ix-tr and repository vault-chat, with Contents read/write and Workflows read/write (the upload includes .github/workflows). For an existing repository, broader administration permission is unnecessary. If using a classic token instead, private repository push requires repo and workflow scopes. Update the local .token when replacing a token and rerun the publisher; do not paste it into chat. [GitHub token permissions](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
