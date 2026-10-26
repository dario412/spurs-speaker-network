# Research brief (for research agents)

Give this file to each research agent together with its task (which organisation, which bucket of people, which output file). Agents never edit the repository; they write one JSON file to a scratch folder (for example `research/`, which is git-ignored) and report a summary plus a verify list.

## Read first

- `src/sites/spurs/site.json`: a full reference site (vocab, formats, faqOverrides, style, theme, crestOn, marks, home, featured, roles with `squad` and `singular`). `schema/examples/site-populated.json` is a smaller, fictional one.
- `src/sites/spurs/people.json`: the exact person shape.
- `src/copy/defaults.mjs`: wording keys (`VOCAB`), format keys (`keynote, hospitality, brand, clinic, fan, workshop, virtual`) and the FAQ entries (overridden by their `key`).
- [content-model.md](content-model.md): what every field means.

## Output formats

- **Config file** (brand agent): `{ club: {…site.json fields without roles/eras, e.g. orgName, platform, theme…}, roles: [...], eras: [...], legends: [...current players, role "squad"...], images: { "<id>": { "url": "…", "caption": "…" } }, verify: [...] }`
- **People file** (legends agents): `{ legends: [...], images: {...}, verify: [...] }`

Keys starting with `_` in `club` (for example `_sources`) are reviewer notes and are dropped on assembly. Both files feed `npm run assemble-site` (see [adding-a-site.md](adding-a-site.md)).

## 1. Brand

- Fetch the organisation's homepage and main CSS with a desktop Chrome user agent. Report:
  - the most-used colours, with counts, ignoring video-player and widget CSS
  - the CSS colour variables
  - the font families
  - button shape and case
  - heading case
- **Marks:** give absolute URLs for the crest or logo and any wordmark. Test each one in real Chrome from a neutral origin (for example `https://example.com` via `new Image()`). Some CDNs block cross-site loading (`ERR_BLOCKED_BY_ORB`); if so, find an `upload.wikimedia.org` copy that loads. Report the background (transparent or solid) and the colours, then recommend `navMark`, `crestOnLight` and `crestOn`. Never redraw or recolour a mark.
- **Fonts:** never load bespoke or licensed fonts. The `display` stack must end in `'Barlow Condensed','Outfit'` or `'Outfit'`.
- **Names:** use the organisation's own naming conventions and the copyright line from its site footer or legal page. Flag any existing programme with a similar name (for example "NBA Legends" or "MotoGP Legends").

## 2. People

- **Role keys:**
  - `player`: former players, drivers, golfers
  - `squad`: currently active
  - `manager`: managers, team principals, coaches, captains, executives
  - `staff`: engineers, caddies, coaches, broadcasters, officials
  - `women`: the women's game and pioneers. Omit this role only if it genuinely doesn't apply.
- **Mix:** about 30 legends, still relevant to today's fans (pundits, ambassadors, legends-team regulars, icons), plus at least 15 current stars, the most marketable names.
- **Current people:** verify against the official roster or squad page on the day. Use stable facts only: no live stats or standings.
- **Copy:**
  - Original, in your own words. Only facts you are confident of; no contested totals (appearances, goals).
  - No quotes, real or invented.
  - Leave out medical, legal and personal controversy, and anyone who has died.
  - Legends get three bio paragraphs; current people get two.
- **`limited`:** `true` for anyone currently competing or in a major current job. It is always `true` for `squad`.
- **Field counts:** `stats` exactly four `[value, caption]` pairs; `timeline` 4–5 entries; `talks` 5; `audiences` 4; `industries` 4; `formats` 3–4.

## 3. Images

- **Source:** Getty watermarked comps (concept only), from `https://www.gettyimages.co.uk/search/2/image?phrase=<query>&sort=best` with a desktop user agent. Try `sort=mostpopular` if results drift off-topic. Extract `https://media.gettyimages.com/id/<id>/photo/…` URLs, unescaping `&` and `&amp;`.
- **Per person:** a hero, a card (face visible) and three gallery images. Each must clearly show the person in the right context (kit, venue, paddock). No image id may be reused across people.
- **Homepage:**
  - a hero: an iconic, landscape celebration of the biggest retired name. Note where the face is; set `tag: "br"` if the name card would cover it.
  - an inset: a manager or team boss
  - an image for each role tile
  - an era image, an image for the homepage "Event story" module (`home.storyImage`) and a hospitality image
- **Contact sheets:** build them (ImageMagick `montage -label '%f' -tile 3x2 -geometry 400x300+6+6`) and look at them before choosing. Reject wrong people with the same name, injury shots and pictures of rival-team kit.

## 4. Verify list

List everything that needs a human check before launch:
- facts you are not certain of
- current jobs (these decide `limited`)
- naming conflicts
- people left out on purpose, and why
- image concerns

The verify list goes into the PR description, never into content files: the validator rejects "(verify …)" notes.
