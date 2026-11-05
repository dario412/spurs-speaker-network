# Content contract

Everything the site renders comes from a **content provider**. This page is the contract a provider must meet: the shapes it returns, which fields are required, the defaults, how images and publishing work, how errors surface, and how cached pages are refreshed. A CMS or Airtable integration is done when it returns these shapes and the [conformance suite](#conformance-suite) is green.

## Files

| Path | What it is |
|---|---|
| `lib/content/types.ts` | The TypeScript types components use (`Site`, `Person`, `Registry`, `LegalDoc`, …) |
| `lib/content/contract/schemas.ts` | **The single source of the contract.** Every shape, with descriptions, defaults and constraints. Compile-time assertions fail `npm run typecheck` if it disagrees with `types.ts`. |
| `schema/*.schema.json` | JSON Schema (draft 2020-12), generated. Use them from any language or validator, Ajv included. |
| `schema/examples/` | Valid sample payloads: a populated site (Getty and R2 images, people with `sameAs`, a hidden person, a licence approval), a shell site (null images, a page switched off), a registry, both legal documents, and a `PeopleProvider` result. |
| `docs/content-contract.md` | This page. The [field reference](#field-reference) below is generated. |
| `test/contract/provider-conformance.ts` | The conformance suite any provider must pass |

`npm run schema` regenerates the schema files and the field reference. `npm run schema -- --check` (part of `npm run check` and CI) fails when they are stale, and the typecheck fails when `schemas.ts` and `types.ts` drift, so the types, schemas and docs cannot disagree. To change the contract: edit `types.ts` and `schemas.ts` together, run `npm run schema`, and commit the result.

## What a provider returns

`ContentProvider` (`lib/content/provider.ts`):

| Method | Returns | Schema |
|---|---|---|
| `getRegistry()` | Site order, the optional root site, old-slug redirects, hub indexing, per-site domains | `registry` |
| `listSites()` | Published sites in registry order: active only, hidden people removed, no bookkeeping | `site` (each) |
| `getSite(slug)` | One published site, or `null` if the slug is unknown, malformed or inactive | `site` |
| `getRawSite(slug)` / `listRawSites()` | Sites as stored, hidden people and `licences` / `verification` included (admin and validation only) | `raw-site` |
| `getLegal(kind)` | `terms` or `privacy`, shared by every site | `legal` |

`PeopleProvider.peopleFor(site)` returns `{ people, images }` for a site (schema `people-result`), or `null` when it doesn't manage that site, which keeps the content provider's people. `withPeople()` (`lib/content/select.ts`) merges the two: the site keeps the images its own settings use (home slots, role tiles) and gains the people provider's.

Three outcomes, nothing else:

1. **Data** that matches the schema.
2. **`null`** for a slug that doesn't exist or is switched off. Malformed slugs (`../x`, `Spurs`) are `null` too and never reach the source.
3. **A `ContentError`** for anything that went wrong. An outage must never look like an empty roster.

| `ContentError.code` | Meaning |
|---|---|
| `config` | Misconfigured: missing env, bad config, unknown provider, wrong base or table id |
| `unavailable` | The source couldn't be reached or read (network, filesystem, upstream 5xx after retries) |
| `unauthorized` | Credentials rejected (401/403) |
| `rate_limited` | Still rate limited after retries (429) |
| `invalid_content` | The source answered, but the content breaks the contract (schema, content rules, too many bad records) |

`ContentError` also carries `provider` and `details` (per-item problems, never credentials). At build time an error fails the build. Under ISR, a failed regeneration keeps serving the last good page.

## Required, optional and defaults

- **Required** fields must be present. Strings marked `slug`, `https URL` or `#rrggbb` must match those patterns; most text fields must not be empty.
- **Optional** fields may be left out, and leaving one out means its default. The defaults are listed in the tables (`active: true`, `indexable: false`, `lang: "en-GB"`, every page `true`, `sameAs: []`, style tokens). Wording (`vocab`) and formats default to `src/copy/defaults.mjs`.
- **No unknown keys.** Fixed-shape objects reject fields they do not define (`additionalProperties: false`), so no site quietly gains a setting the others do not have. Maps intentionally accept dynamic keys with validated values, such as image IDs in `images` and keys in legal `meta`.
- The schema checks shapes. **Content rules** that span fields (a person's `role` and `era` exist on the site, featured people are published, a mark's host is in `cspHosts`, no review notes) live in `scripts/validate-content.mjs`. The conformance suite runs both.

## Image ids and hosts

A site's `images` maps an **image id** to an https URL. People and home slots refer to ids, never to URLs.

| | Id | Example |
|---|---|---|
| Today: Getty comps | The Getty id | `"2206513784": "https://media.gettyimages.com/id/2206513784/photo/…"` |
| Tomorrow: Cloudflare R2 (or any CDN) | The URL's host and path, without the query string (`imageIdFor()` in `lib/content/image-ids.ts`) | `"media.example.com/people/jo-marsh-hero.jpg": "https://media.example.com/people/jo-marsh-hero.jpg"` |

- **Stable URLs only.** R2 links are stable, so they can be cached and licensed. Airtable attachment URLs expire 2 hours after the API returns them ([field model](https://airtable.com/developers/web/api/field-model)), so they are never accepted. The conformance suite rejects them.
- **Allowed hosts.** `next/image` only optimises images from `images.remotePatterns`, and the CSP's `img-src` only allows listed hosts. Both are computed at build time from the published content (`lib/manifest.ts`). A host that may first appear after a deploy (an R2 bucket that gains its first image through revalidation) goes in `IMAGE_HOSTS_EXTRA` (comma-separated https origins), which adds it to both.
- **Shell sites** may use `null` ids. They render a labelled placeholder.
- **Size.** Getty comps are at most 612 px wide, so the optimizer serves 256/384/640 px widths. Revisit `images.deviceSizes` in `next.config.ts` when larger R2 originals arrive.

## Publishing switches and licences

| Switch | Where | Effect |
|---|---|---|
| Site `active: false` | site | The whole site is unpublished: its URLs 404 and it leaves the landing page. `getSite()` returns `null`; `getRawSite()` still returns it. The root site, when one is set, must stay active. |
| `pages: { waysToBook, hospitality, about }` | site | A page set to `false` is not built, and every link to it disappears |
| Person `active: false` | person | The profile 404s and the person leaves every list. A hidden person can't be featured. |
| `demoHome` / `demoProfiles` | site | Look-only demo pages, never indexed |
| `indexable` | site, registry | The search launch switch ([content-model.md → Indexing](content-model.md#indexing-the-launch-switch)) |
| Airtable publishing gate | Airtable sync config | Records that fail it (not `Published`, no consent, archived) are never mapped. The live sync filters on the server and checks again on what comes back. |

Every provider applies the switches with the same pure functions (`lib/content/publish.ts`), so they behave identically whatever the source.

**Licences are bookkeeping, not a switch.** `licences.json` records which images and marks are licensed. It never reaches the renderer, and a missing approval never hides a page. The launch gate is `npm run validate -- --strict-licences`. Approvals are tied to URLs: an approval names the URL it approved, and it counts only while that URL is still the one in use. With R2, the image id is derived from the URL, so a replaced photo at a new URL is a new id that needs its own approval. When a people provider replaces a site's people, approvals for images no longer in use are dropped from the merged site (the stored file is untouched), and so are verification checks for people no longer present.

## Conformance suite

`test/contract/provider-conformance.ts` checks what the site needs from any provider:

1. **Shapes:** the registry, raw and published sites, people and legal documents match `schema/*.schema.json`.
2. **Content rules:** `validateRegistry` and `validateSite` pass on every stored site.
3. **Publishing switches:** published sites are the active ones in registry order, inactive sites return `null`, published people are the stored people minus hidden ones, featured people are published, and no bookkeeping leaks.
4. **Slugs:** unique and URL-safe. Unknown or malformed slugs resolve to `null`.
5. **Image references resolve:** every referenced id is in `images`, and every URL is https and not an expiring Airtable URL. Optionally, each URL is fetched once.
6. **Legal content is present:** terms and privacy, with a title and a real body.
7. **Deterministic ordering:** repeated reads and fresh provider instances return identical data.
8. **Typed errors:** a broken source raises `ContentError`. It never throws a raw exception, and never resolves empty.

`npm test` runs it against the JSON provider (the real content, plus a copy with switches flipped), against the in-memory provider (`lib/content/memory-provider.ts`) fed from `schema/examples`, which proves it isn't tied to the files on disk, and against that content combined with Airtable people from the fixture export through a mocked fetch. `test/contract/conformance-teeth.test.ts` runs it against a deliberately broken provider and checks that every check fails.

### Running it against your CMS

1. Implement `createCmsProvider()` in `lib/content/cms-provider.ts`. The in-memory provider is the smallest complete example: fetch your data, map it to the shapes above, and let `publishedSites()` / `publishable()` / `isActive()` apply the switches. Wrap failures in `ContentError`. Add every environment variable it reads to `.env.example` and [vercel.md](vercel.md#environment-variables) (`test/next/env.test.ts` checks); the names below are examples.
2. Map your CMS's images to stable URLs, keyed with `imageIdFor(url)`.
3. Run the suite against your live CMS:

   ```sh
   CONTENT_PROVIDER=cms CMS_API_URL=… CMS_TOKEN=… npm run contract
   ```

   Add `CONTRACT_FAILING_ENV='{"CMS_API_URL":"http://127.0.0.1:9"}'` (any overrides that break your source) to include the typed-error check, and `CONTRACT_FETCH_IMAGES=1` to fetch every image once.
4. For CI, add a test file that calls `providerConformance('cms', { provider, failing })` with your CMS client's `fetch` mocked by a recorded fixture, as `test/contract/providers.test.ts` does for Airtable.
5. Remove the `cms` stub's "not implemented" errors, then deploy with `CONTENT_PROVIDER=cms`.

The integration is done when `npm run contract` is green against the real CMS and `npm run check` passes.

## Revalidation

Pages are prerendered at build time and served from the CDN ([architecture.md → Rendering and CSP](architecture.md#rendering-and-csp)). Content that changes in a CMS or Airtable is refreshed without a deploy through **on-demand revalidation by cache tag** (ISR).

### Tags

Pages read content through `content()` (`lib/content/index.ts`), which wraps each read in a cache entry carrying these tags (`lib/content/tags.ts`, `lib/content/cached.ts`). There is **one entry per site**, and nothing else reads the source: the site lists are composed from the per-site entries, and profiles read their site's entry. So revalidating a site costs one source read for that site, never the others.

| Tag | Carried by | Revalidating it refreshes |
|---|---|---|
| `all` | every read | everything |
| `registry` | `getRegistry()` | redirects, root site |
| `sites` | the registry entry the site lists start from | the landing page, sitemaps, `llms.txt` (the list of sites) |
| `site:<slug>` | the site's entry | every page of the site, on the hub folder **and** on its own domain (the `<slug>--domain` copy reads the same entry, `lib/pages/mount.ts`), plus the hub, sitemaps and `llms.txt` that list it. Never another site's pages. |
| `person:<slug>:<person>` | the site's entry (one tag per person with a page in the build, up to Next's 128 tags per entry) | the same as `site:<slug>`. The person's data lives in the site's entry, which their card on the roster and home page also reads. It exists so a CMS can name the record that changed. |
| `legal`, `legal:terms`, `legal:privacy` | `getLegal(kind)` | the Terms and Privacy pages |

A revalidated page regenerates on its next request ([Next.js: revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)). By default (`'max'`), that first visitor still gets the cached page while it regenerates, and the next one gets the fresh page. With `"immediate": true` the endpoint uses `{ expire: 0 }`, so the next request waits for fresh content. Next.js documents this mode for webhooks that need old data gone at once.

**`immediate` gives up the last-good-page fallback.** With the default, a regeneration that fails (Airtable or the CMS down) keeps serving the last good page. With `immediate`, nothing stale may be served, so visitors get a **500** until the source is back. Measured against a mocked Airtable outage: the page answered 500 after about 14 s while the client retried. Use `immediate` only right after a successful write, when the source is known to be up, and never from an automatic retry loop.

### The endpoint

`POST /api/revalidate` (`app/api/revalidate/route.ts`, logic in `lib/revalidate/handler.ts`):

- **Authentication:** the header `x-revalidate-secret: <REVALIDATE_SECRET>` (or `Authorization: Bearer <secret>`), compared in constant time. The route is outside the preview password gate, and the preview password doesn't open it. With no `REVALIDATE_SECRET` set it answers 503.
- **Any host:** the proxy lets it through on the hub, preview URLs and every site's own domain, aliases included (`lib/proxy/decide.ts`), so a webhook can call whichever host it was configured with. It names cache tags and never returns content, so a partner domain exposes nothing of another site through it.
- **Body** (JSON, at most 8 KB), one of:

  ```json
  { "site": "spurs" }
  { "site": "spurs", "person": "dele-alli" }
  { "tags": ["site:spurs", "legal", "all"], "immediate": true }
  ```

- **Answers:** 200 `{ "revalidated": true, "tags": [...], "mode": "max" | "expire" }`; 400 for an invalid body or unknown tag; 401 for a wrong secret; 413 for a body that's too large; 429 when rate limited (30 calls a minute per client, per instance); 405 for other methods.
- **Logging:** one JSON line per call (`{"event":"revalidate","outcome":"ok","status":200,"tags":[...],"ms":2}`). Never the secret, never the headers, never the client IP.

```sh
curl -X POST https://<your-domain>/api/revalidate \
  -H "x-revalidate-secret: $REVALIDATE_SECRET" -H 'content-type: application/json' \
  -d '{"site":"spurs","person":"dele-alli"}'
```

### Webhook from your CMS

Send one call per change: `{ "site": "<slug>" }` when a site or any of its people changes; `{ "site": "<slug>", "person": "<slug>" }` when only a profile's own text changes; `{ "tags": ["legal"] }` for Terms or Privacy; `{ "tags": ["registry", "sites"] }` when the site order or redirects change. Retry on 429 or 5xx after a minute.

### Webhook from Airtable

[docs/airtable-cms.md → Refresh pages when a record changes](airtable-cms.md#9-refresh-pages-when-a-record-changes) has the automation ("When a record is updated" → "Run a script").

### What still needs a deploy

Revalidation refreshes pages that exist. The set of pages, redirects and image hosts is fixed per build (`lib/manifest.ts`, `generateStaticParams` with `dynamicParams = false`). So a deploy is needed for:

- a new site or a new person (a new URL)
- a renamed slug
- an image host not yet in the content or in `IMAGE_HOSTS_EXTRA`
- a change to `registry.json → domains` (hosts are routed from the build manifest, and each domain's copy of the pages is prerendered: [domains.md](domains.md))
- setting or removing `registry.json → rootSite` (whether `/` redirects or serves the landing page is decided by the proxy from the build manifest)

A person who is hidden or unpublished disappears from lists on `site:<slug>` revalidation, and their profile answers 404 once regenerated. Trigger a deploy from the CMS or Airtable with a [Vercel Deploy Hook](https://vercel.com/docs/deploy-hooks) URL (a `POST`, no body) for those events.

### How caching works

- Reads are cached with `unstable_cache` and tags. This is Next 16's cache for non-`fetch` data when Cache Components are off ([Caching (previous model)](https://nextjs.org/docs/app/guides/caching-without-cache-components)), and this app keeps them off to stay fully static. Inside those entries `fetch` is not cached separately, so each tag has exactly one cache layer. Moving to Cache Components later means replacing one function in `lib/content/index.ts` with `'use cache'` + `cacheTag()`.
- Cache entries outlive deployments, so every key is scoped to the build (`APPEARANCES_CACHE_SCOPE`, set by `next.config.ts` from `VERCEL_DEPLOYMENT_ID`, else a random id). A deploy never serves the previous deploy's content.
- `next build` reads each remote site once. `next.config.ts` fetches the people while building the routing manifest and shares them with the page workers through one snapshot file per site (`withBuildSnapshot`). Measured with a mocked Airtable for one site with 9 records (2 pages): 2 API requests per build, against 50 when every build worker read Airtable itself.
- At runtime, a revalidated site's entry is read again from the source, once per regeneration wave. Pages regenerating at the same moment share one in-flight read per server bundle (pages and route handlers are separate bundles), so a wave costs one read, occasionally two. Measured: revalidating one site and then visiting seven of its pages and the hub at once cost 2 reads (4 API requests).
- A self-hosted `next start` never reads Airtable or the CMS at boot. `next.config.ts` only reads the selected providers in the build and dev phases.
- `next dev` reads through uncached, so edits show on reload.

## Field reference

<!-- schema:start (generated by `npm run schema`; do not edit by hand) -->

| Schema file | Root | Returned by |
|---|---|---|
| [`schema/registry.schema.json`](../schema/registry.schema.json) | [Registry](#registry) | `getRegistry()` |
| [`schema/site.schema.json`](../schema/site.schema.json) | [Site](#site) | `listSites()` items, `getSite()` |
| [`schema/raw-site.schema.json`](../schema/raw-site.schema.json) | [RawSite](#rawsite) | `listRawSites()` items, `getRawSite()` |
| [`schema/person.schema.json`](../schema/person.schema.json) | [Person](#person) | `site.people[]` |
| [`schema/legal.schema.json`](../schema/legal.schema.json) | [LegalDoc](#legaldoc) | `getLegal(kind)` |
| [`schema/people-result.schema.json`](../schema/people-result.schema.json) | [PeopleResult](#peopleresult) | `PeopleProvider.peopleFor(site)` |

### Registry

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `order` | slug[] | yes |  | Every site slug in landing-page order, inactive sites included. |
| `rootSite` | slug | no |  | Where `/` on the hub redirects; must be an active site. Absent: `/` serves the PepTalk landing page and `/all` answers 301 to `/`; set: the landing page stays at `/all`. |
| `redirects` | { [key]: slug } | yes |  | Old slug -> new slug; pages and Open Graph cards answer 301. |
| `indexable` | boolean | no | `false` | Hub pages (the landing page, `/terms`, `/privacy`) may be indexed. Previews never index. |
| `domains` | { [key]: [SiteDomain](#sitedomain) } | no |  | Per-site domains, keyed by a slug in `order` (docs/domains.md). A site with a domain is also served at the root of its own host; each host belongs to one site and never the hub’s host. Unpublished sites’ domains are ignored. |

### Site

A published site (`listSites()`, `getSite()`): active only, hidden people removed, no bookkeeping.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `slug` | slug | yes |  | URL folder (`/<slug>`). |
| `active` | boolean | no | `true` | `false` leaves the whole site out: its URLs 404 and it leaves the landing page. |
| `indexable` | boolean | no | `false` | Search launch switch. Rejected on shell sites and while demo pages are set. |
| `lang` | `"en-GB"` \| `"en-US"` | no | `"en-GB"` | `<html lang>`, `og:locale`, `inLanguage`. |
| `pages` | { waysToBook?, hospitality?, about? } | no |  | Optional pages, each `true` by default. `false` removes the page and every link to it. |
| `status` | `"shell"` | no |  | Present only on shell sites: allows `null` images and placeholder copy. |
| `short` | string | yes |  | Short name used in copy ("Spurs"). |
| `orgName` | string | yes |  | Organisation name ("Tottenham Hotspur"). |
| `platform` | string | yes |  | Site name ("Spurs Speaker Network"). |
| `platformShort` | string | yes |  | Nav short form. |
| `tagline` | string | yes |  | Utility-bar text. |
| `entity` | string | yes |  | One factual sentence describing the platform; used everywhere (footer, About, meta, JSON-LD, llms.txt). |
| `motto` | string \| null | yes |  | Official motto, or null. |
| `copyright` | string | yes |  | Rights holder’s legal name. |
| `heroTitle` | [string, string] | yes |  | The two hero headline lines. |
| `heroWords` | string[] (min 2) | no |  | Words the hero headline cycles through; the first ends `heroTitle[0]`. |
| `waysTitle` | string | yes |  | "Ways to book" heading. |
| `stadium` | string | yes |  | Venue used in copy. |
| `marks` | { crest?, wordmark? } | yes |  | The organisation’s own crest and wordmark files, unmodified. |
| `navMark` | `"wordmark"` \| `"crest"` | yes |  | What sits in the nav. |
| `crestOnLight` | boolean | no |  | Crest artwork works on white. |
| `crestOn` | { bar?, brand?, dark? } | no |  | Crest per surface. |
| `crestFallback` | string | no |  | Text badge when there is no embeddable crest (required then). |
| `theme` | [Theme](#theme) | yes |  |  |
| `style` | [StyleTokens](#styletokens) | no |  |  |
| `cspHosts` | (https URL)[] | no |  | Origins the marks load from; added to the image CSP. |
| `orgType` | string | no | `"SportsTeam"` | `SportsTeam` or `SportsOrganization` (structured data). |
| `tracking` | { gtmId?, ga4Id? } | no |  | Tags the site loads (off by default; lib/tracking.ts). Unset: the TRACKING_GTM_ID fallback, else none. The CSP allows Google’s hosts only for sites with tags. |
| `consent` | { required? } | no |  | Consent banner for the tracking tags. |
| `eventSpaces` | { url?, heading?, copy?, image?, imageAlt?, buttonText?, eyebrow? } | no |  | Shared Event Spaces promotion. When url is set, all fields are required. Enquiries and bookings stay on the partner site. |
| `featured` | slug[] (min 1) | yes |  | People in "Featured this season": active people of this site. |
| `home` | [Home](#home) | yes |  |  |
| `homeLayout` | { waysAfterRoles?, hideEras? } | no |  |  |
| `demoHome` | boolean | no |  | Render the home page as a look-only demo. |
| `demoProfiles` | slug[] | no |  | Profiles rendered as look-only demos. |
| `vocab` | [VocabOverrides](#vocaboverrides) | no |  | Wording overrides; any key left out keeps the default in src/copy/defaults.mjs (VOCAB). |
| `formats` | { keynote?, dinner?, appearance?, hospitality?, brand?, clinic?, fan?, workshop?, virtual? } | no |  | Per-format overrides of title, short, desc, items. |
| `formatKeys` | [FormatKey](#formatkey)[] (min 1) | no |  | The formats this site offers, in display order (default: all). |
| `contact` | { email?, phone?, hours? } | no |  | Contact details under the footer brand column; each line shown only when set. |
| `faqOverrides` | { [key]: string \| { q?, a? } } | no |  | Keyed by an FAQ `key` in src/copy/defaults.mjs: an answer string, or `{ q, a }`. |
| `roles` | [Role](#role)[] (min 1) | yes |  |  |
| `eras` | [Era](#era)[] (min 1) | yes |  |  |
| `people` | [Person](#person)[] | yes |  | Every person, in display order. Slugs unique. |
| `images` | [Images](#images) | yes |  | Image id -> https URL. Every id a person or slot references must be here; URLs must be on a host allowed by next/image and the CSP (Getty, the site’s hosts, IMAGE_HOSTS_EXTRA). |

### RawSite

A site as stored (`getRawSite()`, `listRawSites()`): hidden people and bookkeeping included.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `slug` | slug | yes |  | URL folder (`/<slug>`). |
| `active` | boolean | no | `true` | `false` leaves the whole site out: its URLs 404 and it leaves the landing page. |
| `indexable` | boolean | no | `false` | Search launch switch. Rejected on shell sites and while demo pages are set. |
| `lang` | `"en-GB"` \| `"en-US"` | no | `"en-GB"` | `<html lang>`, `og:locale`, `inLanguage`. |
| `pages` | { waysToBook?, hospitality?, about? } | no |  | Optional pages, each `true` by default. `false` removes the page and every link to it. |
| `status` | `"shell"` | no |  | Present only on shell sites: allows `null` images and placeholder copy. |
| `short` | string | yes |  | Short name used in copy ("Spurs"). |
| `orgName` | string | yes |  | Organisation name ("Tottenham Hotspur"). |
| `platform` | string | yes |  | Site name ("Spurs Speaker Network"). |
| `platformShort` | string | yes |  | Nav short form. |
| `tagline` | string | yes |  | Utility-bar text. |
| `entity` | string | yes |  | One factual sentence describing the platform; used everywhere (footer, About, meta, JSON-LD, llms.txt). |
| `motto` | string \| null | yes |  | Official motto, or null. |
| `copyright` | string | yes |  | Rights holder’s legal name. |
| `heroTitle` | [string, string] | yes |  | The two hero headline lines. |
| `heroWords` | string[] (min 2) | no |  | Words the hero headline cycles through; the first ends `heroTitle[0]`. |
| `waysTitle` | string | yes |  | "Ways to book" heading. |
| `stadium` | string | yes |  | Venue used in copy. |
| `marks` | { crest?, wordmark? } | yes |  | The organisation’s own crest and wordmark files, unmodified. |
| `navMark` | `"wordmark"` \| `"crest"` | yes |  | What sits in the nav. |
| `crestOnLight` | boolean | no |  | Crest artwork works on white. |
| `crestOn` | { bar?, brand?, dark? } | no |  | Crest per surface. |
| `crestFallback` | string | no |  | Text badge when there is no embeddable crest (required then). |
| `theme` | [Theme](#theme) | yes |  |  |
| `style` | [StyleTokens](#styletokens) | no |  |  |
| `cspHosts` | (https URL)[] | no |  | Origins the marks load from; added to the image CSP. |
| `orgType` | string | no | `"SportsTeam"` | `SportsTeam` or `SportsOrganization` (structured data). |
| `tracking` | { gtmId?, ga4Id? } | no |  | Tags the site loads (off by default; lib/tracking.ts). Unset: the TRACKING_GTM_ID fallback, else none. The CSP allows Google’s hosts only for sites with tags. |
| `consent` | { required? } | no |  | Consent banner for the tracking tags. |
| `eventSpaces` | { url?, heading?, copy?, image?, imageAlt?, buttonText?, eyebrow? } | no |  | Shared Event Spaces promotion. When url is set, all fields are required. Enquiries and bookings stay on the partner site. |
| `featured` | slug[] (min 1) | yes |  | People in "Featured this season": active people of this site. |
| `home` | [Home](#home) | yes |  |  |
| `homeLayout` | { waysAfterRoles?, hideEras? } | no |  |  |
| `demoHome` | boolean | no |  | Render the home page as a look-only demo. |
| `demoProfiles` | slug[] | no |  | Profiles rendered as look-only demos. |
| `vocab` | [VocabOverrides](#vocaboverrides) | no |  | Wording overrides; any key left out keeps the default in src/copy/defaults.mjs (VOCAB). |
| `formats` | { keynote?, dinner?, appearance?, hospitality?, brand?, clinic?, fan?, workshop?, virtual? } | no |  | Per-format overrides of title, short, desc, items. |
| `formatKeys` | [FormatKey](#formatkey)[] (min 1) | no |  | The formats this site offers, in display order (default: all). |
| `contact` | { email?, phone?, hours? } | no |  | Contact details under the footer brand column; each line shown only when set. |
| `faqOverrides` | { [key]: string \| { q?, a? } } | no |  | Keyed by an FAQ `key` in src/copy/defaults.mjs: an answer string, or `{ q, a }`. |
| `roles` | [Role](#role)[] (min 1) | yes |  |  |
| `eras` | [Era](#era)[] (min 1) | yes |  |  |
| `people` | [Person](#person)[] | yes |  | Every person, in display order. Slugs unique. |
| `images` | [Images](#images) | yes |  | Image id -> https URL. Every id a person or slot references must be here; URLs must be on a host allowed by next/image and the CSP (Getty, the site’s hosts, IMAGE_HOSTS_EXTRA). |
| `licences` | object | yes |  |  |
| `verification` | object | yes |  |  |

### Person

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `slug` | slug | yes |  | URL segment of the profile (`/<site>/legends/<slug>`). Unique within the site; keep it stable. |
| `name` | string | yes |  | Display name. |
| `first` | string | yes |  | First name, used in "Check Thierry’s availability". |
| `active` | boolean | no | `true` | `false` hides the profile and removes the person from every list. A hidden person cannot be featured. |
| `role` | [RoleKey](#rolekey) | yes |  | Role group: drives roster filters and homepage tiles. |
| `roleLabel` | string | yes |  | Role line on cards, e.g. "Ex-player · Goalkeeping coach". |
| `era` | string | yes |  | An `eras[].key` of the site. |
| `limited` | boolean | yes |  | Limited availability (current playing or major job; always true for `squad`). Shows the amber pill. |
| `hero` | [ImageId](#imageid) | yes |  | A key of the site’s `images` map: a Getty id today ("2206513784"), the URL’s host and path for R2 images ("media.example.com/people/a.jpg"). `null` only on `status: "shell"` sites (a labelled placeholder renders). |
| `card` | [ImageId](#imageid) | yes |  | A key of the site’s `images` map: a Getty id today ("2206513784"), the URL’s host and path for R2 images ("media.example.com/people/a.jpg"). `null` only on `status: "shell"` sites (a labelled placeholder renders). |
| `gallery` | [ImageId](#imageid)[] (exactly 3) | yes |  | Exactly three image ids. |
| `pos` | string | yes |  | Position line, e.g. "Striker · Arsenal 1999–2007 · France". |
| `short` | string | yes |  | Card line. |
| `honour` | string | yes |  | Headline honour. |
| `line` | string | yes |  | Positioning line on the profile. |
| `stats` | [Pair](#pair)[] (max 4) | yes |  | Four `[value, caption]` pairs, or none (the profile then leaves out its key stats); stable facts only. |
| `bio` | string[] (min 1) | yes |  | Paragraphs of original copy (no quotes, no contested numbers). |
| `why` | string | yes |  | "Best for" paragraph. |
| `timeline` | [Pair](#pair)[] | yes |  | `[year, text]` entries, oldest first; empty leaves out the career section. |
| `talks` | string[] (min 1) | yes |  | Talk topics. |
| `audiences` | string[] | yes |  | Audiences ("Great for"); empty leaves the list out. |
| `industries` | string[] | yes |  | Industries; empty leaves the list out. |
| `formats` | [FormatKey](#formatkey)[] | yes |  | Booking formats offered, in display order. |
| `langs` | string | yes |  | Languages, as display text ("English, French"). |
| `travelsFrom` | string | no |  | Defaults to the site’s `vocab.travelsFrom`. |
| `sameAs` | (https URL)[] (max 10) | no | `[]` | Up to 10 official profiles elsewhere (club page, Wikipedia, Wikidata, verified socials). Emitted as `Person.sameAs` in JSON-LD. |

### LegalDoc

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `kind` | `"terms"` \| `"privacy"` \| `"accessibility"` | yes |  |  |
| `title` | string | yes |  | Page heading. |
| `lastUpdated` | string \| null | yes |  | "Last updated" text from the source, or null. |
| `body` | string | yes |  | Markdown body (safe subset, see docs/content-model.md → Legal pages). |
| `meta` | { [key]: string } | yes |  | Frontmatter bookkeeping (`source`, `status`, …); never rendered. |

### PeopleResult

What a PeopleProvider returns for one site (hidden people included; switches are applied afterwards).

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `people` | [Person](#person)[] | yes |  | Every person, in display order. Slugs unique. |
| `images` | [Images](#images) | yes |  | Image id -> https URL. Every id a person or slot references must be here; URLs must be on a host allowed by next/image and the CSP (Getty, the site’s hosts, IMAGE_HOSTS_EXTRA). |

### Era

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `key` | string | yes |  |  |
| `label` | string | yes |  |  |
| `blurb` | string | yes |  |  |

### FormatKey

One of the booking formats (src/copy/defaults.mjs).

Type: `"keynote"` \| `"dinner"` \| `"appearance"` \| `"hospitality"` \| `"brand"` \| `"clinic"` \| `"fan"` \| `"workshop"` \| `"virtual"`

### Home

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `hero` | [Slot](#slot) | yes |  |  |
| `inset` | [Slot](#slot) | yes |  |  |
| `eraImage` | [ImageId](#imageid) | yes |  | A key of the site’s `images` map: a Getty id today ("2206513784"), the URL’s host and path for R2 images ("media.example.com/people/a.jpg"). `null` only on `status: "shell"` sites (a labelled placeholder renders). |
| `storyImage` | [ImageId](#imageid) | yes |  | A key of the site’s `images` map: a Getty id today ("2206513784"), the URL’s host and path for R2 images ("media.example.com/people/a.jpg"). `null` only on `status: "shell"` sites (a labelled placeholder renders). |
| `hospitalityImage` | [ImageId](#imageid) | yes |  | A key of the site’s `images` map: a Getty id today ("2206513784"), the URL’s host and path for R2 images ("media.example.com/people/a.jpg"). `null` only on `status: "shell"` sites (a labelled placeholder renders). |
| `activeEra` | string | yes |  | An `eras[].key`. |
| `slides` | [Slot](#slot)[] | no |  | More hero slides after `hero`; the hero photo becomes a carousel. |
| `aboutImage` | [ImageId](#imageid) | no |  | A key of the site’s `images` map: a Getty id today ("2206513784"), the URL’s host and path for R2 images ("media.example.com/people/a.jpg"). `null` only on `status: "shell"` sites (a labelled placeholder renders). |
| `fromSpeakers` | boolean | no |  | The hero, inset, carousel, about photo and role tile photos follow the live speakers (featured first), so only listed speakers are ever shown. The slots above then only set how many slides there are. |

### ImageId

A key of the site’s `images` map: a Getty id today ("2206513784"), the URL’s host and path for R2 images ("media.example.com/people/a.jpg"). `null` only on `status: "shell"` sites (a labelled placeholder renders).

Type: string \| null

### Images

Image id -> https URL. Every id a person or slot references must be here; URLs must be on a host allowed by next/image and the CSP (Getty, the site’s hosts, IMAGE_HOSTS_EXTRA).

Type: { [key]: https URL }

### Pair

`[value, caption]` or `[year, text]`.

Type: [string, string]

### Role

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `key` | [RoleKey](#rolekey) | yes |  | Role group: drives roster filters and homepage tiles. |
| `label` | string | yes |  |  |
| `blurb` | string | yes |  |  |
| `image` | [ImageId](#imageid) | no |  | A key of the site’s `images` map: a Getty id today ("2206513784"), the URL’s host and path for R2 images ("media.example.com/people/a.jpg"). `null` only on `status: "shell"` sites (a labelled placeholder renders). |
| `singular` | string | no |  |  |
| `browseLabel` | string | no |  |  |
| `pitch` | { eyebrow, heading, lead, points } | no |  | The category page's "why book" section; without it the page shows popular topics and formats. |

### RoleKey

Role group: drives roster filters and homepage tiles.

Type: `"player"` \| `"manager"` \| `"staff"` \| `"women"` \| `"squad"`

### SiteDomain

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `primary` | hostname | yes |  | The canonical host: lowercase, no scheme, port, path or trailing dot. |
| `aliases` | hostname[] | yes |  | Extra hosts that answer 301 to `primary`, keeping path and query. `[]` for none. |
| `live` | boolean | yes |  | `true` once DNS and TLS work: the hub folder answers 301 to the domain, and canonical URLs use it. |

### Slot

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `image` | [ImageId](#imageid) | yes |  | A key of the site’s `images` map: a Getty id today ("2206513784"), the URL’s host and path for R2 images ("media.example.com/people/a.jpg"). `null` only on `status: "shell"` sites (a labelled placeholder renders). |
| `name` | string | yes |  |  |
| `line` | string | yes |  |  |
| `tag` | string | no |  | `"br"` puts the name card bottom-right. |

### StyleTokens

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `buttonRadius` | string | no | `"999px"` |  |
| `buttonCase` | string | no | `"none"` |  |
| `buttonClip` | boolean | no | `false` | Chamfered button corners. |
| `headingCase` | string | no | `"uppercase"` |  |
| `headingStyle` | string | no | `"normal"` |  |
| `cardRadius` | string | no | `"16px"` |  |

### Theme

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `brand` | #rrggbb | yes |  |  |
| `ink` | #rrggbb | yes |  |  |
| `dark` | #rrggbb | yes |  |  |
| `bar` | #rrggbb | yes |  |  |
| `display` | string | yes |  | Display font stack ending in a bundled font (Outfit or Barlow Condensed). |
| `tint` | #rrggbb | no |  | Neutral; set tint, line, muted and mutedDark together. |
| `line` | #rrggbb | no |  |  |
| `muted` | #rrggbb | no |  |  |
| `mutedDark` | #rrggbb | no |  |  |
| `faint` | #rrggbb | no |  | Defaults to `muted`. |

### VocabOverrides

Wording overrides; any key left out keeps the default in src/copy/defaults.mjs (VOCAB).

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `rolesEyebrow` | string | no |  |  |
| `heroLead` | string | no |  |  |
| `rosterLead` | string | no |  |  |
| `staffPill` | string | no |  |  |
| `rolesHeadline` | string | no |  |  |
| `whoOptions` | string[] | no |  |  |
| `whereOptions` | string[] | no |  |  |
| `fixtureWord` | string | no |  |  |
| `assureRoles` | string | no |  |  |
| `eraHeadline` | string \| null | no |  |  |
| `eraLead` | string | no |  |  |
| `eventStoryTitle` | string | no |  |  |
| `galleryHeadline` | string | no |  |  |
| `howTitle` | string | no |  |  |
| `diaryCheck` | string | no |  |  |
| `hospitalityTitle` | string | no |  |  |
| `hospitalityEyebrow` | string | no |  |  |
| `hospitalityHeadline` | string | no |  |  |
| `hospitalityLead` | string \| null | no |  |  |
| `hospitalityBody` | string | no |  |  |
| `hospitalityMetrics` | [Pair](#pair)[] | no |  |  |
| `eventStoryBody` | string \| null | no |  |  |
| `quote` | string | no |  |  |
| `careerHeadline` | string \| null | no |  |  |
| `waysLead` | string \| null | no |  |  |
| `pastEvents` | ([string, string, string])[] \| null | no |  |  |
| `peopleNoun` | string | no |  |  |
| `aboutLead` | string \| null | no |  |  |
| `beyondUrl` | string | no |  |  |
| `beyondLinkText` | string | no |  |  |
| `beyondLead` | string | no |  |  |
| `squadEyebrow` | string | no |  |  |
| `squadHeadline` | string | no |  |  |
| `squadLead` | string | no |  |  |
| `squadLinkText` | string | no |  |  |
| `featuredEyebrow` | string | no |  |  |
| `featuredHeadline` | string | no |  |  |
| `legendNoun` | string | no |  |  |
| `legendsNoun` | string | no |  |  |
| `storyMetrics` | [Pair](#pair)[] | no |  |  |
| `quoteEyebrow` | string | no |  |  |
| `quoteCite` | string | no |  |  |
| `profileQuote` | string | no |  |  |
| `formHeadline` | string | no |  |  |
| `officialLabel` | string \| null | no |  |  |
| `officialLegendLabel` | string \| null | no |  |  |
| `officialFooter` | string | no |  |  |
| `travelsFrom` | string | no |  |  |
| `aboutTitle` | string \| null | no |  |  |
| `consentLine` | string | no |  |  |
| `trustOfficial` | string | no |  |  |
| `trustShortlist` | string | no |  |  |
| `trustManaged` | string | no |  |  |
| `browseEyebrow` | string | no |  |  |
| `homeRolesTitle` | string | no |  |  |
| `waysEyebrow` | string | no |  |  |
| `waysHomeLead` | string | no |  |  |
| `homeFaqTitle` | string | no |  |  |
| `faqLead` | string | no |  |  |
| `howEyebrow` | string | no |  |  |
| `howHeadline` | string | no |  |  |
| `step1Title` | string | no |  |  |
| `step1Text` | string | no |  |  |
| `step2Title` | string | no |  |  |
| `step2Text` | string | no |  |  |
| `step3Title` | string | no |  |  |
| `step3Text` | string | no |  |  |
| `ctaTitle` | string | no |  |  |
| `ctaLead` | string | no |  |  |
| `officialSmall` | string | no |  |  |
| `currentNoun` | string | no |  |  |
| `navLabels` | { legends?, ways?, hospitality?, about? } | no |  |  |

<!-- schema:end -->
