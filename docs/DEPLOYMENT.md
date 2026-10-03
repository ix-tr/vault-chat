# Deployment — Netlify and hosted Supabase

Repository update, 2026-10-03: owner-authorized public visibility is now enabled after a clean history/staged secret scan. `main` is protected against force pushes and deletion, requires PRs and up-to-date GitHub Actions `verify`/`secrets` checks, and enforces these rules for administrators. Active update: https://github.com/ix-tr/vault-chat/pull/5. Earlier private/bootstrap instructions below are historical; do not rerun initial-publication scripts against the existing repository. Use a normal clone, feature branches and PRs.

Latest admin follow-up, 2026-10-03: the owner made the closed admin preview public. The agent reran `node scripts/verify-hosted.mjs`: all six checks passed, including two admin responses with fresh nonces and the stricter style CSP. `pnpm test:hosted --grep "admin preview"` passed all five profiles. This supersedes the earlier HTTP 401 blocker. Application admin authentication/actions are still absent. Phase 0 remains open for updated successful CI; real-device verification remains separately pending.

Latest independent verification, 2026-10-03: CLI network access is now enabled. Chat HTTP security/PWA checks passed, and the live chat five-profile browser matrix passed with 37 passes and 3 offline-emulation skips covered by a separate unavailable-network fallback test. Admin returns HTTP 401; its application page and security headers remain unverified. Local full matrix: 42 passed, 3 skipped. GitHub Checks #10 failed at E2E; local test fixes are not yet published. See HANDOFF.md and DEVICE_TESTING.md for evidence and limitations.

Earlier owner verification, 2026-10-03: the owner reran `node scripts/verify-hosted.mjs` after the badge-disable instructions. Both chat HTML/CSP checks, manifest/icons and service-worker asset passed. The chat nonce mismatch is resolved without a CSP relaxation. This HTTP result does not verify admin, hydration, installed-PWA behavior or offline execution.

Owner-confirmed on 2026-10-03: use Netlify and hosted Supabase for development and real-device testing. Netlify replaces Vercel; local Docker tooling remains optional. No site or cloud project has been created or deployed by this agent yet.

## Two separate sites

Create two Netlify sites from the same GitHub repository. Distinct HTTPS hostnames, independent cookies/sessions and no shared browser storage remain mandatory. Platform-provided `netlify.app` names are sufficient initially; use stable names before passkey registration. The admin preview has no login or administrative actions yet.

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

## Reported deployed sites

The owner reported successful Netlify build/deploy/post-processing for the chat site at https://vcht.netlify.app. This is owner-reported deployment success; the agent could not independently fetch the page/manifest/service worker through the web tool, and its shell could not resolve the hostname. No successful HTTP, CSP, PWA or device validation is claimed. The separate admin site has not yet been reported.

Owner supplied the separate admin site URL https://comfy-croquembouche-2be7d5.netlify.app after reporting the expected Administration / Access unavailable preview. The two recorded hosts differ. This confirms the reported layout only, not implemented admin authentication/session isolation.

## Hosted application mismatch reported

The owner reports both recorded URLs render the admin preview. Local source/config separates the chat Shell from the admin page and selects the correct build/publish folders. Chat deployment is therefore not validated; inspect the vcht site's package directory, config selection, build command and publish path, and whether both URLs point to the same Netlify project. Correct chat settings and redeploy before claiming two functioning applications. No cloud configuration was inspected or changed by the agent.

## Generated Netlify dependency lint failure

Owner deploy log shows the chat command/publish path are correct, but ESLint scans `.netlify/plugins/deno-cli/deno_dir/...` and fails on dependency declarations. The local fix globally excludes .netlify and other generated tooling/output directories while retaining source lint rules; .netlify is also Git-ignored. pnpm check passed, and an ESLint API check confirmed the reported dependency path is ignored while shell.tsx is not.

To apply only the two configuration files to the existing private repository from the owner terminal, run `python3 scripts/fix_netlify_deploy.py`. Unlike the initial publisher, this creates one normal commit on existing main, preserves the base tree and changes only eslint.config.mjs and .gitignore. It never force-updates the branch. Its preparation/secret scan and three mocked safety checks passed; real network publication cannot run from the restricted agent shell. New Netlify deploy/runtime verification remains pending.

## Latest owner deployment result

The owner reports the generated-dependency lint fix is deployed and https://vcht.netlify.app now works. This supersedes the earlier active build-failure report; automated hosted CSP/PWA/device verification is still pending. Use the recorded chat/admin URLs with playwright.hosted.config.ts.

## Public chat access request

Owner requested removal of the chat site's private visitor access so https://vcht.netlify.app can be accessed from other devices without a Netlify login. Change the vcht Netlify project visibility to Public in Project configuration > General > Visitor access. No change to private GitHub repository visibility is required. The agent lacks Netlify account access and has not changed or verified this setting; owner dashboard action is pending. This request concerns the chat site and does not authorize changing the admin site's visitor controls.

## Public access and HTTP verification

The owner confirms the chat site now works after removing private visitor access. The owner also reports that both checked views look good; exact device/browser/installation evidence has not been specified.

Run `node scripts/verify-hosted.mjs` in the network-enabled owner terminal to check the chat page, fresh matching CSP/HTML script nonces, baseline headers, non-cacheable dynamic HTML, manifest/icons and service-worker MIME. The report is saved to ignored `test-results/hosted-http-report.json`; it contains no credentials/page content. This does not replace browser hydration/offline/installation/device tests. The restricted agent's own HTTP attempt failed on fetch/network access, not a confirmed application defect.
# Strict CSP and Netlify-injected scripts

For chat (`vcht`) and admin (`comfy-croquembouche-2be7d5`), disable **Project configuration > General > Powered by Netlify badge**, then save. Netlify documents that this is a per-project setting effective on the next request without a deploy: https://docs.netlify.com/manage/projects/powered-by-netlify-badge/. Its badge / pre-launch toolbar script is injected at the edge and can conflict with strict CSP. Do not weaken the application's script policy to permit it.

On 2026-10-03, owner-supplied diagnostics confirmed nine application scripts with matching nonces and one additional external script without a nonce, on two chat requests. Badge injection is the leading explanation, not yet a confirmed identification. After changing the setting, run `node scripts/verify-hosted.mjs`; retain the failure if any extra nonced-script mismatch remains. The expanded verifier checks both chat and admin HTTP responses, including the closed admin preview and its stricter style policy. Browser/runtime verification remains separate. Run it from a network-enabled terminal; expect six PASS results before recording HTTP completion.
