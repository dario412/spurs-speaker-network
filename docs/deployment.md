# Deployment

This repository deploys to **Vercel** as a Next.js app. Vercel builds it, serves the prerendered pages from its CDN and runs the proxy (`proxy.ts`) in front of them; there is no server of our own. [vercel.md](vercel.md) is the reference for project settings, every environment variable and the first-deploy checklist; this page covers the live demo's move, releasing and rollback.

## Current demo (until the switch)

The new repository is [getapeptalk/peptalk-appearances](https://github.com/getapeptalk/peptalk-appearances), connected to Vercel. Its production app is already available at [peptalk-appearances.vercel.app](https://peptalk-appearances.vercel.app/). Merging here releases to that app; moving the older demo's hostname is a separate step.

Public health checks verified on **2026-10-20**:

| URL | Hosting | Observed response |
|---|---|---|
| `https://peptalk-appearances.vercel.app/health` | Vercel | HTTP 200, `status: "ok"`, revision `d76cbd19ea5335ea13563f6371c6c234edb95f50` |
| `https://appearances.getapeptalk.com/health` | Railway | HTTP 200, `status: "ok"`, revision `b18b4c5887c4e8e300672ed55e4137e17855bfd6` |

These revisions are dated observations, not expected values for future releases. The older hostname still serves the generator from `getapeptalk/peptalk-engine`, not this repository. Use the Vercel URL to review this app until the DNS switch below. Neither a healthy response nor the Git connection proves that the Preview environment, branch protection or optional integrations are configured; check those separately.

The approved hub redesign is [PR #21](https://github.com/getapeptalk/peptalk-appearances/pull/21), deployed at the Vercel revision above. The developer acceptance steps and file ownership map are in [onboarding](onboarding.md#handover-checklist).

## Vercel project

| Setting | Value |
|---|---|
| Repository / branch | `getapeptalk/peptalk-appearances`, production branch `main`, root directory `/` |
| Framework | Next.js (auto-detected); no `vercel.json` ([vercel.md → Project settings](vercel.md#project-settings)) |
| Build / output | `npm run build` (`next build`) / Vercel's Next.js output |
| Node | 24.x (from `package.json` → `engines`) |
| Health check | `GET /health` → `{"status":"ok","revision":"<sha>"}`; `503 {"status":"misconfigured"}` without a master password |
| Rendering | Every page is prerendered at build time and served from the CDN; the proxy (gate, headers, CSP) runs before the cache on every request. Photos go through the Next.js image optimizer (`/_next/image`, billed per transformation). See [architecture.md → Rendering and CSP](architecture.md#rendering-and-csp). |

## Environment

Set variables in **Project Settings → Environment Variables**; never commit values or put them in content or docs. The minimum is `PREVIEW_PASSWORD` in Production and Preview (without it every page answers `503`) and `PUBLIC_ORIGIN` in Production (read at build time, so redeploy after changing it), with **Enable access to System Environment Variables** turned on. Every variable, with examples, environments and whether it is read at build time or runtime: [vercel.md → Environment variables](vercel.md#environment-variables). Partner domains: [domains.md](domains.md#pointing-a-domain-runbook-per-site).

## Switching the demo over to Vercel

1. Use the existing connected Vercel project; import the repository only when creating a replacement project. Confirm the settings above. Decide the hub canonical origin deliberately: `https://peptalk-appearances.vercel.app` while that is the primary app URL, or `https://appearances.getapeptalk.com` when preparing the hostname switch. Set `PUBLIC_ORIGIN` before the build and redeploy after changing it; it is fixed at build time. Keeping the older origin before the switch makes canonical and shared links point at the Railway demo.
2. Deploy, then check the `*.vercel.app` production URL:
   - `/health` reports the new commit
   - `/spurs` asks for the password, and a per-site password opens only its own site
   - `/` (the landing page) and `/_gallery` need the master password; a per-site password on `/` is redirected to its own site
   - every page links through normally (no site uses demo mode today), and photos load through `/_next/image`
3. In **Settings → Domains**, add `appearances.getapeptalk.com`. At the DNS provider (Cloudflare), point the `appearances` record at the target Vercel shows instead of the previous host. Keep it **DNS only** (no proxying) while Vercel issues the certificate.
4. Check `https://appearances.getapeptalk.com/health` reports the Vercel commit, then load a few pages.
5. Keep the previous hosting running for a few days; switching back is the DNS record. Then PepTalk retires it.

Open decision: once Vercel deploy checks are set up, decide whether `/health` should keep answering `503` when the master password is missing, or whether that signal should move elsewhere.

## Releasing changes

- Protect `main` in GitHub (**Settings → Branches**): require a PR and the `check` and `perf` job checks from the `CI` workflow (`.github/workflows/ci.yml`). `check` runs typecheck, lint, content validation, the contract check, markdown links, tests and `next build`; `perf` runs the performance budgets. Confirm the check names GitHub shows when configuring protection; the workflow name alone is not a job check.
- Every PR gets a Vercel preview deployment, behind the same password gate (it needs `PREVIEW_PASSWORD` in the Preview scope).
- Squash-merge. Vercel deploys `main` to production.
- After deploying, check `/health` reports the new commit, then load the pages you changed. `/health` doesn't prove the pages built correctly.

## Rollback

Use **Instant Rollback** in Vercel (or promote the previous production deployment), or revert the commit on `main`. The app has no database or migrations to roll back. A rollback does not undo enquiries already forwarded to an external webhook, remote CMS/Airtable changes, DNS changes or project settings; reconcile those separately if affected. A rollback serves the earlier build as it was, including its `PUBLIC_ORIGIN` and content.

## Operational notes

- The admin (`npm run admin`) isn't part of the deployment and must never be exposed publicly ([admin.md](admin.md)).
- There is no rate limiting on the password gate: brute force against a preview password is limited only by its strength, so use long random passwords. The enquiry endpoint (10 per client per 10 minutes) and the revalidation webhook (30 per client per minute) have light limits held in each function instance's memory; add a Vercel Firewall rate-limit rule for `/api/enquiry` before forwarding real enquiries ([vercel.md → Enquiry webhook](vercel.md#enquiry-webhook)).
- The app logs very little, as JSON lines: `origin.invalid` for a malformed `PUBLIC_ORIGIN` and `tracking.invalid` for an invalid `TRACKING_GTM_ID` (both at build), one `enquiry.submitted` line per enquiry (site and outcome only), one `revalidate` line per webhook call, and the Airtable sync's `airtable.*` lines (`airtable.synced`, `airtable.record_skipped`, retries) wherever it reads. Request logs are Vercel's. No request bodies, personal data or credentials are ever logged.
