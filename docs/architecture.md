# Architecture

## Goals

- **One codebase, many branded sites.** A new organisation is data (JSON), not code.
- **Cheap and safe to host.** Every page is prerendered at build time and served from Vercel's CDN. There is no database, and the only code that runs per request is the proxy (host routing, gate, redirects, headers), the health endpoint, the enquiry endpoint and the revalidation webhook. Next.js also runs the image optimizer on demand and regenerates pages after revalidation. Content from a CMS or Airtable refreshes through on-demand revalidation, not per-request rendering ([Content layer](#content-layer)).
- **Private by default.** One organisation must never see another's site, so every site sits behind an HTTP Basic password, with optional per-site passwords, until it launches.

The app is Next.js 16 (App Router, React Server Components) on Vercel. [nextjs-migration.md](nextjs-migration.md) records how it replaced the original static generator, and the decisions taken on the way.

## Modules

| Path | Responsibility |
|---|---|
| `app/` | Routes: one root layout per site (`app/[site]/layout.tsx`), the hub (`app/(landing)`, the landing page at `/`; `app/(hub)`, the hub legal pages; `app/all/sitemap.xml`), the 404 page (`app/global-not-found.tsx`), theme stylesheets (`app/[site]/site.css`, `app/landing.css`), crawler files (`robots.ts`, `sitemap.xml`, `llms.txt`, and `app/[site]/robots.txt` for a site's own domain), `/health`, `POST /api/enquiry`, `POST /api/revalidate` and the component gallery (`app/gallery--internal/`, served at `/_gallery`). Every page is prerendered (`generateStaticParams`, `dynamicParams = false`); the `[site]` segment is a slug or `<slug>--domain`, the copy served on the site's own domain ([Per-site domains](#per-site-domains)). |
| `components/` | The shared React Server Components every site renders with: `document.tsx` (the HTML shell), `site/` (layout, home and its sections, inner pages and profile sections, cards, badges, the enquiry form, demo-aware primitives), `landing.tsx` (the landing page, the 404 page, hub legal pages), `behaviour.tsx` (site client behaviour), `landing-interactions.tsx` (hub search, mobile navigation and email draft form), and `gallery/` (the component gallery). |
| `lib/gallery.ts`, `components/gallery/`, `public/gallery.css` | The component gallery: `/_gallery` and `/_gallery/<slug>`, every component in `components/site/` in each site's branding; master password only, never indexed ([Component gallery](#component-gallery)) |
| `lib/content/` | Content layer ([below](#content-layer)): types, the `ContentProvider` interface, the JSON, in-memory and CMS (stub) providers, the Airtable people sync (`airtable/`, `airtable-provider.ts`), provider selection (`select.ts`), the publishing switches (`publish.ts`), typed errors, cache tags and the tagged read layer (`cached.ts`, `index.ts`), and the content contract (`contract/`). |
| `lib/revalidate/`, `app/api/revalidate/` | `POST /api/revalidate`: secret-authenticated, rate-limited on-demand revalidation by cache tag ([content-contract.md → Revalidation](content-contract.md#revalidation)) |
| `schema/`, `config/` | The generated JSON Schema files and examples; the Airtable sync config example |
| `lib/render/` | Render helpers: per-site context (merged wording, FAQ, switches, demo flag), `routes.ts` (`resolvePage()` / `allPaths()`: the single definition of which pages exist), theme CSS, images, alt text, entity decoding, the safe markdown renderer. |
| `lib/pages/` | Metadata API helpers (title, description, canonical, Open Graph, robots) and per-route glue. |
| `lib/seo/` | Titles and descriptions, JSON-LD, sitemaps and llms.txt, the indexing switch ([SEO and AEO](#seo-and-aeo)). |
| `lib/proxy/`, `proxy.ts` | The proxy: `decide()` (pure, unit-tested: host routing, the gate, redirects, headers), the password gate and the CSP. `proxy.ts` turns a decision into a response. |
| `lib/manifest.ts`, `next.config.ts` | The build-time manifest the proxy needs (root site, redirects, slugs, page paths, image hosts, Open Graph cards, domains, the hub host, sites with tracking), computed from content and inlined at build. |
| `lib/origin.ts` | The hub's canonical origin, fixed at build time: `PUBLIC_ORIGIN`, else the Vercel production hostname (never a partner domain), else the hub. |
| `lib/domains.ts` | Per-site domains: validation, host parsing, the hub host, mounts (`<slug>--domain`) and canonical URLs ([domains.md](domains.md)) |
| `lib/enquiry/` | The enquiry endpoint: the form's fields and rules (`fields.ts`, shared with the form), forwarding config (`config.ts`) and the handler (`handler.ts`) ([Enquiry form](#enquiry-form)) |
| `lib/tracking.ts` | The tracking slot: id patterns, the `TRACKING_GTM_ID` fallback, consent, the CSP hosts and the Trusted Types allowlist ([Tracking and consent](#tracking-and-consent)) |
| `lib/behaviour.ts` | Client behaviour: menu, roster filters held in the URL, shortlist, enquiry validation. |
| `src/sites/<slug>/`, `src/sites/registry.json` | The content (JSON), see [content-model.md](content-model.md) |
| `src/copy/defaults.mjs`, `src/copy/legal/` | Default wording, the seven booking formats, the FAQ; Terms and Privacy (markdown, shared by every site) |
| `src/sites/index.mjs` | The loader the admin, the validator and the site tools use. `test/next/content.test.ts` asserts it publishes exactly what the JSON provider publishes. |
| `src/sites/store.mjs` | Turns content back into files in the canonical JSON format and writes them. Used by the site tools and the admin. |
| `src/sites/scaffold.mjs` | Builds new site content: `shellSite()` (placeholders) and `assembleSite()` (from research output). Never touches disk. |
| `src/sites/licences.mjs`, `src/sites/verification.mjs` | Licence approvals and verification checklists ([admin.md](admin.md)) |
| `src/sites/zip.mjs`, `src/sites/packs.mjs` | Site packs ([site-packs.md](site-packs.md)): a strict, dependency-free zip reader/writer on `node:zlib`, and `buildPack` / `readPack` / `packFiles` / `prepareImport` |
| `scripts/validate-content.mjs` | `validateSite()` and `validateRegistry()`: the content rules. Run by CI, the site tools, the admin before every save, the Airtable sync on every record, and the conformance suite. |
| `scripts/schema.mjs`, `scripts/airtable-dry-run.mjs` | `npm run schema` (generate or `--check` the contract files); `npm run airtable:dry-run` (map an Airtable export offline) |
| `scripts/check-doc-links.mjs` | `npm run docs:links`: every relative link and anchor in the markdown resolves (part of `npm run check` and CI) |
| `scripts/new-site.mjs`, `scripts/assemble-site.mjs` | Thin CLIs over `scaffold.mjs` and `store.mjs`; `--pack` writes a site pack instead |
| `scripts/pack-site.mjs`, `scripts/import-pack.mjs` | Pack an existing site; import a pack (the CLI twin of the admin upload) |
| `scripts/og-cards.mjs` | Renders the Open Graph cards into `public/og/` from its own card templates (headless Chrome). Pages without a card of their own use `appearances.jpg`. |
| `scripts/visual.mjs`, `scripts/perf.mjs`, `scripts/perf-load.mjs` | Visual regression check ([below](#visual-regression-check)), page-load metrics with budgets (`scripts/perf-budgets.json`, `scripts/lib/perf-budget.mjs`) and server throughput ([Performance](#performance)) |
| `src/admin/` | The local content admin (`npm run admin`), see [admin.md](admin.md). Not deployed. Its preview renders with the app's components (`src/admin/next-render/`). |
| `public/` | The shared stylesheet, fonts, PepTalk assets, Open Graph cards, `tracking.js` (the tracking slot's loader, served only to sites with tags) and `gallery.css` (the component gallery's own styles) |

## Request flow

Every request except hashed framework assets (`/_next/static`) passes through the proxy (`proxy.ts` → `lib/proxy/decide.ts`), which runs before Vercel's CDN cache:

1. Only `GET` and `HEAD` are allowed (`405` otherwise), with two POST-only exceptions. `POST /api/enquiry` goes through the gate below (the hub's, or the domain's own). `POST /api/revalidate` skips the password gate on every host (the hub, previews, each site's domain and its aliases, which don't `301` it) and is authenticated by `REVALIDATE_SECRET` in the route itself; it still fails closed with the rest of production, and is `no-store` and `noindex`.
2. In production without a master password, everything answers `503` (fail closed), unless `PREVIEW_PUBLIC=true`.
3. A site's alias host (`registry.json → domains`) answers `301` to its primary, keeping path and query.
4. `/health` answers before auth (status and commit SHA only).
5. **On a site's own domain:** that site's pages and files are rewritten to its domain mount (`/legends` → `/<slug>--domain/legends`); shared assets pass as they are; `/` is the site's home, never the landing page; anything else (`/all`, other sites) is a 404. The gate opens with the master or that site's password. See [Per-site domains](#per-site-domains).
6. **On the hub and any other host:** `/` is the landing page and `/all` answers `301` to `/` (query kept); with `registry.json → rootSite` set, `/` redirects (`302`) to that site instead and `/all` is rewritten to the landing route. Old slugs (`registry.json → redirects`) answer `301`, for pages and Open Graph cards, keeping the query string; on the hub host, a live site's folder answers `301` to its domain. The component gallery (`/_gallery…`) needs the master password and is rewritten to its internal route (a 404 in production without a master password). Then the password gate runs (see below); on the landing page, a valid site password redirects (`302`) to that site instead of a `401`. Open Graph card images are exempt so their URLs work in previews of public sites.
7. A page-shaped path that isn't a known page (from the build manifest) is rewritten to the server-rendered 404 page; so is any domain mount, or the gallery's internal route, requested directly.
8. Response headers are added: security headers, the static CSP (scripts and styles from self; images from Getty and each site's mark hosts; Google's tag hosts only for a site with tracking), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Robots-Tag: noindex, nofollow` unless the path belongs to an indexable site on its canonical host, and `Cache-Control` (`private` when a password was needed).

Then the CDN serves the prerendered page. Pages never see the request: canonical origins are fixed at build time, and only the proxy reads `Host`, to pick the site and mount (`X-Forwarded-Host` is never read), so a client cannot make pages advertise another domain. The enquiry endpoint gets one request header from the proxy (the domain's site, always set or removed there).

## Password gate

- No passwords configured: open (local development and tests).
- `PREVIEW_PASSWORD` (master): opens everything.
- `PREVIEW_PASSWORD_<SLUG>`: opens only `/<slug>/…`, that site's stylesheet and shared assets (`/styles.css`, `/tracking.js`, fonts, PepTalk images, crawler files, the image optimizer, the hub legal pages, the enquiry endpoint). It cannot open another site or the landing page (`/`, or `/all` with a root site), which lists every site. A visitor who sends a site password to the landing page is redirected (`302`, `no-store`) to that site's home (its live domain on the hub host); see [Decisions](#decisions).
- On a site's own domain, everything on the host belongs to that site: the master or that site's password opens it, and no other site's password opens anything there (shared assets included).
- A launched site (`site.json → indexable: true`) needs no password; every other site keeps its gate.
- The component gallery (`/_gallery`) opens only with the master password, whatever is launched, and only on the hub and preview hosts.
- Comparison is constant-time on SHA-256 digests (Web Crypto). Details: [nextjs-migration.md → Proxy](nextjs-migration.md#proxy-formerly-middleware).

Link previews (WhatsApp, Slack, LinkedIn) only render while a site is public: crawlers get `401` like everyone else. That is intentional.

## Core vs site

All sites share one architecture. They differ in **content** and **branding**, never in **structure**. A change to the core (the enquiry form, a tracking tag, `<head>` metadata, a page section, a security header) is made once and reaches every site on the next deploy. That is the main reason this codebase exists, so protect it.

### What is core

Edit core code once; never copy it per site.

| Concern | Owner |
|---|---|
| Page structure, sections and their order | `components/site/home.tsx`, `pages.tsx`, `layout.tsx` |
| Shared components: cards, enquiry form, ways-to-book grid, "beyond" panel | `components/site/components.tsx` |
| `<head>`: title, meta, canonical, Open Graph, JSON-LD, and any analytics or tag-manager snippet | `components/document.tsx`, `lib/pages/metadata.ts`, `lib/seo/` |
| Behaviour (filters, shortlist, form validation and submission) | `lib/behaviour.ts`, `components/behaviour.tsx` |
| Base styles and layout | `public/styles.css` |
| Default wording, booking formats, FAQ | `src/copy/defaults.mjs` |
| Security headers, CSP, password gate, redirects | `lib/proxy/` |
| Which pages exist and how switches apply | `lib/render/routes.ts`, `lib/content/publish.ts` |

### What a site may vary

Only these fields in `src/sites/<slug>/*.json` can vary per site. [content-model.md](content-model.md) has the details.

| Kind | Fields |
|---|---|
| Content | people, featured, hero and inset, images |
| Branding | `theme` (colours, display font stack), `marks`, `navMark`, `crestOn` / `crestOnLight`, `style` tokens (button shape and case, heading case, card radius) |
| Wording | `vocab` (any `VOCAB` key), `formats`, `faqOverrides` |
| Layout options | `homeLayout` flags (`waysAfterRoles`, `hideEras`) |
| Publishing | `active`, `pages`, per-person `active`, `demoHome` / `demoProfiles`, `indexable`, `lang` |
| Tags | `tracking` (`gtmId`, `ga4Id`), `consent.required`; and the site's domain in `registry.json → domains` |

The validator rejects any unknown key, so a site cannot quietly gain behaviour the others don't have.

### Rules

1. **No site checks in code.** Never write `if (site.slug === 'spurs')`, or branch on a specific organisation, anywhere in `app/`, `components/`, `lib/`, `src/`, `public/` or `scripts/`. If one site needs something different, add a setting.
2. **Adding a setting:** when a site genuinely needs to differ, add a named, typed setting that every site *could* use.
   - Add a default that keeps current output, so other sites don't change.
   - Validate it in `scripts/validate-content.mjs`, with a negative case in `test/content.test.mjs`, and add it to `lib/content/types.ts`.
   - Document it in [content-model.md](content-model.md).
   - Expose it in the admin if editors need it.

   Example: per-site analytics ids are `site.json → tracking: { gtmId, ga4Id }`, validated against strict patterns and read by the one shared tracking slot in `components/document.tsx` ([Tracking and consent](#tracking-and-consent)). Never write a separate snippet per site.
3. **Branding is tokens, not CSS.** A site's look comes from `theme` and `style` values, emitted as CSS custom properties by `lib/render/theme.ts`. Per-site CSS rules beyond those tokens (and the crest treatment) are a sign that something should be a token or a shared style.
4. **Third-party scripts go through the core.** Tracking and tag managers are added once (`components/document.tsx` → `public/tracking.js`), with their hosts added to the CSP in `lib/proxy/csp.ts` only for sites that use them, and consent handled there too. Use external files, not inline scripts of our own (see [Rendering and CSP](#rendering-and-csp)).
5. **Check the blast radius.** After a core change, `npm test` checks every page of every site (status, headers, links, headings, structured data, metadata), and `npm run visual` shows which pages look different. That list should match what you meant to change, on all sites.

### Rolling out a core change

1. Capture a visual baseline on `main` (`npm run visual -- --update`).
2. Make the change in the core module from the table above, on your branch.
3. Run `npm run check`, then `npm run visual` to compare with the baseline.
4. Look at each site (this repository has one, `spurs`; the gallery tests render the fictional sites too) at desktop and mobile width (`npm run dev`): `/_gallery/<slug>` shows every component for one site, and its bar switches between sites.
5. Say in the PR which page types changed, and that the change applies to all sites.

## Per-site domains

Any site can also be served at the root of its own domain, as data: `registry.json → domains: { <slug>: { primary, aliases, live } }`. [domains.md](domains.md) has the model, the per-host behaviour and the runbook; in short:

- **A domain mount per site, prerendered.** Pages are static, so a page can't learn its host. A site with a domain gets a second prerendered copy of every page through the same routes: the `[site]` segment `<slug>--domain`, whose `SiteContext.base` is `''`, so its links have no slug prefix. The proxy rewrites the site's host to it (`lib/domains.ts`, `lib/pages/site-page.ts`).
- **Canonical copy.** Until `live`, the hub folder is canonical and the domain copy is `noindex`; once `live`, the domain is canonical everywhere (canonical, Open Graph, JSON-LD, sitemap, llms.txt, `SiteContext.url()`), the folder answers `301` on the hub host, and the folder copy is `noindex`.
- **Hosts.** A site's domain shows that site only; aliases `301`; the hub host (`HUB_HOST`) is the hub; any other host (Vercel previews and deployment URLs, localhost) behaves as the hub without the `301`, so previews show every site.

## Hub discovery and email enquiries

`components/landing.tsx` owns the hub composition; `src/copy/landing.mjs` owns curated picks and focal presets. Its client module, `components/landing-interactions.tsx`, receives raw card image URLs and generates optimized attributes only for rendered results. Search is local to the published catalogue; no new endpoint or datastore is introduced.

The hub form prepares an encoded `mailto:hello@getapeptalk.com` draft after browser validation. Visitors explicitly open and send it from their email app. The page does not claim submission or delivery, and retains edits only in React state for the current session. JavaScript-disabled visitors get a direct email link. Long briefs use a copyable full-text fallback and a short email link to avoid URL-handler truncation. This is separate from the site-specific forwarding endpoint below.

## Enquiry form

Partner-site forms post to `POST /api/enquiry` (`app/api/enquiry/route.ts` → `lib/enquiry/handler.ts`), one of the dynamic routes besides `/health` (the other is `POST /api/revalidate`, [Content layer](#content-layer)):

- **Progressive enhancement.** Without JavaScript, the browser validates the fields (`required`, `type=email`, `maxlength`), posts, and the endpoint answers `303` back to the form with `#enquiry-sent`, `#enquiry-error` or `#enquiry-failed`; CSS `:target` shows that state (the thank-you state replaces the fields, as the script's confirmation does). Pages stay static: the state lives in the fragment, not the HTML. With JavaScript, the behaviour script validates as before; when forwarding is on it posts the form with `fetch` and shows the confirmation or an error; when it is off it shows the concept confirmation without sending anything, exactly as before.
- **Forwarding.** With `ENQUIRY_WEBHOOK_URL`, a normalised JSON payload (site, person of interest, fields, timestamp, page URL) goes there with `ENQUIRY_WEBHOOK_SECRET` in `X-Enquiry-Secret`. Without it, the endpoint checks and discards: nothing is sent or stored. Payload and operations: [vercel.md → Enquiry webhook](vercel.md#enquiry-webhook).
- **Checks.** The server checks what the form asks for (`lib/enquiry/fields.ts`, shared with the form: required fields, email, date, lengths, the site's own options and people), plus a honeypot, a minimum of 3 s to submit (when the script ran), a 16 KB limit, form encoding only, same-origin `Origin`, the site's password gate, on a domain only that site's form, and a light per-instance rate limit.
- **Logs.** One line per request with the event, the site slug and the outcome. Never personal data, IPs, the webhook URL or the secret.
- **CSP.** Unchanged: `form-action 'self'` and `connect-src 'self'` cover the same-origin endpoint.

## Tracking and consent

Off by default everywhere; nothing renders and the CSP is unchanged until a site has tags.

- **Configuration.** `site.json → tracking: { gtmId?, ga4Id? }` (strict patterns: `GTM-XXXXXXX`, `G-XXXXXXXXXX`), else the global `TRACKING_GTM_ID` fallback (site pages only; the hub has none). `site.json → consent.required` (default `false`) makes tags wait for consent.
- **One shared slot.** For a site with tags, `components/document.tsx` adds one external script to `<head>`: `<script src="/tracking.js?v=<hash>" defer data-gtm-id data-ga4-id data-consent>` (`public/tracking.js`). It pushes the GTM start event or the GA4 config to `dataLayer` and adds the loader (`https://www.googletagmanager.com/gtm.js` or `/gtag/js`) with DOM calls. No inline script of our own, and no bytes at all on pages without tags. **Decision:** a plain file, not a client component, because Next.js ships every client component a root layout imports in every page's bundle, rendered or not (measured: +2 KB of JS on every page), and "off by default" should cost nothing.
- **Consent.** With `consent.required`, nothing loads until the visitor accepts in a small, fixed, keyboard-accessible banner (`aside` with a label, two equal native buttons, built with DOM calls). The choice is a first-party `pa_consent=granted|denied` cookie (six months, `SameSite=Lax`, `Secure` on https), holding no identifier. No banner and no tags without JavaScript. **The banner wording, the cookie lifetime and which sites need consent are placeholders for legal review** (UK GDPR / PECR for analytics cookies) before tracking is switched on for any site.
- **CSP and Trusted Types.** For a site with tags only, the proxy adds Google's hosts (script-src `https://www.googletagmanager.com`; img-src and connect-src per [Google's CSP guide](https://developers.google.com/tag-platform/security/guides/csp)) and replaces `trusted-types 'none'` with `trusted-types default`. Loading a script by URL is a Trusted Types sink, so the slot creates the `default` policy, which turns a string into a script URL only on `https://www.googletagmanager.com` and never into HTML or script ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API): a default policy returning `null` makes the sink throw). GTM features that need `eval` (custom JavaScript variables) or inline custom HTML tags won't run under this CSP; GA4 and standard GTM tags do. Check a preview in a browser before switching tags on.

## Content layer

Components never read storage. They get published sites and legal text from `content()` (`lib/content/index.ts`):

```
CONTENT_PROVIDER=json|cms ──┐
                            ├─ select.ts: selectProvider() ── withPeople() ── cached.ts: tagged reads ── pages
PEOPLE_PROVIDER=json|airtable┘                                                  (unstable_cache + tags)
```

- **Contract.** Every provider returns the shapes in [content-contract.md](content-contract.md): JSON Schema generated from one definition (`lib/content/contract/schemas.ts`) that the typecheck ties to `types.ts`. Each read either returns data, returns `null` for an unknown or switched-off slug, or throws a typed `ContentError`. `test/contract/provider-conformance.ts` checks any provider against all of that, and runs in `npm test` against the JSON provider, the in-memory provider fed from `schema/examples`, and the Airtable sync on fixtures.
- **Providers.** JSON (`src/sites/`, the default), in-memory (`memory-provider.ts`: snapshots, fixtures, and the reference for a CMS), CMS (a stub that the crediblecreators.com developer implements), and the Airtable people sync (`PEOPLE_PROVIDER=airtable`, per site, fail-closed; [airtable-cms.md](airtable-cms.md)).
- **Static pages with on-demand revalidation.** Pages stay prerendered (the [rendering decision](#rendering-and-csp) holds). Every read is a cache entry tagged `all`, `registry`, `sites`, `site:<slug>`, `person:<slug>:<person>` or `legal:<kind>`, and `POST /api/revalidate` revalidates tags, so a changed page regenerates on its next request (ISR) without a deploy. Next 16's `unstable_cache` is used because Cache Components stay off, which keeps the static setup. Keys are scoped per build, so a deploy never serves an older deploy's content. There is one cache entry per site (also tagged with that site's `person:` tags), and the site lists are composed from those entries, so revalidating a site re-reads only that site. Concurrent regenerations share one in-flight read per bundle. Verified end to end with `next build && next start` against a mocked Airtable: revalidation refreshed the profile and the roster; revalidating one site and then visiting seven pages at once cost 2 site reads; during an outage, the default mode kept the last good page, while `immediate` answered 500.
- **Build cost.** `next.config.ts` builds the routing manifest from the same providers and shares remote people with the page workers through a per-build snapshot, so a build reads each Airtable site once (measured: 2 API requests for one site, against 50 when every worker read it). A self-hosted `next start` never reads remote sources at boot.
- **Domain copies share their site's tags.** A site's domain mount (`<slug>--domain`) resolves its site through `lib/pages/mount.ts`, which reads the registry and that site's own entry, the same entry the hub folder copy reads. So revalidating `site:<slug>` (or a `person:` tag) refreshes both copies, and another site's revalidation refreshes neither (`test/next/revalidate.test.ts`).
- **Still fixed per build:** which pages exist, redirects, domains and image hosts (`lib/manifest.ts`). New people, new sites, domain changes and new image hosts need a deploy (or `IMAGE_HOSTS_EXTRA` up front).

## Publishing switches

Sites, optional pages and people can be switched off in content (`active: false`, `pages: { … }`). Switches are applied in two places:
- `lib/content/publish.ts` drops inactive sites and hidden people, so they are never rendered
- `lib/render/routes.ts` leaves switched-off pages out of the route table, and the components omit every link to them

The validator rejects states that would break a live page: an inactive (or unknown) root site, when one is set, a hidden person who is featured, or an unknown page key. A leftover `stories` key (a feature that no longer exists) is rejected too. The tests check that no route or link survives a switch.

## Rendering conventions

- Content strings are trusted text authored in the JSON. The render context decodes character references (`&amp;`) once, and React escapes everything it outputs, so content can't inject markup. Content files are reviewed in PRs like code.
- No inline styles (the CSP forbids them) and no inline scripts of our own. Per-site theme rules live in `/<slug>/site.css`; photos are `<img>` elements through the image optimizer.
- Site differences are expressed as data only. See [Core vs site](#core-vs-site).
- `status: "shell"` sites may use `null` images; they render a labelled placeholder.
- Links are plain `<a>`, so every navigation is a full page load.

## Component gallery

`/_gallery` lists the sites; `/_gallery/<slug>` renders every component exported from `components/site/` with that site's content, theme stylesheet and fonts, entry by entry (`components/gallery/entries.tsx`), with links to every full page. It is the place to check a component change across brands ([onboarding.md → Component gallery](onboarding.md#component-gallery)).

- **Gated like nothing else.** Only the master password opens it: a per-site password can't (no segment of `/_gallery/…` is a slug or a shared asset), a launched site doesn't make it public, and with no master password in production (`PREVIEW_PUBLIC=true`) the proxy answers 404. A site's own domain never serves it. Responses are `private, no-cache` and `X-Robots-Tag: noindex, nofollow`; the pages carry `noindex` and no canonical URL.
- **Static.** The pages are prerendered from `app/gallery--internal/` and the proxy rewrites `/_gallery…` there, as it does for domain mounts; the internal path itself is a 404. (Next.js treats `_folders` as private, and its `%5F` escape doesn't prerender a dynamic segment below it in 16.4.)
- **CSP unchanged.** No inline styles or scripts: the gallery's styles are an external file (`public/gallery.css`), the enquiry form's error and sent states are fixed with a `data-state` attribute instead of the URL fragment, and its root layouts never render the tracking slot.
- **Out of every public list.** Gallery paths are in the build manifest (so the proxy knows them) but not in `allPaths()`, so sitemaps, `llms.txt` and the integration suite's page and link checks never see them.

## Testing

`npm test` runs Node's built-in test runner. The TypeScript suites run with Node's own type stripping, no extra tooling. Suites that need more than one site (partner privacy, a launched site beside gated ones, domains, old-slug redirects, tracking) run on a temporary content directory from `test/fixtures/sites.mjs`: a copy of the real sites plus two fictional ones, `northbridge` and `eastvale`.

| Suite | What it covers |
|---|---|
| `test/next/app.test.ts` | Builds the app into `.next-test` (the real sites plus the fictional ones, no root site) and starts it three ways (open, gated, misconfigured production). Checks every page on every site: prerendering, status, headers, the CSP, no inline styles, branding isolation, internal links, legal pages, review notes, demo pages, the landing page (at `/`: prerendered, canonical `/`, master only, a site password sent to its site, `/all` answering `301`), server-rendered 404s and fail-closed paths, redirects, the gate (including a site-password holder's 404), 503, health, robots and HEAD; and the SEO surface (headings, images, structured data, titles and descriptions, Open Graph with resolvable cards, canonical, `lang`). A second build (`.next-test-fixture`) runs fixture content: an indexable site, the gate on the others, a one-person shell site, and per-site domains (a launched site on a live domain with tags behind consent, a site on a domain that isn't live), with a root site (`/` redirecting to it, the landing page at `/all`), requested with real `Host` headers: prerendered mounts, links, 404s for other sites, aliases, the hub `301`, canonical, robots, sitemaps and llms.txt per host, the gate per host, the enquiry endpoint (POST/redirect/GET, JSON, a client-sent site header replaced) and the tracking CSP. |
| `test/next/proxy.test.ts` | `decide()` without Next.js: gate matrix, password rotation, Basic parsing, constant-time compare, 405/503/302/301, renamed cards, headers and CSP, indexable sites, cache headers, the 404 rewrite, origin handling; host routing (site hosts, aliases, the hub, unknown hosts), the gate and indexing per host, POST to the enquiry endpoint, the tracking CSP |
| `test/next/render.test.ts` | Page switches, theme CSS, the route table, `resolvePage`, demo flags, entity decoding, markdown; whole pages rendered with the app's components: switched-off pages leave no link, hostile content can't break out of attributes |
| `test/next/seo.test.ts` | Title and description budgets, the indexing switch, sitemaps, robots, llms.txt, structured data against schema.org property lists, alt text, behaviour helpers |
| `test/next/content.test.ts` | The JSON provider (equal to `src/sites/index.mjs`), switches, slug safety, typed errors, provider selection and stubs, `withPeople`, the build snapshot, `IMAGE_HOSTS_EXTRA`, legal parsing |
| `test/next/domains.test.ts` | Per-site domains: host parsing, the hub host, mounts, canonical URLs, the hub origin never taking a partner domain, links, canonical, Open Graph, structured data, indexing and discovery files per mount |
| `test/next/enquiry.test.ts` | The enquiry endpoint: field checks mirroring the form, honeypot, minimum time, size, type and rate limits, the per-site gate, same-origin, forwarding with a mocked `fetch` (payload, secret header), discarding without a webhook, POST/redirect/GET states, and no personal data in logs |
| `test/next/tracking.test.ts` | The tracking slot: off by default, id patterns, the env fallback, consent, the Trusted Types allowlist, the CSP it widens |
| `test/next/env.test.ts` | Every environment variable read in code is in `.env.example` and `docs/vercel.md` |
| `test/next/gallery.test.ts` | The component gallery: every component exported from `components/site/` has an entry (a new component without one fails), every site and a shell site render every entry with no inline styles or tracking, the gallery stays out of the route table, sitemaps and `llms.txt`, and the consent banner's static twin matches `public/tracking.js`. `proxy.test.ts` and `app.test.ts` check the gate: master password only, `noindex`, a 404 without a master password in production and on a site's domain, prerendered. |
| `test/perf-budget.test.mjs` | The budget check behind `npm run perf:budget` (the measuring runs in CI's `perf` job) |
| `test/contract/schema.test.ts` | The schema files and the doc's field reference are current; the examples are valid (domains, tracking and consent included); validator messages |
| `test/contract/providers.test.ts` | The conformance suite against the JSON provider (real content, and switches flipped with domains set), the in-memory provider from `schema/examples`, the same through the tagged cache layer, and Airtable people on fixtures, including `registry.domains` passing through; `conformance-teeth.test.ts` checks that every check fails on a broken provider |
| `test/next/airtable.test.ts` | Airtable config, mapper (fixtures → the people-result example, CSV = JSON, determinism, fail closed), client (pagination, 5 req/s, 429 → 30 s, backoff, typed errors, the token never logged), provider, dry run. fetch is always mocked. |
| `test/next/revalidate.test.ts` | `/api/revalidate`: auth, body validation, tags, rate limit, logs without the secret; the tags each content read carries; a site's domain copy carries its hub folder's tags, so `site:<slug>` refreshes both and no other site |
| `test/content.test.mjs` | The validator over every site, and that broken references are caught |
| `test/admin.test.mjs` | The admin: auth, CSRF, validation before save, site creation and activation, preview, licences, verification, the GitHub storage adapter |
| `test/packs.test.mjs` | Site packs: zip safety, build, read, import |

The Next.js suites build into `.next-test` and `.next-test-fixture`, so they never touch your `.next`. `NEXT_TEST_SKIP_BUILD=1` reuses existing test builds.

### Visual regression check

`npm run visual` (`scripts/visual.mjs`) screenshots a representative set of pages (every page type on spurs, plus the landing page and a 404) at 1280 and 390 px, and compares them pixel by pixel with a baseline (a 1px blur absorbs anti-aliasing; more than 0.5% of differing pixels fails a page). Pages that differ get a baseline | current | diff composite in `.visual/diff/`, with `report.json`.

**Decision (2026-10-20): the baseline is captured locally and not committed.** Run `npm run visual -- --update` on `main` (it stores PNGs in `.visual/baseline/`, gitignored), then `npm run visual` on your branch. Why:
- 74 full-page PNGs come to 50 MB or more, and every deliberate change would add another set to git history.
- Screenshots depend on the machine's Chrome version and font rendering, so a baseline committed from one machine would show differences on another.
- Photos are hotlinked Getty comps, which can change or fail to load. That makes it a poor CI gate: CI checks structure instead (`test/next/app.test.ts`), and the visual check stays a local tool for markup and style changes.

`--baseline <dir>` lets a baseline live elsewhere, for example a CI artifact, if that's ever wanted.

## Rendering and CSP

**Decision (2026-10-19): every page is prerendered at build time (static, served from Vercel's CDN), with a static CSP that allows inline scripts, plus Trusted Types and SRI.** It replaced the first Next.js build's per-request nonce, which forced every page to render on each request.

### Why

The nonce recipe ([Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy)) needs dynamic rendering: "Static optimization and Incremental Static Regeneration (ISR) are disabled", and "Pages cannot be cached by CDNs". On Vercel, the proxy (Routing Middleware) "runs globally before the cache" in every region ([Vercel](https://vercel.com/docs/routing-middleware)), while functions run in one region (`iad1` by default; [regions](https://vercel.com/docs/functions/configuring-functions/region)). So:

- **Static:** the gate runs at the nearest edge, then the CDN serves the prerendered page from that edge.
- **Dynamic:** every page view also travels to the function region (a transatlantic round trip for UK visitors) and renders there, with occasional cold starts.

Measured locally with `next start`, no CDN (`scripts/perf-load.mjs`, 50 sequential requests, then 300 at concurrency 20):

| Page | TTFB median, nonce → static | Throughput, nonce → static | p95 under load, nonce → static |
|---|---|---|---|
| `/spurs` | 11.3 → 6.3 ms | 105 → 390 req/s | 234 → 58 ms |
| `/spurs/legends` | 12.9 → 8.4 ms | 77 → 238 req/s | 282 → 116 ms |
| `/spurs/legends/dele-alli` | 8.3 → 3.7 ms | 127 → 483 req/s | 249 → 63 ms |
| `/f1/legends/sebastian-vettel` | 8.3 → 4.1 ms | 142 → 374 req/s | 168 → 57 ms |

Locally, static cuts TTFB by a third to a half and gives 2.6–3.8× the throughput. In production, the gap is larger: CDN edge versus function region plus render plus cold starts. Static is clearly better for speed and cost.

### The CSP for static pages

A static page can't carry a per-request nonce. Next.js's inline bootstrap scripts (the RSC payload) differ per page and exist only after rendering, so neither the proxy nor a `<meta>` policy can list their hashes in advance. `experimental.sri` only adds `integrity` to the external chunk files. The strongest policy that still allows static generation is therefore:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' <Getty> <mark hosts>;
font-src 'self'; connect-src 'self'; form-action 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none';
require-trusted-types-for 'script'; trusted-types 'none'
```

What changed, honestly:

- **Lost:** with `'unsafe-inline'`, a script injected into the HTML would run. Under the nonce it would have been blocked.
- **Why that's acceptable here:** pages are generated at build time from reviewed content and never echo the request (no query strings, headers or user data reach the HTML). React escapes every value, the JSON-LD block escapes `<`, and the markdown renderer never passes HTML through. There is no injection path for that protection to catch. Public pages have no user data and no auth.
- **Kept:** no third-party scripts (`'self'` only), **no inline styles** (no `'unsafe-inline'` in `style-src`), no plugins, no `<base>`, no framing, forms only to this origin, images only from listed hosts.
- **Tracking (off by default)** widens this only for a site with tags: Google's tag hosts and a Trusted Types `default` policy limited to that host ([Tracking and consent](#tracking-and-consent)).
- **Added:** Trusted Types with no policy. String-to-HTML or string-to-script DOM sinks (`innerHTML`, `eval`, `script.src = string`) throw, which closes the client-side (DOM XSS) route. The enquiry thank-you message was rebuilt with DOM calls for this. A browser run over every page type, with the menu, shortlist, roster filters and enquiry submit, reported no violations. Framework chunk files carry SRI hashes (`experimental.sri`).
- **Revisit** if a page ever renders request data or user content: that page should go back to a nonce (dynamic) policy.

Mechanics:
- The proxy no longer passes anything to pages (no nonce, no path header).
- Each site has its own root layout (`app/[site]/layout.tsx`) for `<html lang>`, the body class and the theme stylesheet. Demo pages wrap their content in `div.demo` instead of a body class.
- `app/global-not-found.tsx` is the 404 for every root layout.
- The canonical origin is fixed per build (`lib/origin.ts`: `PUBLIC_ORIGIN`, else the Vercel production hostname, else the hub), never taken from the request.
- `test/next/app.test.ts` checks that every page is in the prerender manifest.

## Referrer policy

**`Referrer-Policy: strict-origin-when-cross-origin`** (header from `lib/proxy/decide.ts`, plus the `<meta name="referrer">` from `lib/pages/metadata.ts`). It replaced `no-referrer` so that getapeptalk.com can see the referral traffic these sites send it.

- **Same-origin requests** send the full URL.
- **Cross-site requests** send only the origin, never the path or query string. Nothing is sent when going from HTTPS to HTTP.
- **Trade-off:** Getty and the partner mark CDNs (every hotlinked image) now see the referring origin, `https://appearances.getapeptalk.com`, which identifies the preview host. They still never see which site or page it came from (`/spurs/legends/…`). Under `no-referrer` they saw nothing. Photos go through the image optimizer, which is a same-origin request, and the server then fetches Getty without a referrer. So from a page, only the marks are fetched cross-site.

## SEO and AEO

Everything is core: one implementation for every site, driven by content. A site switches it on at launch with `site.json → indexable` (default `false`). [content-model.md → Indexing](content-model.md#indexing-the-launch-switch) has the switch table and [brand-and-legal.md → Launch SEO checklist](brand-and-legal.md#launch-seo-checklist) the steps.

| Concern | How | Owner |
|---|---|---|
| Indexing | `robots` meta and `X-Robots-Tag` from the flag. Preview deployments never index, and `SEARCH_INDEXING=off` is a kill switch. An indexable site's pages, and the shared assets they render with, skip the password gate. Other sites keep theirs. | `lib/seo/indexing.ts`, `lib/proxy/decide.ts` |
| Titles and descriptions | Unique per page. Titles try shorter forms to stay within 65 characters; descriptions are clamped to 160 at a word boundary. Google sets no hard limit but truncates to the device width ([title links](https://developers.google.com/search/docs/appearance/title-link), [snippets](https://developers.google.com/search/docs/appearance/snippet)). A test checks uniqueness and budgets on every page. | `lib/seo/copy.ts` |
| Canonical, Open Graph, Twitter | Self-referencing absolute canonical on every page ([canonicalization](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)); none on the 404 page. `og:locale` follows the site's language. | `lib/pages/metadata.ts` |
| Language | `site.json → lang` (`en-GB` default, `en-US` for US organisations) sets `<html lang>`, `og:locale` and `inLanguage`. No `hreflang`: each page exists in one language only, and Google detects language from the content, not from `lang` or `hreflang` ([localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)). | `app/[site]/layout.tsx` |
| Headings | Exactly one `h1` per page and no skipped levels: roster cards are `h2` under the roster's `h1`, ways-to-book formats are `h2`, FAQ questions are `h3`, and markdown headings never skip. Section headings name their subject ("Dele Alli at a glance", "Book a speaker", "Who runs the platform"). A test checks the outline of every page on every site and on fixture sites. | `components/site/` |
| Category pages | One crawlable page per role (`/<slug>/category/<role-slug>`, the slug from the role's label) instead of a `?role=` filter, so "Spurs managers" has its own URL, title, `CollectionPage` + `ItemList` and an answer-style FAQ built from the people in it (formats offered, common topics). Roles nobody holds have no page. Links to categories (home role list, footer, breadcrumbs on profiles) use these pages; the roster keeps its role tabs as filters. | `lib/render/category.ts`, `app/[site]/category/[role]/` |
| Images | See [Images](#images). Alt text is the person's name plus their position line; decorative photos get `alt=""`; the wordmark is named after the organisation; crests keep `role="img"` with an accessible name. | `lib/render/alt.ts` |
| Structured data | One JSON-LD `@graph` per page with stable `@id`s: PepTalk `Organization` (`sameAs` getapeptalk.com), the rights holder (`SportsTeam`/`SportsOrganization`), `WebSite` (publisher PepTalk), the page (`WebPage`, `CollectionPage`, `ProfilePage`, `AboutPage`, `ContactPage`), `BreadcrumbList` on every inner page, `Person` on profiles (name, jobTitle, description, image, affiliation, knowsAbout, `sameAs` from `people.json`), `ItemList` on the roster and on each category page, an `ItemList` of `Service` on Ways to book (no offers or prices), and `FAQPage` where the FAQ renders (home, about, categories and profiles). **No `Review` or rating markup**: the testimonials are placeholders, and self-serving reviews are ineligible anyway ([review snippets](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)). Only visible content is marked up ([policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)). Google no longer shows FAQ rich results (from May 2026, per the [FAQPage page](https://developers.google.com/search/docs/appearance/structured-data/faqpage)); the markup stays valid schema.org for other engines. `ProfilePage` fits because each profile's subject is a single person formally represented on the site ([profile page](https://developers.google.com/search/docs/appearance/structured-data/profile-page)). Breadcrumbs follow [Google's breadcrumb rules](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb). A test checks every graph against schema.org property lists and checks that crumbs and FAQs match what's visible. | `lib/seo/jsonld.ts` |
| Sitemaps | `/sitemap.xml` is an index of `/<slug>/sitemap.xml` (and `/all/sitemap.xml` for the hub, which lists the landing page at its URL: `/`, or `/all` with a root site). It lists only built, published, indexable pages: no demo pages, hidden people, switched-off pages or placeholder legal pages. Profiles carry their photo (image sitemap). There is no `lastmod`: content has no reliable modified date, and Google ignores inaccurate ones ([sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)). | `lib/seo/discovery.ts` |
| robots.txt | `Disallow: /` while nothing is indexable (as before). Then `Allow` lines for each indexable site, the shared assets crawlers need to render (`/_next/static/`, `/_next/image`, CSS, fonts), and a `Sitemap:` line. | `app/robots.ts` |
| llms.txt | `/<slug>/llms.txt` for indexable sites ([llmstxt.org](https://llmstxt.org/)): entity sentence, key pages, every person with a one-line answer, and the booking FAQ. `/llms.txt` lists indexable sites. Google says AI features need no special files or markup ([AI features](https://developers.google.com/search/docs/appearance/ai-features)), so this is a cheap extra for other answer engines, not a requirement. | `lib/seo/discovery.ts` |
| Answer-style content | A profile opens with an **"At a glance"** definition list built from data: role, era, known for, best for, talks about, formats, travels from, languages. Stats, timeline, tags and the booking box are semantic lists (`dl`, `ol`, `ul`). FAQ answers sit in the HTML inside `<details>` (crawlable without JavaScript). | `components/site/pages.tsx` |
| Entity consistency | The same names everywhere: `platform` and `entity` (footer, about lead, home description, `WebSite`, llms.txt), PepTalk as one `Organization` `@id`, the person's `name` in the title, `h1`, alt text, `Person` and the sitemap. | content + `lib/seo/` |
| Internal links | Visible breadcrumbs (`nav` > `ol`) match the `BreadcrumbList`. Related people sit on every profile, and links go to getapeptalk.com hubs where the design already had them. Anchor text is descriptive: "View <name>'s profile", with the name visually hidden. Site pages never link to the landing page (`/`), which lists every partner (privacy between partners). | `components/site/` |

Not done, deliberately: no `hreflang` (single language), no `Review`/`AggregateRating`, no `Offer` prices (fees are on enquiry), no `lastmod`.

## Images

**Decision: content photos are real `<img>` elements through the Next.js image optimizer, not CSS backgrounds.** [Google doesn't index CSS images](https://developers.google.com/search/docs/appearance/google-images), and a CSS background can't be an early LCP candidate: it is discovered only after the stylesheet loads, and every background in the stylesheet loaded eagerly, so a roster downloaded all 49 photos (2 MB on mobile).

- `lib/render/images.ts` calls `getImageProps()` (`fill`, a `sizes` hint per slot, WebP, widths 256/384/640) and drops Next's inline `style`, which the CSP forbids. `.photo > .ph` in `public/styles.css` does the same job: absolute fill, `object-fit: cover`, `object-position` matching the old background position.
- Every slot's height is set in CSS, so images can't shift layout (CLS stays at or near 0).
- The LCP photo (home hero, profile hero, the hospitality photo) is `loading="eager"` with `fetchpriority="high"`. React adds a matching `<link rel="preload" as="image">`. The first roster cards are eager; everything else is `loading="lazy"`.
- Getty comps are at most 612 px wide (a few 1024), and the optimizer never upscales, so larger widths would only lengthen every page's `srcset`. Revisit `deviceSizes` when licensed R2 originals arrive.
- `images.remotePatterns` comes from the hosts in `images.json` (built in `lib/manifest.ts`). Resized copies are cached for 31 days (`minimumCacheTTL`).
- **`/_next/image` is gated** like everything else: the proxy matcher now includes it, and any valid password opens it. It is public only once something is indexable, so anonymous visitors can't use the optimizer before launch.
- **Cost:** Vercel bills image transformations, roughly 800 source images times 3 widths, once per cache period. Getty is no longer a direct page dependency, so no `preconnect` is needed for it. The pages preconnect to the partner mark hosts instead, because the wordmark and crest are above the fold.
- `/<slug>/site.css` lost its image map (one `.i<id>{--img:url(…)}` rule per photo), shrinking from about 60 KB to under 1 KB per site.

## Performance

Measured with `npm run perf` (`scripts/perf.mjs`: puppeteer-core and Chrome against `next build && next start`, the median of 3 cold loads after a warm-up). Mobile uses Lighthouse's mobile profile (412×823 at DPR 1.75, 4× CPU slowdown, 150 ms RTT, 1.6 Mbps). Desktop is 1350×940 at 40 ms and 10 Mbps. "Before" is the first Next.js build (nonce CSP, CSS background photos); "after" is the current design. INP needs real interactions, so TBT is the lab proxy.

| Profile | Page | LCP ms | CLS | TBT ms | TTFB ms | Transfer KB | JS KB | CSS KB | Image KB | Requests |
|---|---|---|---|---|---|---|---|---|---|---|
| mobile | `/spurs` | 6336 → 992 | 0.000 → 0.000 | 125 → 99 | 22 → 6 | 1250 → 431 | 137 → 137 | 66 → 10 | 949 → 180 | 32 → 21 |
| mobile | `/spurs/legends` | 9820 → 840 | 0.000 → 0.012 | 107 → 100 | 22 → 6 | 2307 → 376 | 137 → 137 | 66 → 10 | 2000 → 110 | 62 → 16 |
| mobile | `/spurs/legends/dele-alli` | 3004 → 844 | 0.000 → 0.000 | 99 → 98 | 16 → 4 | 675 → 316 | 137 → 137 | 66 → 10 | 379 → 72 | 20 → 14 |
| mobile | `/f1` | 5576 → 1460 | 0.034 → 0.000 | 97 → 96 | 15 → 5 | 1089 → 366 | 137 → 137 | 64 → 10 | 822 → 146 | 32 → 21 |
| mobile | `/f1/legends` | 1548 → 668 | 0.034 → 0.000 | 95 → 104 | 17 → 6 | 2226 → 295 | 137 → 137 | 64 → 10 | 1952 → 60 | 59 → 16 |
| mobile | `/f1/legends/sebastian-vettel` | 3400 → 1312 | 0.003 → 0.000 | 94 → 88 | 13 → 4 | 652 → 260 | 137 → 137 | 64 → 10 | 389 → 48 | 20 → 14 |
| desktop | `/spurs` | 1116 → 236 | 0.000 → 0.000 | 0 → 0 | 16 → 5 | 1279 → 428 | 137 → 137 | 66 → 10 | 979 → 177 | 33 → 21 |
| desktop | `/spurs/legends` | 536 → 204 | 0.000 → 0.000 | 0 → 0 | 16 → 6 | 2307 → 443 | 137 → 137 | 66 → 10 | 2000 → 178 | 62 → 22 |
| desktop | `/spurs/legends/dele-alli` | 532 → 244 | 0.000 → 0.000 | 0 → 0 | 11 → 4 | 675 → 316 | 137 → 137 | 66 → 10 | 379 → 72 | 20 → 14 |
| desktop | `/f1` | 920 → 256 | 0.032 → 0.000 | 0 → 0 | 15 → 5 | 1123 → 394 | 137 → 137 | 64 → 10 | 855 → 174 | 33 → 24 |
| desktop | `/f1/legends` | 824 → 204 | 0.001 → 0.000 | 0 → 0 | 17 → 5 | 2226 → 329 | 137 → 137 | 64 → 10 | 1952 → 94 | 59 → 22 |
| desktop | `/f1/legends/sebastian-vettel` | 604 → 256 | 0.008 → 0.000 | 0 → 0 | 12 → 4 | 652 → 260 | 137 → 137 | 64 → 10 | 389 → 48 | 20 → 14 |

Before is the median of 3 runs, after the median of 5 (FCP, HTML size and the per-run data are in the JSON that `npm run perf -- --out` writes).

What moved the numbers:

| Change | Effect |
|---|---|
| Photos as lazy, responsive `<img>` (WebP, sized per slot) | Roster image bytes fell from about 2 MB to 60–180 KB, and requests fell from 60 to about 20. The LCP photo now starts loading from the HTML instead of after the CSS. |
| Image map removed from `site.css` | CSS fell from 64–66 KB to 10 KB per page. |
| Static pages | Local TTFB down by a third to a half; in production, pages come from the CDN instead of a function region. |
| Per-site font preloads | Barlow Condensed is preloaded on the sites that use it (f1's CLS went from 0.034 to 0). The hub pages preload their own faces instead of Outfit, which they don't use. All faces were already `font-display: swap`, self-hosted and Latin-subset. `next/font` was not adopted: its generated family names would break the `theme.display` stacks in content, and the gain over preloading is the size-adjusted fallback only. |
| Versioned stylesheets (`?v=<hash>`) and fonts | `Cache-Control: max-age=31536000, immutable`; repeat views fetch no CSS or fonts. Since revalidation, the generated theme stylesheets (`/<slug>/site.css`, `/landing.css`, under 1 KB) are `no-cache` instead, revalidated with their ETag, so a regenerated page can never point at a stale copy pinned under the new hash. |

Left as is, with reasons:
- **JS (137 KB compressed):** the Next.js and React runtime. On these measured partner pages, the only client island is the behaviour component, which renders nothing. The hub also loads its separate `landing-interactions.tsx` components; this historical partner-page measurement is not a hub budget result. An App Router page can't drop the runtime, demo pages included.
- **`public/styles.css` (35 KB, 7 KB gzipped):** a coverage run over every page type at both widths found 13% unused, mostly landing-only rules and states that tests don't trigger. Splitting would save about 1 KB gzipped per page but cost a second cached file, so it stays one file.
- **HTML size:** the roster's HTML grew from 23 KB to 39 KB compressed, because each `srcset` repeats the long Getty URL and App Router repeats the markup in its RSC payload. That is about 85 ms on the throttled mobile profile, well below the 1–2 MB of images it saves.

### Performance budgets

`npm run perf:budget` (CI job `perf` in `.github/workflows/ci.yml`) runs `scripts/perf.mjs` after `next build && next start` on the same six pages and two profiles, network-free (`--offline`: third-party requests are blocked and `/_next/image` answers a 1×1 PNG, so hotlinked Getty photos and partner marks can't make CI flaky), and fails when the worst page on a profile goes over `scripts/perf-budgets.json`:

| Metric | Measured 2026-10-20 (offline, worst page) | Budget mobile | Budget desktop |
|---|---|---|---|
| LCP | 980 ms mobile, 288 ms desktop | 1600 ms | 600 ms |
| CLS | 0.000 | 0.05 | 0.05 |
| JS (compressed) | 138.9 KB | 150 KB | 150 KB |
| First-party bytes without images (HTML, CSS, JS, fonts) | 236.5 KB | 260 KB | 260 KB |
| First-party requests | 19 mobile, 22 desktop | 23 | 26 |

- Bytes and requests sit a little above today's numbers, so a new dependency, a heavier page or an extra font fails the build. LCP has more headroom because CI runners are slower and noisier than a laptop; offline, the LCP element is text (photos are a 1×1 placeholder), so it tracks HTML, CSS, fonts and scripts rather than Getty.
- Run locally: `npm run perf:budget` (needs Chrome; `CHROME_PATH` if it isn't at `/usr/bin/google-chrome`). Any run can be checked with `-- --budget scripts/perf-budgets.json`, with or without `--offline`. Results are in `.perf/budget.json` (a CI artifact too).
- Raising a ceiling needs a reason in the PR. TBT isn't budgeted: on shared runners with a 4× CPU slowdown it is too noisy to gate on (it is still measured).

Cache headers (`lib/proxy/decide.ts → cacheControl`):
- Responses that needed a password are `private`.
- `/styles.css?v=`, `/tracking.js?v=` and fonts are immutable for a year. The generated theme stylesheets (`/<slug>/site.css`, `/landing.css`) are `no-cache` (revalidated with their ETag), because revalidation can change them.
- Open Graph cards and PepTalk images are cached for a day, with a week of stale-while-revalidate.
- Pages are `max-age=0, must-revalidate`; the CDN keeps the prerendered copy until the next deploy.
- The optimizer keeps its own header.

## Decisions

| Decision | Why |
|---|---|
| Next.js on Vercel, every page prerendered | Hundreds of pages, no per-request data. Prerendering keeps pages on the CDN and the per-request code down to the proxy ([Rendering and CSP](#rendering-and-csp)). Next.js replaced a zero-dependency static generator so a developer can own the site and plug in a CMS ([nextjs-migration.md](nextjs-migration.md)). |
| JSON content with a local admin, plus seams for a hosted CMS and Airtable | Content is reviewed in PRs like code, and the admin edits the same files (or opens a PR) without adding a database or a public attack surface. A CMS provider and the Airtable people sync plug in behind one contract ([content-contract.md](content-contract.md), [airtable-cms.md](airtable-cms.md)). |
| One contract source, generated JSON Schema, a dependency-free validator | The schema is written once in TypeScript (`lib/content/contract/schemas.ts`) with compile-time equality checks against `types.ts`, and emitted as standard draft 2020-12 files. A generator from types would need the TypeScript compiler API, which TypeScript 7 changes, and a runtime validator dependency wasn't worth adding for the subset used. |
| On-demand revalidation by tag, pages stay static | Keeps CDN speed and cost (see [Rendering and CSP](#rendering-and-csp)) while CMS and Airtable edits go live without a deploy. `unstable_cache` rather than `'use cache'`, because Cache Components would change the rendering model. |
| Hotlinked marks and Getty comps | Concept only. The licensed files go to object storage at launch (see [brand-and-legal.md](brand-and-legal.md)). |
| Open Graph cards committed as JPEGs | Rendering needs headless Chrome, which the build doesn't have. Several cards per site (49 today). |
| A prerendered domain mount per site (`<slug>--domain`), not per-host rendering | Keeps every page static while links on a partner domain drop the slug ([domains.md → Decision](domains.md#decision-a-domain-mount-per-site-prerendered-2026-10-20)) |
| Unknown hosts behave as the hub, without moving live sites | Vercel preview and deployment URLs must keep working, and only hosts added to the project reach it |
| Enquiry thank-you state in a URL fragment (`#enquiry-sent`) | POST/redirect/GET without JavaScript while the form page stays static |
| Tracking through a Trusted Types `default` policy limited to Google's tag host | Keeps Trusted Types (and no inline scripts) on sites with tags; none of it applies to sites without |
| Budgets on first-party bytes, network-free in CI | Hotlinked Getty photos would make byte and LCP budgets flaky |
| Wording as data (`vocab`) | Football, motorsport, golf and US leagues need different words for the same page structure. |
| The landing page is the hub's home at `/`, a real route (`app/(landing)/page.tsx`), not a proxy rewrite of `/` to `/all` (2026-10-20) | `/` is then prerendered under its own URL like every page (in the prerender manifest, served from the CDN, the static CSP unchanged), and the default setup needs no rewrite. A root site stays optional (`registry.json → rootSite`): with one, `/` redirects to it and the proxy rewrites `/all` to the same route; the canonical URL, structured data, breadcrumbs, sitemaps and `llms.txt` follow `landingPath()` (`lib/render/routes.ts`), read at build time. |
| A site password on the landing page redirects to its own site, rather than a bare `401` (2026-10-20) | The landing page names every partner, so only the master password opens it. HTTP Basic carries the password on every request, so the proxy can tell whose site it opens: it compares it with each published site's password (constant time, all compared) and answers `302` to the first match in registry order, `no-store`. The redirect names only a site the holder can already open. Before the browser has any credentials there is nothing to tell from, so the first visit gets the usual `401` prompt; after the visitor types a site password, the browser retries and is redirected. |
| A component gallery behind the master password, not a separate tool (Storybook) | Components render with real content, the real theme stylesheets and the real CSP, prerendered like every page, with no extra dependency; a test keeps it complete ([Component gallery](#component-gallery)) |
