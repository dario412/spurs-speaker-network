# Developer onboarding

Start here if you are taking over this repository. It is a Next.js 16 app (App Router, React Server Components, strict TypeScript) that serves official sports-talent booking sites for clubs, leagues and associations, operated by PepTalk. One codebase and one Vercel project serve every site; sites differ only in content and branding.

Repository: [getapeptalk/peptalk-appearances](https://github.com/getapeptalk/peptalk-appearances). Review the new app at [peptalk-appearances.vercel.app](https://peptalk-appearances.vercel.app/); `appearances.getapeptalk.com` still serves the older Railway demo. The Vercel connection is already in place; see [deployment status](deployment.md#current-demo-until-the-switch).

This page is the map. The detail lives in the other docs, linked from each section.

## Contents

- [Handover checklist](#handover-checklist)
- [Day one](#day-one)
- [Architecture tour (10 minutes)](#architecture-tour-10-minutes)
- [Component gallery](#component-gallery)
- [Plugging in your CMS](#plugging-in-your-cms)
- [Switching on Airtable](#switching-on-airtable)
- [First deploy to Vercel](#first-deploy-to-vercel)
- [Domains, launch and indexing](#domains-launch-and-indexing)
- [What exists that the CMS may replace](#what-exists-that-the-cms-may-replace)
- [Open decisions and known limitations](#open-decisions-and-known-limitations)
- [Glossary](#glossary)

## Handover checklist

The approved hub redesign was released in [PR #21](https://github.com/getapeptalk/peptalk-appearances/pull/21), after the repository/Vercel documentation review in [PR #20](https://github.com/getapeptalk/peptalk-appearances/pull/20). Its application release revision is `d76cbd19ea5335ea13563f6371c6c234edb95f50`; later documentation or application releases will have newer health revisions. The release passed `check`, `perf`, Vercel preview and local desktop/mobile interaction checks. This is ready for development handover; public commercial launch still requires the approvals below.

Before taking ownership:

- Confirm GitHub access to this repository and Vercel access to the `peptalk/peptalk-appearances` project. Obtain preview passwords through PepTalk's approved secret-sharing channel; they are not in Git. DNS access is needed only for a hostname switch. Private environment values and optional integrations must be checked in Vercel, not inferred from this document.
- Follow local setup below, run `npm run check`, and open `/` (redirects to `/spurs`), `/all`, `/spurs/legends` and `/_gallery`. For a production-mode smoke test, run `npm run build`, then `PREVIEW_PUBLIC=true npm start` locally only.
- On the hub, verify the six featured people, search/filter/clear, mobile menu, format selection and FAQ. Preparing an enquiry should show an email draft, preserve edits and offer a copyable full brief for long entries. Do not send a real enquiry as part of a smoke test.
- For a change, open a branch/PR, require green `check` and `perf`, review its Vercel preview, then squash-merge. Match production `/health` to the merge SHA and inspect the changed pages with the master password ([release and rollback](deployment.md#releasing-changes)).
- Keep the remaining launch work explicit: licensed images and partner approvals, reviewed legal text, the CMS decision, a production enquiry receiver if required, and any DNS switch. These are described in [known limitations](#open-decisions-and-known-limitations), not completed by this redesign.

### Editing the hub

| Change | Owner |
|---|---|
| Hub section copy, layout and composition | `components/landing.tsx` |
| Search, mobile navigation and email-draft form | `components/landing-interactions.tsx` |
| Featured-person order and portrait focal presets | `src/copy/landing.mjs` |
| Hub styling and typography | `.ap-*` rules and Medium font face in `public/styles.css`; preloads in `lib/render/assets.ts` |
| Hub metadata and share card | `app/(landing)/page.tsx`, `scripts/og-cards.mjs`; run `npm run og-cards -- --landing-only` |

The hub uses Recoleta Medium and Sofia. Keep its scoped styles separate from partner-site themes. Search uses the published catalogue in the page, without a search service. Its email draft goes to `hello@getapeptalk.com` and requires a visitor to send it from their email app; `ENQUIRY_WEBHOOK_URL` configures partner-site forms only. The hub is verified at `/`; the partner component gallery does not cover it.

## Day one

### Setup

You need Node 24 (`.nvmrc`; `package.json → engines` says `24.x`) and, for the screenshot tools only, Chrome or Chromium.

```bash
nvm use            # or any Node 24
npm ci
cp .env.example .env   # optional: every variable is optional locally
npm run dev        # http://localhost:3000: the PepTalk landing page
```

With no password variables set, `npm run dev` serves every page without a prompt. Open `/` (it redirects to `/spurs`, the root site), `/all` (the PepTalk landing page listing every site), `/spurs/legends`, a profile and [`/_gallery`](#component-gallery).

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server; content edits show on reload |
| `npm run check` | The local gate: Biome lint, content validation, the content contract check, markdown links, the tests and the typecheck. Run it before every PR. |
| `npm test` | The test suites only (Node's built-in runner, no extra tooling). One file: `node --test test/next/proxy.test.ts`. The integration suite (`test/next/app.test.ts`) builds the app twice; `NEXT_TEST_SKIP_BUILD=1` reuses those builds. |
| `npm run build` | `next build`, what Vercel runs. Then `PREVIEW_PASSWORD=<anything> npm start` serves it in production mode, which answers `503` without a master password. |
| `npm run perf:budget` | The CI performance budgets (needs Chrome; set `CHROME_PATH` if it isn't at `/usr/bin/google-chrome`) |
| `npm run visual` | Visual regression check against a baseline you capture on `main` first with `npm run visual -- --update` (needs Chrome) |
| `npm run admin` | The local content admin on http://127.0.0.1:3095 (edits the JSON files; [admin.md](admin.md)) |
| `npm run contract` | The provider conformance suite against the providers your environment selects (your CMS or Airtable base) |

Every script is in [README.md → Scripts](../README.md#scripts). CI (`.github/workflows/ci.yml`) runs the `check` steps plus `next build` in one job, and the performance budgets in another.

### Where to look

| You want to… | Look at |
|---|---|
| Change markup or a component | `components/site/`, then check it in [`/_gallery`](#component-gallery) |
| Change styles | `public/styles.css` (shared); per-site tokens come from `site.json → theme` and `style` through `lib/render/theme.ts` |
| Change what a site says or shows | `src/sites/<slug>/site.json` ([content-model.md](content-model.md)); default wording in `src/copy/defaults.mjs` |
| Change who is on a site | `src/sites/<slug>/people.json` and `images.json` |
| Change routing, the password gate, headers or the CSP | `proxy.ts`, `lib/proxy/` |
| Plug in a content source | `lib/content/` ([below](#plugging-in-your-cms)) |
| Understand a decision | [architecture.md](architecture.md) (decisions table at the end), [nextjs-migration.md](nextjs-migration.md) |

The rules every change follows are in [CLAUDE.md](../CLAUDE.md) (written for coding agents, and just as binding for people): one core for every site, no per-site code branches, no inline styles or scripts, original copy only, and search indexing as an explicit launch switch.

## Architecture tour (10 minutes)

Read these in order; each step is one or two files.

1. **Content is data.** `src/sites/registry.json` lists the sites, old-slug redirects and, optionally, a root site that `/` redirects to (none today: `/` is the landing page). `src/sites/spurs/site.json` is one site: names, branding tokens, wording overrides (`vocab`), page switches, home page slots. `people.json` and `images.json` sit beside it. The shapes are typed in `lib/content/types.ts`.
2. **One seam for every source.** `lib/content/provider.ts` defines `ContentProvider` (registry, sites, legal text) and `PeopleProvider` (people for a site). `lib/content/select.ts` picks the implementation from `CONTENT_PROVIDER` / `PEOPLE_PROVIDER`; `lib/content/index.ts` wraps it in the tagged cache layer (`lib/content/cached.ts`) that the revalidation webhook refreshes.
3. **The build decides which pages exist.** `next.config.ts` reads the content once and builds the routing manifest (`lib/manifest.ts`): slugs, page paths, redirects, domains, image hosts. `lib/render/routes.ts` (`resolvePage`, `allPaths`) is the single definition of which pages a site has.
4. **The proxy runs before the CDN.** `proxy.ts` hands each request to `lib/proxy/decide.ts`, a pure function: host routing for per-site domains, the password gate (`lib/proxy/gate.ts`), redirects, security headers, the CSP (`lib/proxy/csp.ts`), `X-Robots-Tag` and `Cache-Control`. Its unit tests are `test/next/proxy.test.ts`.
5. **Routes are thin.** `app/[site]/layout.tsx` is each site's root layout (language, theme stylesheet, fonts, the tracking slot); `app/[site]/page.tsx` and its siblings load the site through `lib/pages/site-page.ts` and render a page component. Every page is prerendered (`generateStaticParams`, `dynamicParams = false`).
6. **Components are pure.** `lib/render/context.ts` turns a site into a `SiteContext` (merged wording, formats, FAQ, switches, link base, demo flag). `components/site/` renders everything from it: `layout.tsx` (header, footer), `home.tsx` (home sections), `pages.tsx` (inner pages and profile sections), `components.tsx` (cards, badges, the enquiry form), `primitives.tsx` (demo-aware links, photos, breadcrumbs). `components/document.tsx` is the HTML shell.
7. **Client behaviour has two owners.** Partner pages use `components/behaviour.tsx` to start `lib/behaviour.ts` after hydration: menu, roster filters, shortlist, enquiry validation and submit. The hub uses `components/landing-interactions.tsx` for search, mobile navigation and its email-draft form. Both run alongside the Next.js runtime.
8. **SEO is core.** `lib/seo/` writes titles, descriptions, JSON-LD, sitemaps, robots and `llms.txt`, all following the indexing switch (`lib/seo/indexing.ts`).
9. **Three dynamic routes.** `/health`, `POST /api/enquiry` (`lib/enquiry/handler.ts`) and `POST /api/revalidate` (`lib/revalidate/handler.ts`). Everything else is static.
10. **The tests show intent.** `test/next/app.test.ts` builds the app and checks every page on every site through a real server; `test/contract/provider-conformance.ts` is what any content source must pass.

[architecture.md](architecture.md) covers each step in depth: request flow, the gate, core vs site, the content layer, rendering and CSP, SEO, images and performance.

## Component gallery

`/_gallery` lists the sites; `/_gallery/<slug>` renders every shared component in `components/site/` with that site's real content and branding, each with its source file: header and nav, hero and finder, section heads and trust checks, the role list, how booking works, the PepTalk band, the FAQ block, the closing call to action, the help tile, person cards (normal, limited, demo), featured grid, squad, ways-to-book grid, the enquiry form (idle, error and sent), FAQ, profile hero, at a glance, booking card, timeline, profile formats, photo gallery, closing band, footer, a legal excerpt, the consent banner, the beyond panel, breadcrumbs and badges, plus links to every full page. A bar at the top switches between sites.

- **Work against it.** Change a component, reload `/_gallery/<slug>`, then switch sites to see it in other brands. It runs under `npm run dev` without a password.
- **Every component needs an entry.** The entries are in `components/gallery/entries.tsx`. `test/next/gallery.test.ts` fails when a component exported from `components/site/` appears in no entry's `covers`, or when an entry names an export that no longer exists.
- **Never public.** Only the master password (`PREVIEW_PASSWORD`) opens it; a per-site password never does, and a launched site doesn't make it public. With no master password in production (`PREVIEW_PUBLIC=true`) it answers 404, and a site's own domain never serves it. It is always `noindex`, has no canonical URL, never loads tracking, and is left out of sitemaps, `llms.txt` and the integration suite's page and link checks (`lib/gallery.ts`; tests in `test/next/proxy.test.ts`, `test/next/app.test.ts` and `test/next/gallery.test.ts`).
- **Static like the rest.** The pages are prerendered from `app/gallery--internal/`, which the proxy serves at `/_gallery` (a Next.js folder name can't start with `_`, and the `%5F` escape doesn't prerender dynamic segments in Next.js 16.4). Its styles are `public/gallery.css`, loaded only by the gallery, so the CSP needs nothing new.

## Plugging in your CMS

The site never reads storage directly. Everything comes through a `ContentProvider`, and a CMS integration is done when its provider returns the shapes in the content contract and passes the conformance suite. [content-contract.md](content-contract.md) is the full reference.

### The interface and the files to implement

| File | What to do |
|---|---|
| `lib/content/cms-provider.ts` | Implement `createCmsProvider()`: today a stub whose methods reject with "not implemented yet". It is selected with `CONTENT_PROVIDER=cms` (`lib/content/select.ts`). |
| `lib/content/memory-provider.ts` | The smallest complete provider, to copy from: fetch your content, map it to plain objects and hand it to the same publishing helpers |
| `lib/content/provider.ts` | The interface: `getRegistry()`, `listSites()`, `getSite(slug)`, `getRawSite(slug)`, `listRawSites()`, `getLegal(kind)` |
| `lib/content/publish.ts` | `publishedSites()`, `publishable()`, `isActive()`: apply the publishing switches exactly as the JSON provider does. Don't reimplement them. |
| `lib/content/errors.ts` | Throw `ContentError` (`config`, `unavailable`, `unauthorized`, `rate_limited`, `invalid_content`) for every failure; never return an empty result for an outage |
| `lib/content/image-ids.ts` | `imageIdFor(url)`: the image id for a stable CDN URL (host and path) |
| `lib/content/legal.ts` | `parseLegal(kind, markdown)` if your CMS stores Terms and Privacy as markdown with frontmatter |

Rules that matter: every read returns contract-shaped data, `null` for an unknown or switched-off slug, or a `ContentError`. Don't add fetch caching (the tagged cache layer already caches every read). Image URLs must be stable https URLs on an allowed host (`IMAGE_HOSTS_EXTRA` for hosts that may first appear after a deploy).

Any environment variables your provider reads (for example a CMS URL and token) must be added to `.env.example` and the table in [vercel.md](vercel.md#environment-variables): `test/next/env.test.ts` fails otherwise.

### The content contract and schema

The contract is defined once, in TypeScript, in `lib/content/contract/schemas.ts`; the typecheck ties it to `lib/content/types.ts`. `npm run schema` generates JSON Schema (draft 2020-12) into `schema/*.schema.json` and the field reference at the end of [content-contract.md](content-contract.md#field-reference); `npm run check` fails when they are stale. Valid sample payloads are in `schema/examples/`. Use the schema files from any language to validate what your CMS exports.

### Running the conformance suite

```bash
CONTENT_PROVIDER=cms <your CMS variables> npm run contract
```

Add `CONTRACT_FAILING_ENV='{"<VAR>":"<value that breaks the source>"}'` to check that failures surface as typed errors, and `CONTRACT_FETCH_IMAGES=1` to fetch every image once. For CI, add a test that calls `providerConformance()` with your client's `fetch` mocked by a recorded fixture, as `test/contract/providers.test.ts` does for Airtable. Details: [content-contract.md → Conformance suite](content-contract.md#conformance-suite).

### What the CMS needs to model

Field by field in the [field reference](content-contract.md#field-reference); grouped:

| Group | Fields |
|---|---|
| Registry (one record) | `order`, `rootSite` (optional), `redirects`, `indexable` (hub), `domains` |
| Site identity and wording | `slug`, `short`, `orgName`, `platform`, `platformShort`, `tagline`, `entity`, `motto`, `copyright`, `heroTitle`, `waysTitle`, `stadium`, `lang`, `orgType`; `vocab` (about 50 optional wording keys, defaults in `src/copy/defaults.mjs`), `formats` (overrides of the seven booking formats), `faqOverrides` |
| Branding | `theme` (colours and display font stack), `style` (button and heading tokens), `marks` (crest, wordmark), `navMark`, `crestOnLight`, `crestOn`, `crestFallback`, `cspHosts` |
| Switches | `active` (site), `pages` (`waysToBook`, `hospitality`, `about`), per-person `active`, `demoHome`, `demoProfiles`, `indexable` (the launch switch), `status: "shell"`, `homeLayout` (`waysAfterRoles`, `hideEras`), `tracking`, `consent` |
| Event Spaces | `eventSpaces`: heading, copy, image id, imageAlt, buttonText, partner HTTPS url; hidden without url; [configuration](content-model.md#event-spaces) |
| Home page | `featured`, `home` (hero and inset slots, era, story and hospitality images, active era), `roles`, `eras` |
| People | every `Person` field ([content-model.md → people.json](content-model.md#peoplejson)) and the site's `images` map (id → https URL) |
| Legal | `terms` and `privacy`: `title`, `lastUpdated`, markdown `body`, `meta` |
| Bookkeeping (raw sites only) | `licences` and `verification` ([below](#what-exists-that-the-cms-may-replace)) |

Every object rejects unknown keys, and content rules that span fields (a person's role and era exist on the site, featured people are published, mark hosts are in `cspHosts`, no review notes) live in `scripts/validate-content.mjs`; the conformance suite runs both.

### The revalidation webhook

Pages stay static; a CMS edit refreshes them through `POST /api/revalidate` without a deploy:

```bash
curl -X POST https://<host>/api/revalidate \
  -H "x-revalidate-secret: $REVALIDATE_SECRET" -H 'content-type: application/json' \
  -d '{"site":"spurs"}'
```

Send `{ "site": "<slug>" }` when a site or any of its people changes, `{ "site": "<slug>", "person": "<slug>" }` for one profile, `{ "tags": ["legal"] }` for Terms or Privacy, `{ "tags": ["registry", "sites"] }` for site order or redirects. It answers on any host, outside the password gate, and needs `REVALIDATE_SECRET` set (otherwise `503`). New sites, new people, renamed slugs, domain changes and new image hosts need a deploy instead: trigger one with a Vercel Deploy Hook. Full reference: [content-contract.md → Revalidation](content-contract.md#revalidation).

## Switching on Airtable

People (profiles, stats, photos) can come from one Airtable table while everything else stays with the content provider (the JSON files today, or your CMS). It is built and tested against fixtures and stays off until `PEOPLE_PROVIDER=airtable`. In short:

1. Shape one table, one row per person per site; map fields by field ID (renaming a column changes nothing).
2. Create a read-only personal access token for that one base (`AIRTABLE_TOKEN`).
3. Copy `config/airtable.example.json`, fill in the base, table and field IDs, the site mapping, the publishing gate and the R2 image hosts; supply it as `AIRTABLE_CONFIG` on Vercel.
4. Dry-run an export offline: `npm run airtable:dry-run -- --file export.csv --site spurs`.
5. Run `npm run contract` against the real base, then deploy with `PEOPLE_PROVIDER=airtable`, `IMAGE_HOSTS_EXTRA` and `REVALIDATE_SECRET`.
6. Add an Airtable automation that calls the revalidation webhook when a record changes.

The sync validates every record, skips and reports bad ones, and fails closed past a threshold. Step by step: [airtable-cms.md](airtable-cms.md).

## First deploy to Vercel

The existing project is already deployed at `https://peptalk-appearances.vercel.app`. For a handover, verify these settings in that project; import only when creating a replacement. `npm run check` covers the local checks; CI also runs an explicit production build and the separate `perf` budget job.

1. Verify the existing project uses this repository, `main`, and the detected Next.js preset and defaults. Import only for a replacement project. No `vercel.json` is needed.
2. Before the first build, set `PREVIEW_PASSWORD` (Production and Preview) and `PUBLIC_ORIGIN` (Production; it is read at build time), and turn on **Enable access to System Environment Variables**. Leave the enquiry, tracking, Airtable and revalidation variables unset for now.
3. Deploy, then check the `*.vercel.app` URL: `/health` shows the commit, `/spurs` asks for the password, a per-site password opens only its site (and on `/` is sent to it), `/` and `/_gallery` need the master password, and responses carry the CSP and `X-Robots-Tag: noindex, nofollow`.
4. Open a PR and check its preview asks for the password (a `503` means `PREVIEW_PASSWORD` is missing from the Preview scope).

Every setting, every environment variable (build time or runtime, which environments) and the full checklist: [vercel.md](vercel.md). Releasing, rollback and moving the live demo's hostname: [deployment.md](deployment.md).

## Domains, launch and indexing

Everything is behind the password and `noindex` today. Two independent steps take a site public, both per site and both reversible.

**Own domain** (optional; [domains.md](domains.md#pointing-a-domain-runbook-per-site)):

- [ ] Agree the domain name with the partner; PepTalk registers and owns it.
- [ ] Add the domain (and its `www`) in Vercel → Settings → Domains; create exactly the DNS records the domain card shows; wait for the certificate.
- [ ] Add it to `registry.json → domains` with `"live": false`, deploy, and check the site answers on the domain behind its password, aliases `301`, and canonical URLs still point at the hub.
- [ ] Set `"live": true` and deploy: the hub folder now `301`s to the domain, which becomes canonical.

**Launch** ([brand-and-legal.md → Launch SEO checklist](brand-and-legal.md#launch-seo-checklist)):

- [ ] Everything in [brand-and-legal.md → What is placeholder today](brand-and-legal.md#what-is-placeholder-today) resolved for the site: licensed photos and marks, written agreement and consent, real testimonials, reviewed Terms and Privacy.
- [ ] `PUBLIC_ORIGIN` set in Production; demo flags removed; not a shell site.
- [ ] `npm run validate -- --strict` passes (every asset licensed, every page and profile verified).
- [ ] `site.json → "indexable": true`, deploy to production, then check robots meta, `robots.txt`, the sitemap and that other sites still ask for a password.
- [ ] Verify the property in Google Search Console and Bing Webmaster Tools, submit the sitemap, validate rich results.

To undo: `"indexable": false`, or `SEARCH_INDEXING=off` in Vercel for every site at once, then redeploy. How each switch behaves: [content-model.md → Indexing](content-model.md#indexing-the-launch-switch).

## What exists that the CMS may replace

The repository grew its own editorial tooling around the JSON files. A CMS can take over any of it; some of it encodes requirements your CMS should keep.

| Tool | What it does today | With a CMS |
|---|---|---|
| **Admin** (`src/admin/`, `npm run admin`; [admin.md](admin.md)) | A local, loopback-only web app that edits `src/sites/` through forms, validates before every save, previews pages with the app's own components, and can save to a GitHub branch and PR | Replaceable. Keep its requirements: validate with the content rules before publishing, preview before publishing, and never expose an editing surface on the public site. |
| **Site packs** (`src/sites/packs.mjs`; [site-packs.md](site-packs.md)) | A whole site as one zip, produced by the site tools or the skill and imported in the admin, inactive | Replaceable by your CMS's own import. Keep: new sites arrive unpublished and are reviewed before going live. |
| **Licences** (`licences.json`, admin Licences tab) | One approval per photo and mark, tied to the exact URL approved; a changed URL needs re-approval. `npm run validate -- --strict-licences` is the launch gate. | **Keep as a requirement.** The raw-site shape includes `licences`, and the gate's logic is pure (`licenceStatus()` in `src/sites/licences.mjs`). Note that `npm run validate` reads the JSON files: with a CMS, run the same functions over your provider's `listRawSites()` instead. |
| **Verification** (`verification.json`, admin Verification tab) | A checklist per built page and profile, stamped with a fingerprint of the content it confirmed; editing that content marks it "changed". `--strict-verification` (or `--strict`) is the launch gate. | **Keep as a requirement**: a launch needs every page and profile checked, and an edit after sign-off must re-open it. Model it in the CMS or keep using `src/sites/verification.mjs` (`verificationStatus()`, fingerprints) over provider data. |
| **`/new-appearances-site` skill** (`.claude/commands/new-appearances-site.md`) | An agent workflow that builds a shell or populated site (brand research, people, Getty comps), validates it and opens a PR or produces a site pack | Optional. Its brief ([research-brief.md](research-brief.md)) and content rules still apply to anything written into the CMS: original copy, no quotes, stable facts, identifiable photos. |
| **Site tools** (`npm run new-site`, `assemble-site`, `pack-site`, `import-pack`; `src/sites/scaffold.mjs`, `store.mjs`) | Write sites into `src/sites/` in the canonical JSON format | Replaceable; or keep them to seed the CMS from JSON. |

Whatever you replace, keep `scripts/validate-content.mjs` as the rule book: the conformance suite and the Airtable sync already run it on provider output.

## Open decisions and known limitations

Gathered from every doc; each links to the detail.

**Open decisions**

- **Moving the live demo.** `appearances.getapeptalk.com` is still served by PepTalk's previous hosting, not this repository, until the switch in [deployment.md](deployment.md#switching-the-demo-over-to-vercel).
- **`/health` without a master password** answers `503` today. Decide whether it should keep doing that once Vercel deploy checks are set up ([deployment.md](deployment.md#switching-the-demo-over-to-vercel)).
- **The CMS provider** is a stub ([above](#plugging-in-your-cms)).
- **Where enquiries go.** The hub prepares a draft to `hello@getapeptalk.com`, which visitors must send themselves; it has no delivery backend. Partner-site forms use the endpoint, which forwards to `ENQUIRY_WEBHOOK_URL`, which is unset by default. Confirm whether the target environment has a receiver configured before submitting; a production receiver, a Vercel Firewall rate-limit rule and reviewed privacy wording are launch requirements ([vercel.md → Enquiry webhook](vercel.md#enquiry-webhook)).
- **Tracking and consent.** No site has tags. The consent banner's wording, the cookie lifetime and which sites need consent are placeholders for legal review ([architecture.md → Tracking and consent](architecture.md#tracking-and-consent)). Vercel Speed Insights and Web Analytics aren't installed, for the same Trusted Types reason ([vercel.md](vercel.md#speed-insights-and-web-analytics)).
- **Domains:** naming with each partner, whether the hub stays the home of the landing page, and partner subdomains ([domains.md → Open questions](domains.md#open-questions)).
- **Naming conflicts** with organisations' own "Legends" programmes need sign-off before launch ([brand-and-legal.md](brand-and-legal.md#rules-that-apply-now)).

**Known limitations**

- **Placeholder content:** Getty watermarked comps and hotlinked partner marks (you need internet access to see photos), placeholder testimonials, event stories, metrics and legal text, and no licence approvals or verification checks yet ([brand-and-legal.md](brand-and-legal.md#what-is-placeholder-today)).
- **Fixed per build:** which pages exist, redirects, domains and image hosts. New sites or people, renamed slugs, domain changes and new image hosts need a deploy ([content-contract.md → What still needs a deploy](content-contract.md#what-still-needs-a-deploy)).
- **`"immediate": true` revalidation** gives up the last-good-page fallback: while the source is down, visitors get a 500 ([content-contract.md](content-contract.md#tags)).
- **The launch gate reads JSON.** `npm run validate -- --strict` and the admin work on `src/sites/`, not on a CMS ([above](#what-exists-that-the-cms-may-replace)).
- **The CSP allows inline scripts** (`'unsafe-inline'` with Trusted Types and SRI), which is safe only while no page renders request data or user content; such a page would need a nonce policy and dynamic rendering ([architecture.md → Rendering and CSP](architecture.md#rendering-and-csp)). GTM features that need `eval` or custom HTML won't run.
- **No rate limit on the password gate**; the enquiry and revalidation endpoints have light per-instance limits only ([deployment.md → Operational notes](deployment.md#operational-notes)).
- **Link previews** (Slack, WhatsApp) only render for public sites: crawlers get `401` like everyone else.
- **The admin** is a local tool: in GitHub mode it reads your checkout plus its own session's saves, and there's no login lockout ([admin.md → Known limitations](admin.md#known-limitations)). Its preview compiles components with an internal Next.js entry point, which an upgrade may move ([admin.md → Preview](admin.md#preview)).
- **The visual baseline isn't committed**: capture it on `main` with `npm run visual -- --update` before comparing ([architecture.md → Visual regression check](architecture.md#visual-regression-check)).
- **Self-hosting:** `next start -H <ip>` can't serve the proxy's 404 rewrite; Vercel and plain `next start` can ([nextjs-migration.md](nextjs-migration.md#proxy-formerly-middleware)).
- **Image widths** stop at 640 px because Getty comps are small; revisit `images.deviceSizes` in `next.config.ts` when licensed originals arrive ([architecture.md → Images](architecture.md#images)).
- **The gallery** shows components side by side, so one page holds several `h1`s and forms; it is a developer tool, not a page to audit.

## Glossary

| Term | Meaning |
|---|---|
| **PepTalk Appearances** | The product: every site plus the hub, from this one codebase |
| **Organisation** | The club, league, association or championship a site is for (`orgName`, e.g. "Tottenham Hotspur") |
| **Site** | One organisation's branded booking site: `src/sites/<slug>/`, served at `/<slug>` on the hub and optionally on its own domain |
| **Slug** | A site's (or person's) URL segment: lowercase letters, digits and single hyphens (`spurs`, `man-utd`) |
| **Platform** | A site's public name (`site.json → platform`, e.g. "Spurs Speaker Network") |
| **Hub** | `appearances.getapeptalk.com` (`HUB_HOST`): PepTalk's own pages (the landing page at `/`, `/terms`, `/privacy`) and a folder per site. Any host that isn't a site's domain (previews, localhost) behaves as the hub. |
| **Root site** | Optional: where `/` on the hub redirects (`registry.json → rootSite`). Without one (the default), `/` is the landing page and `/all` answers `301` to it |
| **Person** | Anyone in a site's `people.json` |
| **Legend** | A person whose role isn't `squad`: former players, managers, staff, the women's game |
| **Current player** | A person with role `squad` (always `limited`) |
| **Core** | Everything shared by every site: structure, components, form, `<head>`, behaviour, security. Sites differ only in content, branding and wording ([architecture.md → Core vs site](architecture.md#core-vs-site)). |
| **Wording** | `site.json → vocab`, the per-site overrides of the default copy in `src/copy/defaults.mjs` |
| **Shell site** | A first-look site with real branding and placeholder people (`status: "shell"`); a **populated** site has researched people |
| **Demo page** | A look-only page (`demoHome`, `demoProfiles`): no links, forms or controls |
| **Master password / site password** | `PREVIEW_PASSWORD` opens everything; `PREVIEW_PASSWORD_<SLUG>` opens one site only |
| **Indexable / launched** | `site.json → indexable: true`: the site is public and may be indexed. Off by default. |
| **Domain mount** | The second prerendered copy of a site (`/<slug>--domain/…`) the proxy serves on its own domain, with links that have no slug prefix |
| **Content provider / people provider** | The implementations behind `lib/content/provider.ts`: JSON (default), in-memory, CMS (stub); Airtable for people |
| **Content contract** | The shapes every provider returns, generated as JSON Schema in `schema/` |
| **Conformance suite** | `test/contract/provider-conformance.ts`: what any provider must pass |
| **Revalidation** | Refreshing prerendered pages by cache tag through `POST /api/revalidate`, without a deploy |
| **Manifest** | The routing facts computed at build time (`lib/manifest.ts`): slugs, page paths, redirects, domains, image hosts |
| **Site pack** | A whole site in one zip (`<slug>.site-pack.zip`), imported in the admin |
| **Licence approval / verification check** | The per-asset and per-page launch bookkeeping in `licences.json` and `verification.json` |
| **Component gallery** | `/_gallery`: every shared component in each site's branding, for developers |
