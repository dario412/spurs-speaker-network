# Spurs Speaker Network: agent guide

This repository is the Spurs Speaker Network, a Spurs-only spin-off of PepTalk Appearances: one real site (`src/sites/spurs/`, also the root site). The core still serves many sites, and the tests use fictional partner sites (`test/fixtures/sites.mjs`) to prove the multi-site behaviour (rule 8). Repository and deployment references below describe the upstream project until this one gets its own.

Read `README.md`, `docs/onboarding.md` and `docs/architecture.md` first. This file holds the rules agents (and people) must follow; `AGENTS.md` points here for other runtimes.

## Rules

1. **Run `npm run check` before calling any change done.** It runs lint, content validation, the contract check, the markdown link check, the tests and the typecheck. Look at changed pages with `npm run dev`, and at changed components in `/_gallery/<slug>` on each site. A new component in `components/site/` needs an entry in `components/gallery/entries.tsx` (`test/next/gallery.test.ts` enforces it). For changes to page markup or styles, capture a baseline on `main` with `npm run visual -- --update`, then run `npm run visual` on your branch and check that only the intended pages differ (`docs/architecture.md` → Visual regression check).
2. **Never commit secrets.** Preview passwords live only in Vercel's environment variables. Don't log, print or paste them.
3. **No pushes to `main`.** Work on a branch and open a PR; CI must pass. This repository deploys to Vercel (`docs/deployment.md`); the connected repository is `getapeptalk/peptalk-appearances` and its app is https://peptalk-appearances.vercel.app/. Until the DNS switch described there, the older demo at appearances.getapeptalk.com remains on Railway and is not served from this repository.
4. **One core, many sites.** Structure, form, `<head>`/tracking, behaviour and security are core and change once for every site. Site differences go in `src/sites/<slug>/site.json` (wording, formats, style, layout flags, page switches), never `if (slug === …)` branches. A site that needs something new gets a named, validated, defaulted setting (see `docs/architecture.md` → Core vs site). Write content JSON through `src/sites/store.mjs` (canonical format) when scripting.
5. **Original copy only.** No copied bios, no quotes from or attributed to real people (real or invented), no contested statistics. Leave out medical, legal and personal controversy, and anyone who has died. Verify notes go in the PR description; the validator rejects "(verify…)", TODO and TBC in content. The placeholder testimonials in `vocab.quote` / `profileQuote` are unattributed site-level placeholders.
6. **Marks:** use the organisation's own files, unmodified (no redrawing, recolouring or stretching). Check they load cross-site; fall back to a Wikimedia copy if the CDN blocks embedding.
7. **Images:** Getty comps or licensed files only. Each person must be identifiable; check contact sheets before choosing. Never reuse an image id across people.
8. **Privacy between partners.** One organisation must never see another's pitch: keep the per-site gate intact, and test it (`test/next/proxy.test.ts`, `test/next/app.test.ts`, which run with the fictional sites in `test/fixtures/sites.mjs` beside spurs) when touching `proxy.ts` or `lib/proxy/`.
9. **CSP:** no inline styles in pages (never add `'unsafe-inline'` to `style-src`), and no inline scripts of our own. Pages are prerendered, so Next.js's own inline bootstrap scripts run under `script-src 'self' 'unsafe-inline'` with Trusted Types and SRI (`lib/proxy/csp.ts`). That is safe only because no page renders request data or user content: if one ever does, it needs a nonce (dynamic) policy. Client code builds DOM with DOM calls, never `innerHTML` (Trusted Types blocks it). See `docs/architecture.md` → Rendering and CSP.
10. **Regenerate Open Graph cards** (`npm run og-cards`) when a site's name, theme, hero or section titles change. Commit only the affected site's cards.
11. **Pure refactors change no page.** `npm test` must stay green, and `npm run visual` against a baseline from `main` must show no differences. For deliberate output changes, say in the PR which pages changed.
12. **Two editors, both locked down.** The local admin (`src/admin/`, `npm run admin`) binds to loopback by default (off-loopback requires `ADMIN_PASSWORD`) and is not deployed. The online CMS (`/admin`, `lib/cms/`, [docs/cms.md](docs/cms.md)) is deployed behind its own sign-in: password plus required two-factor code, roles, per-session form tokens, same-origin POSTs, `noindex`, never cached. Keep all of that intact, validate every save with `scripts/validate-content.mjs`, and never expose an editing surface on a site page. Once a content file is saved in the CMS, the database copy wins over the committed file.
13. **Search indexing is a launch switch.** Everything is `noindex` behind the password until a site's `site.json → indexable` is `true` (`docs/content-model.md` → Indexing). Never set it without the launch checklist in `docs/brand-and-legal.md`. SEO and AEO (titles, headings, alt text, structured data, sitemaps) are core: change them in `lib/seo/` and `components/`, never per site, and never mark up the placeholder testimonials as reviews.

## Commands

- `/new-appearances-site <name> [--shell|--populated]`: create a new club, league or association site (`.claude/commands/new-appearances-site.md`).

## Where things are

| Task | Look at |
|---|---|
| Change wording, featured people, layout, demo pages, page switches | `src/sites/<slug>/site.json`, [docs/content-model.md](docs/content-model.md), or `npm run admin` |
| Activate or deactivate a site, change the root site (or none: the landing page at `/`) | `site.json → active`, `registry.json → rootSite` |
| Add or edit a person | `src/sites/<slug>/people.json` (+ `images.json`) |
| Page structure or markup | `components/site/`, `components/landing.tsx`, routes in `app/` |
| Component gallery (every component in each site's branding) | `/_gallery`, `components/gallery/entries.tsx`, `lib/gallery.ts`, [docs/onboarding.md](docs/onboarding.md#component-gallery) |
| Getting started, plugging in a CMS, open decisions | [docs/onboarding.md](docs/onboarding.md) |
| Content loading, publishing switches, provider seams | `lib/content/` |
| Content contract (JSON Schema, field reference), provider conformance | `lib/content/contract/schemas.ts` → `npm run schema`, `schema/`, [docs/content-contract.md](docs/content-contract.md), `test/contract/` |
| Airtable people sync, dry run | `lib/content/airtable/`, `config/airtable.example.json`, [docs/airtable-cms.md](docs/airtable-cms.md) |
| Revalidation webhook, cache tags | `app/api/revalidate/`, `lib/revalidate/`, `lib/content/tags.ts`, `lib/content/cached.ts` |
| Terms and Privacy text (shared by every site) | `src/copy/legal/*.md` |
| New-site scaffolding, writing content files | `src/sites/scaffold.mjs`, `src/sites/store.mjs` |
| Admin app (local) | `src/admin/`, [docs/admin.md](docs/admin.md) |
| CMS (online at /admin: sign-in, 2FA, users, editors, media, Airtable sync) | `lib/cms/`, `app/admin/`, `db/migrations/`, [docs/cms.md](docs/cms.md) |
| Theme, crest, style tokens | `lib/render/theme.ts`, `public/styles.css` |
| Password gate, redirects, headers, CSP, caching | `proxy.ts`, `lib/proxy/` |
| Per-site domains, host routing, canonical URLs | `registry.json → domains`, `lib/domains.ts`, `lib/proxy/decide.ts`, [docs/domains.md](docs/domains.md) |
| Enquiry endpoint and webhook | `lib/enquiry/`, `app/api/enquiry/route.ts`, [docs/vercel.md](docs/vercel.md#enquiry-webhook) |
| Tracking and consent (off by default) | `site.json → tracking` / `consent`, `lib/tracking.ts`, `public/tracking.js` |
| Environment variables, Vercel settings | [docs/vercel.md](docs/vercel.md), `.env.example` (kept complete by `test/next/env.test.ts`) |
| SEO and AEO: titles, structured data, sitemaps, robots, llms.txt, indexing | `lib/seo/`, `lib/pages/metadata.ts`, [docs/architecture.md](docs/architecture.md#seo-and-aeo) |
| Visual regressions after markup or style changes | `npm run visual`, [docs/architecture.md](docs/architecture.md#visual-regression-check) |
| Page speed (measure before and after) | `npm run perf`, `npm run perf:budget` (the CI budgets, `scripts/perf-budgets.json`), `scripts/perf-load.mjs`, [docs/architecture.md](docs/architecture.md#performance) |
| Content rules | `scripts/validate-content.mjs` |
