# Adding a club, league or association

Every site lives in `src/sites/<slug>/` and is registered in `src/sites/registry.json`. There are two ways to create one.

| | Shell | Populated |
|---|---|---|
| What you get | Real name, colours and marks; six placeholder people; placeholder photos | About 30 legends plus 15 or more current stars, original bios, Getty photos |
| Effort | Under an hour, mostly finding the brand | Half a day, mostly research agents running in parallel |
| Use it for | A first look with a partner | A partner demo or launch candidate |
| Command | Admin "New site" form, or `npm run new-site` | Research brief, then `npm run assemble-site` |

In Claude Code, `/new-appearances-site <name> [--shell|--populated]` runs either flow end to end. Add `--pack` to have it finish with a **site pack** (`<slug>.site-pack.zip`) instead of a commit; a human then uploads it in the admin (Sites → **Upload a site pack**), reviews, previews and imports it. `npm run new-site … --pack` and `npm run assemble-site … --pack` do the same by hand, and `npm run import-pack` imports from the command line. Details: [site-packs.md](site-packs.md).

## Before you start

1. **Confirm the relationship.** The sites say "official". Only build one for an organisation PepTalk is pitching or partnered with, and keep it behind the password.
2. **Pick the slug:** short, lowercase letters and digits (`f1`, `thefa`, `pga`). Hyphens work but are best avoided. The slug becomes the URL and the `PREVIEW_PASSWORD_<SLUG>` variable, with hyphens turned into underscores.
3. **Find the brand** on the organisation's own website (see [research-brief.md](research-brief.md) §1): primary colours, logo files, button and heading style. Check the logo loads from another site (several CDNs block embedding); use a Wikimedia copy if needed.

## Shell site

Use the admin (`npm run admin`, then **New site**) or the command line:

```bash
npm run new-site -- --slug wimbledon --name "The All England Club" --short Wimbledon \
  --brand "#006633" --ink "#1b1b1b" --dark "#006633" --bar "#4b0082" \
  --wordmark "https://…/logo.svg" [--crest "https://…/crest.png"] [--root]
npm run dev   # open http://localhost:3000/wimbledon
```

- `--root` makes `/` redirect to this site (by default `/` is the PepTalk landing page, and `/all` answers `301` to it).
- `--force` overwrites an existing folder.
- `--from research/<slug>-config.json` takes the brand from a research-brief config instead of flags.
- The site gets `"status": "shell"`, which lets the validator accept null images and placeholder copy.

Then edit the wording (`vocab`), roles and eras in the admin or in `site.json` (see [content-model.md](content-model.md)).

Until you run `npm run og-cards`, the new site's link previews use the generic PepTalk card (`/og/appearances.jpg`).

## Populated site

1. **Research.** Brief agents with [research-brief.md](research-brief.md), splitting the work so they never overlap. The proven split:
   - Agent A: brand and config, plus the current squad (15 or more), written to `research/<slug>-config.json`.
   - Agent B: about 30 legends (former players, managers, staff, women's game), written to `research/<slug>-legends.json`.

   `research/` is gitignored.
   - Big rosters work better with two legend agents split by era (for example pre-2000 vs post-2000), each writing its own file.
2. **Assemble.**
   ```bash
   npm run assemble-site -- --slug f1 --config research/f1-config.json \
     --people research/f1-legends.json [--people research/f1-more.json] \
     [--era-map turbo=classic,v8=v10] [--root]
   ```
   The command:
   - merges the files and maps mismatched era keys
   - strips stray "(verify …)" and "(TBC …)" notes from people, and drops `_`-prefixed reviewer keys from the config
   - ignores a `stories` array if an older research config still has one (stories were removed), and says so
   - keeps only the images in use
   - validates, then writes `site.json`, `people.json` and `images.json`

   Nothing is written if validation fails. Re-running overwrites the site.
3. **Look at it.** `npm run dev`, then check the home page, the roster, two or three profiles and mobile width:
   - The hero name card must not cover a face; use `home.hero.tag: "br"` to move it.
   - Every person must be identifiable in their photos.
   - Logos must not be stretched or recoloured.
4. **Cards.** Run `npm run og-cards`. It re-renders every card, so commit only `public/og/<slug>*.jpg` and discard incidental changes to other sites' cards.
5. **Check and PR.** Run `npm run check`. Open a PR that lists the agents' verify items: facts to confirm, people's current jobs (these set `limited`), naming conflicts with the organisation's own programmes, and anything left out on purpose.
6. **Access.** Set `PREVIEW_PASSWORD_<SLUG>` in the Vercel project's environment variables (then redeploy) if the partner should only see their own site ([deployment.md](deployment.md)).

## Manual edits that come up often

| Change | Where |
|---|---|
| Take a site offline, or bring it back | `site.json → active` (admin: dashboard toggle) |
| Hide an optional page | `site.json → pages` (`waysToBook`, `hospitality`, `about`) |
| Hide a person without deleting them | `"active": false` on the entry |
| Replace a person in "Featured this season" | `site.json → featured` (slugs from `people.json`) |
| Hero or inset person | `site.json → home.hero` / `home.inset` (`image`, `name`, `line`, `tag`) |
| Section order, or hiding the eras module | `site.json → homeLayout` (`{ "waysAfterRoles": true, "hideEras": true }`) |
| Make a page a non-clickable demo | `site.json → demoHome: true`, `demoProfiles: ["slug"]` |
| Wording | `site.json → vocab` (any `VOCAB` key from `src/copy/defaults.mjs`, plus `officialSmall` and `currentNoun`) |
| Format copy | `site.json → formats.<key>` (`title`, `short`, `desc`, `items`) |
| An FAQ entry | `site.json → faqOverrides`, keyed by the FAQ entry's `key` in `src/copy/defaults.mjs`: `"cost": "new answer"` or `"cost": { "q": "…", "a": "…" }` |
| Rename a site's URL | Rename the folder and slug, add `"old": "new"` to `registry.json → redirects`, re-render cards |
| Remove a person | Delete them from `people.json`, and from `featured` and `home` if referenced (the validator will flag any you miss) |

## Checklist

- [ ] `npm run check` passes
- [ ] Pages reviewed at desktop and mobile width; faces visible; marks undistorted
- [ ] Cards regenerated; only this site's cards committed
- [ ] Verify list in the PR; no review notes in content files
- [ ] Copy is original (no copied bios, no invented quotes); sensitive personal, legal or medical topics left out
- [ ] Per page and per profile: work through the admin's **Verification** tab (`npm run admin` → site → Verification). It lists every built page and profile with its checklist (photos, facts, availability, original copy, sensitive topics, consent, formats). Missing checks don't block the PR, but `npm run validate` reports `n/N pages and profiles verified`, and launch needs `npm run validate -- --strict`.
- [ ] Pictures and marks: tick what is licensed in the admin's **Licences** tab (comps stay unlicensed until replaced)
