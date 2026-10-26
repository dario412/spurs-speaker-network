# Agents

This repository is the Spurs Speaker Network, a Spurs-only spin-off of PepTalk Appearances. All agent instructions for it are in [CLAUDE.md](CLAUDE.md); they apply to every runtime (Claude Code, Codex and others).

Reusable workflows live in `.claude/commands/`:

- `new-appearances-site.md`: create a new club, league or association site (shell or populated). Runtimes without slash commands should read and follow the file directly.

Tools a human usually drives, which agents can also use:

- `npm run admin`: the local content admin (`docs/admin.md`). Agents should normally edit the JSON directly, or use `src/sites/store.mjs` from a script.
- `npm run visual`: visual regression check. Capture a baseline on `main` with `npm run visual -- --update` (stored in `.visual/baseline/`, not committed), then run `npm run visual` on your branch after markup or style changes; differing pages get a baseline | current | diff image in `.visual/diff/` (`docs/architecture.md` → Visual regression check).
- `npm run schema`: regenerate the content contract (`schema/*.schema.json`, the field reference in `docs/content-contract.md`) after changing `lib/content/types.ts` and `lib/content/contract/schemas.ts`. `npm run check` fails while they're stale.
- `npm run contract`: the provider conformance suite against the providers the environment selects (a CMS or Airtable base); `npm test` covers the built-in providers offline.
- `npm run airtable:dry-run -- --file <export.csv|json> [--site <slug>]`: map an Airtable export offline and diff it against the current people (`docs/airtable-cms.md`). It needs no API key.
- `npm run perf`: page-load metrics (LCP, CLS, TBT, TTFB, bytes, requests) for home, roster and a profile on the Spurs site, mobile and desktop, against `next build && next start`. `node scripts/perf-load.mjs --origin <url>` measures server TTFB and throughput. Run both before and after performance work (`docs/architecture.md` → Performance).
- `npm run perf:budget`: the CI performance budgets (a network-free `perf` run against `scripts/perf-budgets.json`; exits 1 when over).
- `npm run docs:links`: every relative link and anchor in the markdown resolves (part of `npm run check`).
- `/_gallery/<slug>` (under `npm run dev`): every component in `components/site/` in one site's branding, for checking component changes across sites. New components need an entry in `components/gallery/entries.tsx` (`docs/onboarding.md` → Component gallery).
