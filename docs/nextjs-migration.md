# Next.js: the decisions behind the app

In October 2026 the sites moved from a zero-dependency static generator to **Next.js (App Router) on Vercel**, so that a developer who already runs Next.js on Vercel (crediblecreators.com) can own the code and plug in a CMS. Nothing of the old generator remains in this repository. This page records the decisions taken on the way that still shape the code; [architecture.md](architecture.md) describes the system as it is.

Versions: **Next.js 16.4.2**, **React 19.3.1**, TypeScript 7.0.2 (strict), Node 24, checked against the official docs on 2026-10-19 (sources at the end).

**Deployment.** The new repository, [getapeptalk/peptalk-appearances](https://github.com/getapeptalk/peptalk-appearances), is connected to Vercel and serves [peptalk-appearances.vercel.app](https://peptalk-appearances.vercel.app/). The older `appearances.getapeptalk.com` hostname still serves Railway ([verified status](deployment.md#current-demo-until-the-switch)).

**Status.** Built: the app, the content layer with provider seams, the content contract and conformance suite, the Airtable people sync, on-demand revalidation and per-site domains. To do: the CMS provider ([content-contract.md](content-contract.md#running-it-against-your-cms)) and moving the live demo's hostname to Vercel ([deployment.md](deployment.md)).

## Routes

```
app/[site]/layout.tsx                root layout per site: <html lang>, body class, theme stylesheet, font preloads, tracking slot
app/[site]/page.tsx                  home (demoHome -> look-only)
app/[site]/legends/page.tsx          roster
app/[site]/legends/[person]/page.tsx profile (demoProfiles -> look-only)
app/[site]/{ways-to-book,hospitality,about}/page.tsx   optional pages (site.json pages)
app/[site]/check-availability/page.tsx
app/[site]/{terms,privacy}/page.tsx  legal pages in the site's branding
app/[site]/site.css/route.ts         per-site theme
app/[site]/{sitemap.xml,llms.txt,robots.txt}   per-site crawler files (robots.txt only on the site's own domain)
app/(landing)/layout.tsx, page.tsx   root layout and the PepTalk landing page at / (master password only)
app/all/sitemap.xml                  the hub's sitemap
app/(hub)/layout.tsx                 root layout for the hub legal pages
app/(hub)/{terms,privacy}/page.tsx   hub legal pages
app/gallery--internal/               the component gallery, served at /_gallery (lib/gallery.ts)
app/landing.css/route.ts             landing theme
app/sitemap.xml, app/llms.txt, app/robots.ts   hub crawler files
app/global-not-found.tsx             the 404 page for every root layout
app/health/route.ts                  { status, revision }
app/api/enquiry/route.ts             POST: the enquiry form (lib/enquiry/)
app/api/revalidate/route.ts          POST: the CMS and Airtable webhook (lib/revalidate/)
proxy.ts                             host routing, gate, redirects, headers, CSP, X-Robots-Tag, Cache-Control, 404 rewrites
```

The `[site]` segment is a slug or `<slug>--domain`, the copy served on a site's own domain ([domains.md](domains.md#decision-a-domain-mount-per-site-prerendered-2026-10-20)).

## Content layer

- `lib/content/types.ts`: `Registry`, `SiteConfig`, `RawSite` (as stored), `Site` (as published), `Person`, `Vocab`, `LegalDoc` and friends.
- `lib/content/provider.ts`: the `ContentProvider` and `PeopleProvider` interfaces.
- `lib/content/select.ts`: picks providers from `CONTENT_PROVIDER=json|cms` and `PEOPLE_PROVIDER=json|airtable` (both default `json`); `withPeople()` swaps in a people provider's people and images, then re-applies the publishing switches. `lib/content/index.ts` wraps the result in the tagged cache layer for revalidation.
- `lib/content/json-provider.ts` reads `src/sites/**` and `src/copy/legal/*.md` in place, so the admin, the validator and the site tools keep working on the same files. The paths are dynamic, so `next.config.ts` adds them to the deployment (`outputFileTracingIncludes`).
- `lib/content/publish.ts` applies the switches exactly as `src/sites/index.mjs` (the loader the admin, the validator and the site tools use) does; `test/next/content.test.ts` asserts the published sites are equal.
- `lib/content/cms-provider.ts` is a documented stub that rejects with "not implemented yet"; `lib/content/airtable-provider.ts` is implemented ([airtable-cms.md](airtable-cms.md)).

Validation stays in `scripts/validate-content.mjs`. The Airtable sync runs those rules on every record, and the conformance suite (`test/contract/provider-conformance.ts`) runs them on any provider's output ([content-contract.md](content-contract.md)).

## Decisions

### CSP and rendering: static pages

The first Next.js build used the nonce recipe from the [official CSP guide](https://nextjs.org/docs/app/guides/content-security-policy), which renders every page on request. Every page is now **prerendered at build time** and served from the CDN, with a static CSP: `script-src 'self' 'unsafe-inline'`, Trusted Types (`require-trusted-types-for 'script'; trusted-types 'none'`) and SRI on framework chunks (`experimental.sri`). Styles stay `'self'` only. Measurements, the security trade-off and the mechanics: [architecture.md → Rendering and CSP](architecture.md#rendering-and-csp).

`next dev` adds `'unsafe-eval'` and `style-src 'unsafe-inline'`, and leaves Trusted Types off, because its tooling needs them. Pages still carry no inline styles (no `style=""` attributes and no `<style>`; the integration test checks). JSON-LD is a non-executed data block. Only `GET` and `HEAD` are allowed (plus the two `POST` routes), which blocks Server Actions; the app has none.

### Proxy (formerly middleware)

Next 16 renamed `middleware.ts` to **`proxy.ts`**; it runs on the Node.js runtime ([docs](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)). The logic lives in `lib/proxy/decide.ts` as a pure function, unit-tested in `test/next/proxy.test.ts`; the order of its checks is in [architecture.md → Request flow](architecture.md#request-flow) and the gate's rules in [architecture.md → Password gate](architecture.md#password-gate).

- **Constant-time passwords.** HTTP Basic, any username; the supplied password and each secret are hashed with SHA-256 through **Web Crypto** and the digests compared in constant time (`lib/proxy/gate.ts`).
- **Fail closed.** A proxy can't refuse to start, so production without `PREVIEW_PASSWORD` answers **503** with a clear message, `/health` included (`{"status":"misconfigured"}`). `PREVIEW_PUBLIC=true` opts out. On Vercel, `NODE_ENV` is `production` for previews too, so every deployment needs the password or the opt-out.
- **Matcher.** Everything except `/_next/static`: hashed framework chunks hold no partner content, so a site-password holder can load them, and `next.config.ts` `headers()` still adds the static security headers there. `/_next/image` is matched, so the image optimizer is gated like the pages.
- **Server-rendered 404s.** In Next.js 16.4, a `notFound()` thrown while a page renders answers 404 but sends an empty error shell and leaves the not-found UI to client-side rendering (reproduced with a minimal layout, under Turbopack and webpack), so no-JS clients would see a blank page. The proxy therefore rewrites any page-shaped path that isn't a known page to a URL that matches no route (`NOT_FOUND_REWRITE`), and Next.js server-renders `app/global-not-found.tsx` with a 404. Known pages come from the build manifest. Every `[site]` route also sets `dynamicParams = false` and still calls `notFound()` as a second line of defence. Caveat: a self-hosted `next start -H <ip>` treats that rewrite as an external URL (`localhost:<port>`) and fails to proxy it; Vercel and plain `next start` serve it internally.
- **Build-time manifest.** The proxy needs the root site, redirects, published slugs, page paths, image hosts, Open Graph cards, domains and which sites load tags. `next.config.ts` computes them from the content provider and inlines them as `APPEARANCES_MANIFEST` (`lib/manifest.ts`). Revalidation refreshes existing pages without a deploy, but the manifest stays per build: new sites, people, redirects, domains and image hosts need a deploy ([content-contract.md → What still needs a deploy](content-contract.md#what-still-needs-a-deploy)).

### Theme CSS and images

- **`/<slug>/site.css`** holds the theme variables and crest treatment; **`/landing.css`** serves the landing page. Both are route handlers over `lib/render/theme.ts`, prerendered at build (`force-static`), gated by the proxy, and linked with a content hash (`?v=`).
- **Photos** are `<img>` elements through the Next.js image optimizer (`getImageProps()`, without its inline style), not CSS backgrounds. The decision, sizes and cost: [architecture.md → Images](architecture.md#images).
- **R2 URLs** (Airtable, licensed files) are keyed by host and path in `images`. `images.remotePatterns` and the CSP are built from the content's hosts plus `IMAGE_HOSTS_EXTRA`.

### Behaviour script

Running a DOM script alongside React would race hydration (for example, changing the shortlist button text before React hydrates, causing a mismatch and a client re-render). So the behaviour lives in `lib/behaviour.ts`, started by a small client component (`components/behaviour.tsx`) in `useEffect`, after hydration, and its listeners are cleaned up, so React StrictMode's double effect in dev doesn't double them. It handles the menu toggle, roster filters held in the URL (`history.replaceState`, keeping Next's history state), the shortlist in `localStorage`, and enquiry validation and submission ([architecture.md → Enquiry form](architecture.md#enquiry-form)).

Links are plain `<a>`, not `next/link`, so every navigation is a full page load.

### Demo mode

`demoHome` / `demoProfiles` render as a component-level mode (`ctx.demo`): links drop `href` and get `aria-disabled`, forms drop `action` and `method`, controls are `disabled`, FAQ `<details>` become static blocks, the behaviour component isn't mounted, and the content is wrapped in `div.demo`. Next.js's own framework scripts are still on the page (an App Router page can't opt out of them); they do nothing there.

### Content text and escaping

Content strings are trusted text written in the JSON; in practice the only markup in them is `&amp;`. The render context decodes character references once and React escapes the result, so nothing is injected as HTML. A content value containing real tags shows them as text.

### Metadata

The Metadata API emits title, description, canonical, Open Graph (including `og:type=profile` on profiles and image size on cards), Twitter, robots and referrer tags, and the icon (the site's crest).
- `htmlLimitedBots: /.*/` keeps metadata in `<head>` rather than streamed into `<body>`.
- JSON-LD is one `<script type="application/ld+json">` `@graph` at the top of `<body>` (`lib/seo/jsonld.ts`; [architecture.md → SEO and AEO](architecture.md#seo-and-aeo)). Titles and descriptions come from `lib/seo/copy.ts`; robots follow the indexing switch.
- The origin comes from `lib/origin.ts` and is fixed at build time: `PUBLIC_ORIGIN` (ignored with an error if it isn't an `http(s)` origin), else `https://$VERCEL_PROJECT_PRODUCTION_URL`, else the hub. Preview deployments therefore point canonicals at production. The request's `Host` and `X-Forwarded-Host` are never read by pages.

### Tooling

- **npm**, **Biome** for lint and format (Next 16 removed `next lint`), **Node 24** (`.nvmrc`, `engines: 24.x`, which Vercel honours).
- **TypeScript strict** with explicit `.ts` import extensions (`allowImportingTsExtensions`), so the tests import `lib/` directly with Node's built-in type stripping and need no test tooling.
- **No `vercel.json`.** Vercel detects Next.js, the Node version comes from `engines`, and headers live in the proxy and `next.config.ts`.

## What visitors will notice when the live demo switches

The live demo still runs the earlier generator until the switch in [deployment.md](deployment.md). Compared with it, this app has:
- **New elements:** the footer's "Terms · Privacy" links, the enquiry consent line, the profile "At a glance" summary, and visually hidden text that makes links and headings descriptive.
- **New pages:** Terms and Privacy, per site and on the hub.
- **Reworded:** footer headings ("Book a speaker", "About the platform"), the Ways to book `h1` ("Ways to book Spurs speakers"), the about page's heading ("About <platform>") and "Who runs the platform".
- **Rewritten meta tags:** unique, budgeted titles and descriptions and their Open Graph and Twitter copies, `og:image:alt`, `og:locale`, and `referrer` (`strict-origin-when-cross-origin`).
- **Behaviour:** absolute redirect `Location` headers; `/spurs/` (trailing slash) answers 308 to `/spurs`; photos are resized WebP `<img>` elements; the enquiry form posts to `/api/enquiry` and works without JavaScript; the 404 page has no canonical URL.

## Sources (read 2026-10-19)

- Proxy: https://nextjs.org/docs/app/api-reference/file-conventions/proxy and the upgrade guide https://nextjs.org/docs/app/guides/upgrading/version-16
- CSP: https://nextjs.org/docs/app/guides/content-security-policy
- Pages, layouts, route handlers, async `params`, `PageProps` / `RouteContext`: https://nextjs.org/docs/app/api-reference/file-conventions/page, …/layout, …/route
- `generateStaticParams`, segment config, Cache Components: https://nextjs.org/docs/app/api-reference/functions/generate-static-params, https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config, https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents
- Metadata and JSON-LD: https://nextjs.org/docs/app/api-reference/functions/generate-metadata, https://nextjs.org/docs/app/guides/json-ld
- `notFound`, `not-found.tsx`: https://nextjs.org/docs/app/api-reference/functions/not-found, https://nextjs.org/docs/app/api-reference/file-conventions/not-found
- `robots.ts`: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
- Caching: https://nextjs.org/docs/app/api-reference/functions/revalidateTag, https://nextjs.org/docs/app/api-reference/directives/use-cache
- Release notes: https://nextjs.org/blog/next-16, https://nextjs.org/blog/next-16-4
- `headers()`: https://nextjs.org/docs/app/api-reference/config/next-config-js/headers
- `next/image`: https://nextjs.org/docs/app/api-reference/components/image
- Vercel Node versions and system env vars: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions, https://vercel.com/docs/environment-variables/system-environment-variables
