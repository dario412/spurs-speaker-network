# Vercel

The reference for running this app on Vercel: project settings, every environment variable, domains, preview deployments, the enquiry webhook, and the first deploy. [deployment.md](deployment.md) covers releasing and rollback; [domains.md](domains.md) the per-site domain runbook; [content-contract.md](content-contract.md#revalidation) the revalidation webhook; [airtable-cms.md](airtable-cms.md) the Airtable people sync. Vendor facts below were read on 2026-10-20 (sources at the end).

The connected repository is [getapeptalk/peptalk-appearances](https://github.com/getapeptalk/peptalk-appearances); its current production app is [peptalk-appearances.vercel.app](https://peptalk-appearances.vercel.app/). The older `appearances.getapeptalk.com` hostname still points to Railway ([verified deployment status](deployment.md#current-demo-until-the-switch)). The settings below are the expected configuration; public health checks do not verify private project settings or environment values.

## Project settings

| Setting | Value | Why |
|---|---|---|
| Git repository | `getapeptalk/peptalk-appearances`, production branch `main`, root directory `/` | |
| Framework preset | **Next.js** (auto-detected) | |
| Install command | default (`npm install`; Vercel sees `package-lock.json`) | |
| Build command | default: `npm run build` (`next build`) | Vercel runs the `build` script when there is one |
| Output directory | default (leave empty) | Vercel configures it for a detected framework; don't override |
| Node.js version | **24.x** | `package.json → engines.node: "24.x"` overrides the project setting; 24.x is also Vercel's default |
| `vercel.json` | **none** | Nothing needs it: redirects, rewrites and headers live in `proxy.ts` and `next.config.ts`, the function region default is fine, and domains are project settings. Add one only for something these can't do. |
| System environment variables | **Enable access to System Environment Variables: on** | `/health` shows `VERCEL_GIT_COMMIT_SHA`; previews read `VERCEL_ENV` |
| Deployment Protection | optional | The app's own password gate covers every deployment. Vercel Authentication on previews can sit in front of it (two prompts); it doesn't affect anything the app reads. |
| Speed Insights / Web Analytics | **off** (not installed) | See [below](#speed-insights-and-web-analytics) |

Rendering: every page is prerendered at build time and served from the CDN; the proxy (gate, host routing, headers) runs before the cache on every request; `/health`, `/api/enquiry` and `/api/revalidate` are the only functions, plus the image optimizer and the background regeneration of pages after a revalidation ([architecture.md → Rendering and CSP](architecture.md#rendering-and-csp)).

## Environment variables

Set these in **Project Settings → Environment Variables**. Never commit values or put them in content or docs. "Build" means the value is baked into the prerendered pages: **redeploy** after changing it (Vercel applies any env change only to new deployments anyway).

### Set by you

| Variable | Purpose | Required | Example | Environments | Read at |
|---|---|---|---|---|---|
| `PREVIEW_PASSWORD` | Master password (HTTP Basic, any username). Opens every site, every domain, the landing page (`/`) and the component gallery (`/_gallery`, which nothing else opens). | **Yes** on every deployment, unless `PREVIEW_PUBLIC=true`: without it every page answers `503` | a long random string | Production, Preview | runtime |
| `PREVIEW_PASSWORD_<SLUG>` | Opens one site only: `/<slug>/…` on the hub, everything on its own domain, plus shared assets. `man-utd` → `PREVIEW_PASSWORD_MAN_UTD`. | Optional | `PREVIEW_PASSWORD_SPURS` | Production, Preview | runtime |
| `PREVIEW_PUBLIC` | `true` turns the gate off. Pages stay `noindex`: this is not a launch switch (that is `site.json → indexable`). | Optional | `true` | Production | runtime |
| `PUBLIC_ORIGIN` | The hub's origin for canonical, Open Graph, sitemap and structured-data URLs. Sites with a live domain use their domain instead. | **Yes** in Production | `https://appearances.getapeptalk.com` | Production (Preview optional) | build |
| `HUB_HOST` | The hub's host, for routing: the only host where a live site's folder answers `301` to its domain. Default: `PUBLIC_ORIGIN`'s host, else `appearances.getapeptalk.com`. | Optional | `appearances.getapeptalk.com` | Production | build |
| `SEARCH_INDEXING` | `off` switches indexing off everywhere, whatever `site.json` says (the kill switch) | Optional | `off` | any | build |
| `ENQUIRY_WEBHOOK_URL` | Where `POST /api/enquiry` forwards enquiries as JSON ([below](#enquiry-webhook)). https only (http only for `localhost`). Unset: enquiries are checked and discarded, nothing sent or stored. | Optional | `https://hooks.example.com/appearances` | Production (Preview only with a test receiver) | build (form) and runtime (endpoint) |
| `ENQUIRY_WEBHOOK_SECRET` | Sent as the `X-Enquiry-Secret` header with every forwarded enquiry, so the receiver can reject anything else | Recommended with the URL | a long random string | same as the URL | runtime |
| `TRACKING_GTM_ID` | Global Google Tag Manager fallback for sites without `site.json → tracking`. Must look like `GTM-XXXXXXX` (otherwise ignored and logged as `tracking.invalid`). Off by default. | Optional | `GTM-ABC1234` | Production | build (and the proxy's CSP, from the build manifest) |
| `CONTENT_PROVIDER` | Where sites, the registry and legal text come from: `json` (default: the files in Git) or `cms` (the same files with the CMS's saved edits on top, [cms.md](cms.md)) | **`cms`** once the CMS is in use | `cms` | Production, Preview | build and runtime |
| `DATABASE_URL` | The CMS's Postgres (users, saved content, media, sync runs). Set by the Vercel Neon integration. | **Yes** for the CMS and `CONTENT_PROVIDER=cms` | `postgres://…-pooler…` | Production, Preview | build and runtime |
| `DATABASE_URL_UNPOOLED` | Direct connection for the migrations (`scripts/db-migrate.mjs`, run before every build). Set by the Neon integration. | With the CMS | `postgres://…` | Production, Preview | build |
| `AUTH_SECRET` | Signs CMS sessions, form tokens and flash cookies. 32+ characters. Changing it signs everyone out. | **Yes** for the CMS | `openssl rand -base64 48` | Production, Preview | runtime |
| `ADMIN_EMAIL` | The first CMS owner, created by the migration without a password: they set it with "Forgot password" | Once | `dario@positivestudio.co` | Production | build |
| `RESEND_API_KEY` | Resend API key for CMS emails (password reset and invites) | Recommended (without it, no reset emails) | `re_…` | Production, Preview | runtime |
| `AUTH_EMAIL_FROM` | Sender for CMS emails, on a domain verified in Resend | With `RESEND_API_KEY` | `PepTalk CMS <no-reply@…>` | Production, Preview | runtime |
| `CRON_SECRET` | Bearer secret for `/api/cron/sync-airtable` (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`) | With a scheduled sync | `openssl rand -hex 32` | Production | runtime |
| `VERCEL_DEPLOY_HOOK_URL` | Deploy Hook the CMS calls when a save or sync adds or removes pages (new speakers, renamed slugs, page switches, new image hosts) | Recommended with the CMS | `https://api.vercel.com/v1/integrations/deploy/…` | Production | runtime |
| `AIRTABLE_SYNC_MODE` | `merge` (default: update and add speakers, keep the rest) or `replace` (Airtable owns every speaker, as in the Credible CMS) | Optional | `replace` | Production | runtime |
| `PEOPLE_PROVIDER` | Where people come from: `json` (default) or `airtable` (people for the sites in the Airtable config, [airtable-cms.md](airtable-cms.md)) | Optional | `airtable` | any | build, and runtime when a page regenerates after a revalidation |
| `AIRTABLE_TOKEN` | Airtable personal access token for the CMS speaker sync and for `PEOPLE_PROVIDER=airtable`: scope `data.records:read`, access to PepTalk's base. Never in the config file or the repository. | **Yes** for the CMS sync, and with `PEOPLE_PROVIDER=airtable` (the build fails without it) | `pat…` | Production, Preview | build, and runtime |
| `AIRTABLE_CONFIG` | The Airtable sync config as inline JSON (base, tables, field mapping; [config/airtable.example.json](../config/airtable.example.json)). Preferred on Vercel. | One of the two config sources with `PEOPLE_PROVIDER=airtable` | `{"baseId":"app…",…}` | Production, Preview | build, and runtime (regeneration) |
| `AIRTABLE_CONFIG_FILE` | Path to the Airtable config instead, when `AIRTABLE_CONFIG` is unset. Default: `config/airtable.json` if you commit one (IDs, not secrets), which the build traces into the functions. | Optional | `config/airtable.json` | any | build, and runtime (regeneration) |
| `IMAGE_HOSTS_EXTRA` | Extra image origins (comma-separated, https only), allowed by `next/image` and the CSP, for hosts that may first appear after a deploy through revalidation (an R2 bucket). Hosts already in the content are allowed automatically. Anything that isn't an https origin fails the build. | Optional (set it with Airtable images on R2) | `https://media.example.com` | Production, Preview | build |
| `REVALIDATE_SECRET` | Shared secret for `POST /api/revalidate` (CMS and Airtable webhooks), sent as `x-revalidate-secret` (or `Authorization: Bearer`). Unset: the endpoint answers `503`. Generate with `openssl rand -hex 32` ([content-contract.md → Revalidation](content-contract.md#revalidation)). | Optional (needed for updates without a deploy) | a long random string | Production (Preview only with its own value) | runtime |

### Set by Vercel (don't set them)

| Variable | Used for |
|---|---|
| `VERCEL_ENV` | `production`, `preview` or `development`. On `preview`, nothing is ever indexable (`lib/seo/indexing.ts`). |
| `VERCEL_GIT_COMMIT_SHA` | The `revision` that `/health` reports |
| `VERCEL_DEPLOYMENT_ID` | Scopes the content cache to the deployment (`next.config.ts` copies it into `APPEARANCES_CACHE_SCOPE`), so a deploy never serves the previous deployment's cached content |
| `VERCEL_PROJECT_PRODUCTION_URL` | Fallback for the hub's origin when `PUBLIC_ORIGIN` is unset. It is "the shortest production custom domain", so once partner domains are on the project it can be one of them; the app never uses a partner host for the hub, but set `PUBLIC_ORIGIN` anyway. |
| `NODE_ENV` | `production` on every Vercel deployment, previews included: the gate fails closed without `PREVIEW_PASSWORD` |
| `NEXT_RUNTIME` | Set by Next.js inside the app: the shared content modules then find `src/sites/` from the working directory (bundled code has no stable module paths) |

`VERCEL_URL` (the deployment's own `*.vercel.app` host) is deliberately not used: canonical URLs never point at a deployment URL.

### Internal or local only (never set on Vercel)

| Variable | Used for |
|---|---|
| `APPEARANCES_MANIFEST` | Set by `next.config.ts` at build time (the routing manifest the proxy reads); inlined, never configured |
| `APPEARANCES_CACHE_SCOPE` | Set by `next.config.ts` during the build: the content cache scope (`VERCEL_DEPLOYMENT_ID`, else a random id per build), inlined so every build worker and function agrees on it |
| `APPEARANCES_BUILD_SNAPSHOT` | Set by `next.config.ts` during `next build`: the OS temp directory where the build shares remote people (Airtable) with its page workers, so each site is fetched once per build |
| `NEXT_DIST_DIR` | Build directory override; the tests build into `.next-test` and `.next-test-fixture` |
| `APPEARANCES_SITES_DIR` | Content directory override for the JSON provider; the tests point it at fixture content |
| `CHROME_PATH` | Chrome binary for `npm run og-cards`, `visual`, `perf` and `perf:budget` |
| `ADMIN_PASSWORD`, `ADMIN_HOST`, `ADMIN_PORT` | The local admin ([admin.md](admin.md)); not deployed |
| `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BASE` | The admin's optional GitHub storage; not deployed |
| `CONTRACT_FAILING_ENV` | Contract tests only (`npm run contract`): JSON env overrides that break the source, e.g. `{"AIRTABLE_TOKEN":"invalid"}`, to check failures surface as typed errors |
| `CONTRACT_FETCH_IMAGES` | Contract tests only (`npm run contract`): `1` also fetches every image URL once |

`.env.example` lists the same variables for local runs, and `test/next/env.test.ts` fails when code reads a variable that isn't in both files.

## Domains

All hosts point at the one project; the proxy decides per host ([domains.md](domains.md)):
- `appearances.getapeptalk.com`: the hub (add it in **Settings → Domains** at the switch, [deployment.md](deployment.md#switching-the-demo-over-to-vercel)).
- A partner domain and its `www`: add both in **Settings → Domains**, then `registry.json → domains`. Follow the [runbook](domains.md#pointing-a-domain-runbook-per-site): add the domain, create the DNS records the domain card shows (apex `A`, `www` `CNAME`, a `TXT` at `_vercel` if asked), wait for verification and the certificate, deploy with `live: false`, check, then flip `live: true`.
- Don't configure Vercel's own redirect between apex and `www`: the app's alias `301` keeps path and query and follows the registry.
- Hobby projects allow up to 50 custom domains per project.

## Preview deployments

Every branch and PR gets a preview deployment. On previews:
- **Never indexed.** `VERCEL_ENV=preview` turns indexing off in every page, header, robots.txt and sitemap, whatever `site.json` says, and Vercel adds its own `X-Robots-Tag: noindex` to preview URLs.
- **Always gated.** `NODE_ENV` is `production` on previews, so the proxy answers `503` unless `PREVIEW_PASSWORD` is set in the **Preview** scope. With it, previews ask for the same passwords as production (set the same `PREVIEW_PASSWORD_<SLUG>` variables in Preview if partners review previews). Don't set `PREVIEW_PUBLIC` in Preview.
- **The hub, by folders.** A preview URL is not a partner domain, so it behaves as the hub: `/spurs/…` folders, the landing page at `/`, and no `301` to a live domain, so a live site's changes can be reviewed before promotion. A partner domain's mount can't be reached on a preview (the host can't be set); check it locally with `curl -H 'Host: <domain>'`.
- **Canonical URLs** point at production (`PUBLIC_ORIGIN` if set in Preview, else the production hostname), never at the preview.
- **Enquiries:** the hub still prepares real-address email drafts in previews; do not send them during testing. For partner-site forms, leave `ENQUIRY_WEBHOOK_URL` unset in Preview (or point it at a test receiver), so preview tests never reach the real inbox.

## Enquiry webhook

This section applies to partner-site forms. The hub form prepares an email draft to `hello@getapeptalk.com` in the visitor's email app; it does not call this endpoint or use the webhook variables ([hub behaviour](architecture.md#hub-discovery-and-email-enquiries)).

`POST /api/enquiry` (the partner-site form's `action`) validates the submission against the site's form and, when `ENQUIRY_WEBHOOK_URL` is set, forwards it:

```http
POST <ENQUIRY_WEBHOOK_URL>
Content-Type: application/json
X-Enquiry-Secret: <ENQUIRY_WEBHOOK_SECRET>

{
  "type": "enquiry",
  "version": 1,
  "site": { "slug": "spurs", "platform": "Spurs Speaker Network", "orgName": "Tottenham Hotspur", "url": "https://appearances.getapeptalk.com/spurs" },
  "personOfInterest": { "slug": "dele-alli", "name": "Dele Alli", "url": "https://appearances.getapeptalk.com/spurs/legends/dele-alli" },
  "fields": {
    "name": "…", "email": "…", "company": "…", "eventDate": "2027-03-14",
    "who": "Ex-player", "where": "At the stadium", "format": "Keynote & after-dinner", "audienceSize": "250–500", "brief": "…"
  },
  "submittedAt": "2026-10-20T09:00:00.000Z",
  "pageUrl": "https://appearances.getapeptalk.com/spurs/check-availability"
}
```

- `personOfInterest` is `null` for "not sure yet"; `eventDate` and `brief` are `null` when empty. URLs are canonical (the site's domain once live).
- The receiver should answer `2xx` within 8 seconds; anything else counts as a failure (the visitor is asked to try again, `502`). Redirects are not followed.
- **Without the URL**, the form behaves exactly as before: with JavaScript, the behaviour script validates and shows the concept confirmation without sending anything; without JavaScript, the browser's own validation runs, the endpoint checks the fields and discards them (nothing forwarded, stored or logged beyond the outcome), and the page shows the same confirmation. The form reads the setting at **build** time, so redeploy after setting or removing the URL.
- **Protections:** a hidden honeypot field, a minimum of 3 seconds between the page being ready and the submit (when JavaScript ran), a 16 KB body limit, `application/x-www-form-urlencoded` only, same-origin `Origin` only, the site's password gate (until the site is launched), and on a partner domain only that site's form. A light rate limit (10 per client per 10 minutes) runs in each function instance's memory, so it is a brake, not a guarantee: for a hard limit add a **Vercel Firewall rate-limit rule** (Firewall → New Rule: path `/api/enquiry`, method `POST`, fixed window, key IP, e.g. 10 per 60 s, action Deny or Challenge; available on every plan, counted per region).
- **Logs:** one line per request, `{"service":"appearances","event":"enquiry.submitted","site":"spurs","outcome":"forwarded","status":200}`. Never names, emails, briefs, IPs, the webhook URL or the secret. Outcomes: `forwarded`, `discarded`, `honeypot`, `too-fast`, `invalid`, `unknown-site`, `forbidden`, `unauthorized`, `rate-limited`, `too-large`, `unsupported`, `forward-failed`.
- The CSP needs no change: the form posts and the script fetches on the same origin (`form-action 'self'`, `connect-src 'self'`); forwarding happens on the server.

## Speed Insights and Web Analytics

Not installed. Both need a client package (`@vercel/speed-insights`, `@vercel/analytics`) that injects its script from JavaScript at a path generated per build. The path is same-origin, so `script-src 'self'` would allow it, but injecting a script by URL is a Trusted Types sink, and this app's policy (`trusted-types 'none'`) allows no policy that could let it through. Turning either on means adding the component to the root layouts and a narrow Trusted Types default policy for that path (as the tracking slot does for Google's host), then checking a preview in a browser. Web Analytics is cookieless (a daily-rotated request hash), so it wouldn't need the consent banner; still a decision for legal review. Until then, `npm run perf` and the CI budgets cover lab performance.

## First deploy (the developer's checklist)

The project is already connected and deployed. Use this checklist to verify it, or when setting up a replacement project.

1. **Project:** use the existing project connected to `getapeptalk/peptalk-appearances`. For a replacement, import it in Vercel (Add New → Project). Keep the detected Next.js preset and the default build and output settings. Don't add a `vercel.json`.
2. **Environment variables, before the first build** (`PUBLIC_ORIGIN` is fixed at build time):
   - Production: `PREVIEW_PASSWORD`, `PUBLIC_ORIGIN` set to the chosen canonical hub origin, any `PREVIEW_PASSWORD_<SLUG>`. Use `https://peptalk-appearances.vercel.app` while reviewing the new app as the primary site; use `https://appearances.getapeptalk.com` for the hostname switch. This is a configuration choice, not a claim about the current private environment value.
   - Preview: `PREVIEW_PASSWORD` (and the per-site passwords partners will use).
   - Leave `ENQUIRY_WEBHOOK_URL`, `TRACKING_GTM_ID`, `PREVIEW_PUBLIC`, `SEARCH_INDEXING`, `PEOPLE_PROVIDER` (and the Airtable variables) and `REVALIDATE_SECRET` unset for now.
   - After the import, open **Settings → Environment Variables** and make sure **Enable access to System Environment Variables** is ticked (it is not on the import screen; new projects usually have it on already). Without it, `/health` has no commit and Skew Protection is off.
3. **Deploy** and open the production `*.vercel.app` URL:
   - `/health` reports the deployed commit.
   - `/spurs` asks for the password; a per-site password opens only its site (on `/` it is redirected there); `/` and `/_gallery` need the master password.
   - Pages link through normally (no site uses demo mode today); photos load through `/_next/image`.
   - Response headers carry the CSP and `X-Robots-Tag: noindex, nofollow`.
4. **Preview:** open a PR and check its preview asks for the password (a `503` means `PREVIEW_PASSWORD` is missing from the Preview scope).
5. **Hub domain:** follow [deployment.md → Switching the demo over to Vercel](deployment.md#switching-the-demo-over-to-vercel) to move `appearances.getapeptalk.com` from its previous host.
6. **Later, one at a time:** partner domains ([domains.md](domains.md#pointing-a-domain-runbook-per-site)); the enquiry webhook (set both variables, redeploy, send a test enquiry, check the receiver and the `enquiry.submitted` log line); a Firewall rate-limit rule for `/api/enquiry`; tracking (only after legal review, per site in `site.json`); the Airtable people sync and the revalidation webhook (`REVALIDATE_SECRET`, [airtable-cms.md](airtable-cms.md)).

## Sources (read 2026-10-20)

- Next.js proxy: https://nextjs.org/docs/app/api-reference/file-conventions/proxy; NextResponse: https://nextjs.org/docs/app/api-reference/functions/next-response
- Multi-tenant routing (host-based rewrites, tenant headers from the proxy only): https://vercel.com/docs/platforms/multi-tenant-platforms/proxy-and-routing
- Request headers (`host`, `x-forwarded-for`, `x-real-ip`): https://vercel.com/docs/headers/request-headers
- Domains: https://vercel.com/docs/domains/working-with-domains/add-a-domain, https://vercel.com/kb/guide/a-record-and-caa-with-vercel, https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting
- System environment variables: https://vercel.com/docs/environment-variables/system-environment-variables
- Preview indexing: https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines
- Build settings: https://vercel.com/docs/builds/configure-a-build; Node.js versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Function limits (4.5 MB body): https://vercel.com/docs/functions/limitations
- Firewall rate limiting: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Speed Insights and Web Analytics: https://vercel.com/docs/speed-insights/quickstart, https://vercel.com/docs/analytics/quickstart, https://vercel.com/docs/analytics/privacy-policy
- Google tag CSP: https://developers.google.com/tag-platform/security/guides/csp; Trusted Types default policy: https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API
