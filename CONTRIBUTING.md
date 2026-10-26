# Contributing

## Workflow

1. Branch from `main` (`feature/…`, `fix/…`, `content/<slug>-…`).
2. Make the change, then run `npm run check` (lint, content validation, contract check, markdown links, tests, typecheck) and look at the affected pages with `npm run dev`. For component changes, look at `/_gallery/<slug>` on each site.
3. Open a PR using the template. Keep PRs focused: one site or one feature.
4. CI must pass. Squash-merge. The app deploys to Vercel ([docs/deployment.md](docs/deployment.md)); merging here updates [peptalk-appearances.vercel.app](https://peptalk-appearances.vercel.app/). Until the DNS switch described there, the older demo at appearances.getapeptalk.com remains on Railway and is unaffected.

Never push directly to `main`, and never commit passwords or other secrets.

## Code style

- Next.js 16, React 19 and strict TypeScript for the app (`app/`, `components/`, `lib/`); plain ES modules on Node 24 for the admin and tools (`src/`, `scripts/`). Next.js, React and React DOM are the only runtime dependencies. Think twice before adding one.
- Biome formats and lints everything (`npm run format` fixes most issues). 2 spaces, single quotes, 140 columns.
- Keep components pure: content in, markup out. They are React Server Components, prerendered at build; `components/behaviour.tsx` runs site behaviour, and `components/landing-interactions.tsx` owns hub search, navigation and the email draft form. Let React escape values. The only `dangerouslySetInnerHTML` is the JSON-LD block, which escapes `<`; never add another for content.
- No inline `style=` or `<style>`, and no inline scripts of our own (the CSP blocks styles; see [Rendering and CSP](docs/architecture.md#rendering-and-csp)). Add classes to `public/styles.css`, or per-site rules in `lib/render/theme.ts`.
- Per-site differences belong in data (`site.json`), never in `if (site.slug === …)` code. Core changes (structure, form, `<head>`, tracking) are made once for every site. See [Core vs site](docs/architecture.md#core-vs-site).
- Comments explain *why*, not *what*.

## Tests

- `npm test` runs Node's built-in test runner over `test/*.test.mjs` (admin, content rules, packs, performance budgets), `test/next/*.test.ts` (the app) and `test/contract/*.test.ts` (the content contract and provider conformance). Run one file with `node --test test/next/proxy.test.ts`, or filter with `--test-name-pattern`. `NEXT_TEST_SKIP_BUILD=1` reuses the test builds of `test/next/app.test.ts`.
- Pure refactors must leave every page unchanged: `npm test` green, and `npm run visual` against a baseline from `main` with no differences. For a deliberate output change, say in the PR what changed.
- Bug fixes come with a test that fails without the fix.
- New site-level features need an assertion in `test/next/app.test.ts` (it builds the real app and checks every page through `next start`). Proxy logic gets a unit test in `test/next/proxy.test.ts`.
- New content rules go in `scripts/validate-content.mjs`, with a negative case in `test/content.test.mjs`.
- A new component exported from `components/site/` needs a gallery entry in `components/gallery/entries.tsx`; `test/next/gallery.test.ts` fails without one.

## Content changes

- Follow [docs/adding-a-site.md](docs/adding-a-site.md) and [docs/brand-and-legal.md](docs/brand-and-legal.md).
- Content JSON stays in canonical form (`JSON.stringify(value, null, 2)` plus a newline). The admin and the site tools write it; when editing by hand, keep the 2-space style.
- Facts to verify go in the PR description, never in the JSON.
- Regenerate Open Graph cards (`npm run og-cards`) when a site's name, theme, hero or section titles change, and commit them.

## Commit messages

Conventional style, imperative mood: `feat(spurs): add current players`, `fix(proxy): keep query string on redirects`, `content(spurs): replace featured speaker`, `docs: …`, `chore: …`.
