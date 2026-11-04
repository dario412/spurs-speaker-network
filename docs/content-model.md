# Content model

Each site is three JSON files in `src/sites/<slug>/`, plus optional `licences.json` (licence approvals) and `verification.json` (verification checklists). Neither is ever rendered. `npm run validate` enforces the rules below (`scripts/validate-content.mjs`). The admin (`npm run admin`) edits the same files and runs the same validator before every save.

The files have one canonical format: `JSON.stringify(value, null, 2)` plus a trailing newline. The site tools and the admin write it, so diffs stay minimal. Biome does not reformat these files.

These files are one source of content. A CMS can supply the same shapes, and people can come from Airtable. Whatever the source, the shapes are defined once in [content-contract.md](content-contract.md): JSON Schema in `schema/`, generated from `lib/content/contract/schemas.ts`, which the typecheck ties to `lib/content/types.ts`. The contract page also covers required fields, defaults, image ids, errors and revalidation, and has a generated field reference. This page covers the JSON files and the editorial rules.

Terms (organisation, site, platform, person, legend, current player, hub) are defined in the [glossary](onboarding.md#glossary).

## registry.json

| Field | Notes |
|---|---|
| `order` | Every site folder, in landing-page order (inactive sites included) |
| `rootSite` | Optional. Where `/` on the hub redirects; must be an active site in `order`. Absent (the default): `/` serves the PepTalk landing page and `/all` answers `301` to `/`. Set: `/` redirects (`302`) there and the landing page stays at `/all`. A site's own domain always serves that site at `/`. |
| `redirects` | `{ "old-slug": "new-slug" }`; pages and Open Graph cards answer `301` |
| `indexable` | Optional boolean, default `false`. Lets search engines index the hub pages (the landing page, `/terms`, `/privacy`): robots meta, robots.txt, `/all/sitemap.xml` (which lists the landing page at `/`, or `/all` with a root site), `/llms.txt`, and those pages no longer need a password. See [Indexing](#indexing-the-launch-switch). |
| `domains` | Optional. `{ "<slug>": { "primary": "spurslegends.com", "aliases": ["www.spurslegends.com"], "live": false } }`: the site is also served at the root of its own domain; aliases answer `301` to `primary`; once `live` is `true`, its hub folder answers `301` to the domain and canonical, Open Graph, sitemap and llms.txt URLs use the domain. Validated: lowercase hostnames (no scheme, port or path), each host owned by one site, never the hub's host, and every slug in `order`. See [domains.md](domains.md). |

## site.json

| Field | Type | Notes |
|---|---|---|
| `slug` | string | URL folder; lowercase letters, digits, hyphens (never two in a row: `--` marks a domain mount). Reserved: `all`, `api`, `health`, `og`, `fonts`, `peptalk`, `terms`, `privacy`, `robots`, `sitemap`. |
| `active` | boolean? | `false` leaves the whole site out of the build: its URLs 404 and it disappears from the landing page. Default `true`. |
| `indexable` | boolean? | The **search launch switch**, default `false`. See [Indexing](#indexing-the-launch-switch). Rejected on shell sites and while `demoHome` or `demoProfiles` are set. |
| `lang` | `"en-GB"` \| `"en-US"`? | Content language, default `en-GB`. Sets `<html lang>`, `og:locale` and `inLanguage` in structured data. US organisations use `en-US`. |
| `pages` | object? | Optional pages, each `true` by default: `waysToBook`, `hospitality`, `about`. A page set to `false` is not built, and every nav, footer and homepage link to it is removed. Home, roster, profiles and the enquiry page always exist. |
| `status` | `"shell"`? | Present only on shell sites; allows null images and placeholder copy |
| `short` | string | Short name used in copy ("Spurs", "F1") |
| `orgName` | string | Organisation name ("Tottenham Hotspur", "The FA") |
| `platform` / `platformShort` | string | Site name ("Spurs Speaker Network") and nav short form |
| `tagline` | string | Utility-bar text |
| `entity` | string | One-sentence description ("The Spurs Speaker Network is the official Tottenham Hotspur speaker booking service, operated by PepTalk."). The site's entity sentence everywhere: footer, About lead, home meta description, WebSite description in JSON-LD and llms.txt. Keep it factual: answer engines quote it. |
| `motto` | string \| null | Footer, if the organisation has an official one |
| `copyright` | string | Rights holder's legal name, as on their site |
| `heroTitle` | [string, string] | The two hero headline lines |
| `heroWords` | string[]? | Words the last word of `heroTitle[0]` cycles through on the home hero (`["legend", "coach", "manager", "analyst"]`). The first must end `heroTitle[0]`: it is the word crawlers and screen readers get. The animation is timed for four words and stops for visitors who prefer reduced motion. |
| `waysTitle` | string | "Ways to book" heading |
| `stadium` | string | Venue used in copy ("Tottenham Hotspur Stadium", "the MotoGP paddock") |
| `marks` | `{ crest, wordmark }` | https URLs; never redrawn or recoloured |
| `navMark` | `"wordmark"` \| `"crest"` | What sits in the nav |
| `crestOnLight` | boolean | Crest artwork works on white (transparent background) |
| `crestOn` | `{ bar, brand, dark }` | Per surface: `"full"`, `"white"` (single colour) or `"hide"`. Only applies when `crestOnLight` is `true`. |
| `crestFallback` | string | Text badge when no embeddable crest exists |
| `theme` | object | `brand`, `ink`, `dark`, `bar` (#hex), `display` (font stack ending in a bundled font). Optional neutrals: set `tint`, `line`, `muted` and `mutedDark` together (all four), plus optional `faint` (defaults to `muted`). |
| `style` | object | `buttonRadius` (default `999px`), `buttonCase` (`none`), `buttonClip` (chamfered corners, off), `headingCase` (`uppercase`), `headingStyle` (`normal`), `cardRadius` (`16px`) |
| `cspHosts` | string[] | Origins the marks load from (added to the image CSP) |
| `orgType` | string | Structured-data type of the rights holder: `SportsTeam` (default, clubs) or `SportsOrganization` (leagues, associations, championships). Validated. |
| `featured` | slug[] | People in "Featured this season": one or more active person slugs (six is an editorial convention, not a validation limit) |
| `home` | object | `hero` / `inset` (`image`, `name`, `line`, optional `tag: "br"`), `eraImage`, `storyImage` (the homepage "Event story" picture), `hospitalityImage`, `activeEra`; optional `slides` (more `{ image, name, line }` slots after `hero`: the hero photo becomes a carousel that advances every six seconds) and `aboutImage` (the photo beside the about page's speaker introduction) |
| `homeLayout` | object | `waysAfterRoles`, `hideEras` |
| `demoHome` / `demoProfiles` | boolean / slug[] | Render those pages as non-interactive demos |
| `tracking` | `{ gtmId?, ga4Id? }`? | Analytics tags, **off by default**. `gtmId` must look like `GTM-XXXXXXX`, `ga4Id` like `G-XXXXXXXXXX`; nothing else is accepted. Loaded by the one shared tracking script (`public/tracking.js`, added only to that site's pages); the CSP allows Google's tag hosts only for sites with tags. A site without its own ids uses the `TRACKING_GTM_ID` environment fallback, if set. See [architecture.md → Tracking and consent](architecture.md#tracking-and-consent). |
| `consent` | `{ required? }`? | `required: true` shows the consent banner and loads tags only after the visitor accepts (a first-party `pa_consent` cookie, six months). Default `false`: tags, if any, load straight away. **The banner's wording and whether a site needs it are placeholders: get legal review before switching tracking on for a site with visitors in the UK or EU.** |
| `vocab` | object | Wording overrides (keys below) |
| `formats` | object | Per-format overrides of `title`, `short`, `desc`, `items` |
| `formatKeys` | string[]? | The formats the site offers, in display order (default: the seven original formats). Every person's `formats` must be in this list. Spurs offers `keynote`, `dinner` (after-dinner speaking), `appearance` (launches, shoots, Q&As, signings, guest visits), `workshop` and `virtual`. |
| `contact` | `{ email?, phone?, hours? }`? | Contact details under the footer's brand column; each line shows only when set. Use real, confirmed details only. |
| `faqOverrides` | object | Keyed by the FAQ entry's `key` in `src/copy/defaults.mjs`: `"cost": "new answer"` or `"cost": { "q": "…", "a": "…" }`. Placeholders: `{org}` is the organisation name; `{first|fallback}` is the person's first name on profiles and the fallback text on the about page. |
| `roles` | array | `{ key, label, blurb, image, singular, pitch? }`; `key` is one of `player`, `manager`, `staff`, `women`, `squad` (current players). Optional `pitch` (`{ eyebrow, heading, lead, points: [{ title, text }] }`) replaces the category page's popular-topics section with a "why book" section. |
| `eras` | array | `{ key, label, blurb }` |
| `stories` | (not allowed) | A feature that no longer exists. A leftover `stories` key (or `pages.stories`) is a validation error: delete it. |

## people.json

An array of people (legends and current players). With `PEOPLE_PROVIDER=airtable`, the sites listed in the Airtable config take their people from Airtable instead, mapped to exactly these fields ([airtable-cms.md](airtable-cms.md)):

| Field | Notes |
|---|---|
| `slug`, `name`, `first` | `first` is used in "Check Thierry's availability" |
| `active` | Optional; `false` hides the profile and removes the person from every list. Hidden people cannot be featured. |
| `role`, `roleLabel`, `era` | `role` and `era` must exist in `site.json` |
| `limited` | `true` for anyone in a current playing or major job (always true for `squad`) |
| `hero`, `card`, `gallery[3]` | Image ids from `images.json`; the card should show the face |
| `pos`, `short`, `honour`, `line` | Profile and card lines |
| `stats` | Exactly four `[value, caption]` pairs; stable facts only |
| `bio[]`, `why`, `timeline[[year, text]]` | Original copy, no quotes, no contested numbers |
| `talks[]`, `audiences[]`, `industries[]`, `formats[]`, `langs` | `formats` use the site's format keys (`site.json → formatKeys`); `talks` also feed the roster's topic filter |
| `travelsFrom` | Optional; defaults to `vocab.travelsFrom` |
| `sameAs` | Optional list of up to 10 https URLs of the person's official profiles elsewhere (their page on the organisation's site, Wikipedia, Wikidata, verified social accounts). Emitted as `Person.sameAs` in the profile's structured data, which ties the profile to the same real-world entity for search and answer engines. Empty by default; only add pages that are definitely about this person. Validated (https, unique). |

The validator rejects any other key in `people.json`, and any key in `site.json` that isn't listed above, so a site cannot quietly gain a setting the others don't have.

## Indexing (the launch switch)

Everything is `noindex` behind the password today, and stays that way until a site's `indexable` is set to `true`. That one flag, read through `lib/seo/indexing.ts`, switches on together:

| | `indexable: false` (default) | `indexable: true` |
|---|---|---|
| `<meta name="robots">` | `noindex, nofollow` | `index, follow, max-image-preview:large` (demo pages and placeholder legal pages stay `noindex`) |
| `X-Robots-Tag` header | `noindex, nofollow` | not sent |
| Password gate | per-site or master password | the site's pages are public; other sites keep their gate |
| `robots.txt` | `Disallow: /` | `Allow: /<slug>/` plus the shared assets, and a `Sitemap:` line |
| `/sitemap.xml` (index) and `/<slug>/sitemap.xml` | empty | the site's built pages (no demo pages, hidden people or switched-off pages) |
| `/<slug>/llms.txt` | 404 | served |
| Concept banner | shown | hidden |

With a domain (`registry.json → domains`), "the site's pages" means the canonical copy: the hub folder until `live`, then the domain. The other copy is always `noindex` and points its canonical at the canonical copy; robots.txt, the sitemap and llms.txt of a live site are on its domain (`/robots.txt`, `/sitemap.xml`, `/llms.txt` there), and the hub's sitemap index leaves it out.

Two guards override the content: a Vercel **preview** deployment (`VERCEL_ENV=preview`) never indexes, and `SEARCH_INDEXING=off` switches indexing off everywhere (the kill switch; redeploy to apply). Launch steps: [brand-and-legal.md → Launch SEO checklist](brand-and-legal.md#launch-seo-checklist).

## images.json

`{ "<image id>": "<https url>" }`. Only images referenced by the site are kept (`assemble-site` prunes the rest).

- **Getty comps** (today): the id is the Getty id, e.g. `"2206513784"`.
- **Cloudflare R2 or another CDN** (licensed files, Airtable): the id is the URL's host and path without the query string, e.g. `"media.example.com/people/dele-alli-hero.jpg"` (`imageIdFor()` in `lib/content/image-ids.ts`).

URLs must be stable https links. Airtable attachment URLs expire, so they are rejected. Image hosts are allowed in `next/image` and the CSP automatically when they appear in the content at build time. Add hosts that may appear later to `IMAGE_HOSTS_EXTRA` ([content-contract.md → Image ids and hosts](content-contract.md#image-ids-and-hosts)).

## licences.json

Optional. It records which pictures and marks are licensed, and is written by the admin's **Licences** tab. It never reaches the renderer: `publishable()` drops it, so pages don't depend on it. A site with no approvals has no file.

```json
{
  "images": { "2206513784": { "url": "https://media.gettyimages.com/id/2206513784/…", "note": "Getty licence #…", "approvedAt": "2026-10-19" } },
  "marks": { "crest": { "url": "https://…/crest.png", "note": "Club brand pack", "approvedAt": "2026-10-19" } }
}
```

| Field | Notes |
|---|---|
| `images.<id>` | An id from `images.json` |
| `marks.crest`, `marks.wordmark` | Only for marks the site sets in `site.json → marks` |
| `url` | The https URL that was approved. The asset counts as licensed only while this equals the URL in use now. If the image or mark URL changes, the approval is **changed since approval** (stale) until re-approved. For R2 images the id itself comes from the URL, so a photo replaced at a new URL is a new id with no approval yet. |
| `note` | Optional free text: licence number, source, renewal date (internal; never rendered, so "TBC" is fine here) |
| `approvedAt` | `YYYY-MM-DD` (London date) of the approval |

What counts: every entry in `images.json` plus the crest and wordmark when set. Shell sites' `null` placeholder images don't count. `licenceStatus(site)` in `src/sites/licences.mjs` computes `{ total, approved, missing, stale }` for the validator and the admin.

Validation:

- **Errors** (`npm run validate` fails, and the admin refuses to save): a malformed shape, unknown keys or fields, ids not in `images.json`, marks the site doesn't use, non-https URLs, bad dates.
- **Warnings only:** missing or stale approvals. The validator prints one line per site, such as `spurs: 12/243 assets licensed (3 changed since approval)`, and still exits 0.
- `npm run validate -- --strict-licences` exits 1 while any **active** site has a missing or stale approval (inactive sites are listed but don't fail it). This is the launch gate.
- `--dir <path>` validates another copy of `src/sites/` (the tests use it).

When the admin saves a site, approvals for images or marks that no longer exist are dropped automatically. Hand edits that leave such entries behind are reported as errors.

## verification.json

Optional. It records the verification checklist for every page and profile, and is written by the admin's **Verification** tab. It never reaches the renderer (`publishable()` drops it). A site with no checks has no file.

```json
{
  "pages": { "home": { "items": { "copy": { "checkedAt": "2026-10-19", "note": "Read with the club" } }, "fingerprint": "3f9c2a…" } },
  "people": { "sandro": { "items": { "photos": { "checkedAt": "2026-10-19" } }, "fingerprint": "a71e04…" } }
}
```

| Field | Notes |
|---|---|
| `pages.<page>` | One of `home`, `legends`, `waysToBook`, `hospitality`, `about`, `checkAvailability` |
| `people.<slug>` | A person in `people.json`. A `stories` group (a feature that no longer exists) is a validation error. |
| `items.<item>` | A checklist item for that kind of entry (definitions: `CHECKLISTS` in `src/sites/verification.mjs`); `checkedAt` is a `YYYY-MM-DD` London date, `note` optional and internal |
| `fingerprint` | Hash of the content the checklist was confirmed against (required) |

**The checklists** (labels and help text live in code, so item keys are stable and never renamed):

- **Profile:** correct person in every photo; facts and stats checked; current role and availability checked; bio is original; no sensitive topics; consent from the person or agent; formats and talks appropriate.
- **Home:** wording reviewed; hero and inset people correct, with name cards not covering faces; featured people current; brand colours and marks match guidelines; mobile reviewed.
- **Legends index, ways to book, about, check availability:** copy reviewed; links and CTAs work; mobile reviewed. Hospitality adds "venue and hospitality claims approved"; about adds "FAQ answers approved".

**What counts:** only what the build writes, using the renderer's rules. Switched-off pages (`pages`) and hidden people are left out. Their records are kept, but they don't count until they are switched back on.

**Staleness.** Each fingerprint hashes content fields, not rendered HTML. HTML changes with every template or CSS-class refactor, which would mark every page "changed" on unrelated deploys, and the legends index would change whenever anyone's bio did. What each fingerprint covers:

- **Profile:** the person's entry in `people.json`, plus the URLs their image ids point at. A swapped photo file changes what "correct person in every photo" means.
- **Pages:** the site-wide fields every page shows (names, tagline, entity, marks, crest settings, theme, style, wording, roles, venue, page switches), plus what that page shows:
  - home: hero title, homepage slots and their images, layout, eras, featured people's cards
  - legends index: every visible person's card fields and card image
  - ways to book and check availability: format overrides
  - hospitality: the hospitality format and image
  - about: FAQ overrides

Because wording lives in site-wide fields, a wording change marks every page as changed: re-read and re-confirm.

When the fingerprint no longer matches, the entry is **changed since verification**: its ticks stay visible but count as not verified until someone re-confirms them. `verificationStatus(site)` returns `{ done, total, stale, state }` per entry plus the site's `verified`, `total` and `stale` counts.

Validation:

- **Errors:** a malformed shape, unknown page keys, item keys or people, a leftover `stories` group, a missing fingerprint, bad dates.
- **Warnings only:** missing or stale checks. The validator prints one line per site, such as `spurs: 3/58 pages and profiles verified (2 changed)`, and still exits 0.
- `--strict-verification` exits 1 while any **active** site has an unverified or changed entry.
- `--strict` combines `--strict-licences` and `--strict-verification`. It is the launch gate.

## Legal pages (`src/copy/legal/`)

The Terms, the Privacy Policy and the Accessibility statement are **core content shared by every site**: one file each, never a per-site copy.

| File | Page |
|---|---|
| `src/copy/legal/terms.md` | `/<slug>/terms` on every site, and `/terms` on the hub |
| `src/copy/legal/privacy.md` | `/<slug>/privacy` on every site, and `/privacy` on the hub |
| `src/copy/legal/accessibility.md` | `/<slug>/accessibility` on every site, and `/accessibility` on the hub |

These pages always exist; they aren't optional pages, so `pages` can't switch them off. They use the site's normal layout and branding. Every site footer and the landing page footer link all three, and the enquiry form links the Terms and Privacy Policy in its consent line (`vocab.consentLine`).

> **Placeholder text.** The Terms and Privacy files are copied verbatim from getapeptalk.com as stand-ins (`status: placeholder` in the frontmatter). Replace them with terms and a privacy policy reviewed for the Appearances sites before launch (see [brand-and-legal.md](brand-and-legal.md)). Don't edit the stand-in wording piecemeal.

Format:
- **Frontmatter** (`title`, `source`, `copied`, `status`, `note`) is bookkeeping. Only `title` is shown (as the page heading); the rest is never rendered.
- **"Last update: <date>"** (or "Last updated:") on a line of its own is shown under the title as "Last updated: …" and removed from the body.
- **Body:** a small, safe markdown subset: headings, paragraphs, bullet and numbered lists (nested by indentation), tables, `**bold**`, `*italic*` and `[links](https://…)`. Links must be `https://`, `http://`, `mailto:`, `/…` or `#…`; anything else renders as plain text.
- **No raw HTML.** All text is escaped; `<b>`, `<script>` and the like show as literal text. The single exception is `<br>` inside a table cell, which becomes a line break.

In the Next.js app the content provider supplies these through `getLegal('terms' | 'privacy' | 'accessibility')` (`lib/content/`), so a CMS can provide them later; the JSON provider reads the markdown files.

## Wording keys (`vocab`)

Defaults live in `VOCAB` in `src/copy/defaults.mjs`; override any of them per site. Two extra keys have no default there:
- `officialSmall`: the nav sub-label, default "Official <orgName>"
- `currentNoun`: the noun used for counts on the landing page, default "players"

The admin's Wording tab lists every key next to its default. The ones most often changed:

| Key | Default (football) | Example override |
|---|---|---|
| `rolesEyebrow`, `rolesHeadline` | "Players · Managers · Staff", "More than the matchday XI" | MotoGP: "Riders · Team bosses · Paddock" |
| `heroLead`, `rosterLead` | Generic booking intro | Spurs: "Book keynotes, firesides, meet & greets…" |
| `legendNoun`, `legendsNoun`, `navLabels.legends` | "legend", "legends", "Legends" | Spurs: "speaker", "speakers", "Speakers" |
| `featuredEyebrow`, `featuredHeadline` | "Meet the legends", "Featured this season" | |
| `squadEyebrow`, `squadHeadline`, `squadLead`, `squadLinkText` | "Current squad", "Book today's stars", … | F1: "Book today's grid", "See the full grid" |
| `whoOptions`, `whereOptions` | Enquiry form radio labels | MotoGP: "At a Grand Prix" |
| `fixtureWord`, `diaryCheck` | "fixture list", … | "race calendar", "tournament calendar" |
| `hospitalityTitle`, `hospitalityLead`, `hospitalityBody`, `hospitalityMetrics` | Matchday wording | "Grand Prix paddock with a legend" |
| `officialLabel`, `officialLegendLabel`, `officialSmall`, `officialFooter` | "Official <club> platform", … | "Official MotoGP™ platform" |
| `beyondUrl`, `beyondLinkText`, `beyondLead` | PepTalk football speakers | `https://getapeptalk.com/type/motorsport-speakers` |
| `formHeadline`, `travelsFrom` | "Find your legend's date", "London, UK" | |
| `aboutTitle` | "About <platform>" (built from `platform`; the stored default is `null`) | Spurs: "About the Spurs Speaker Network". It is the about page's `h1`, title and breadcrumb, so keep it descriptive. |
| `currentNoun` | "players" | "drivers", "tour players" (landing page counts) |
| `consentLine` | "By sending this enquiry you agree to our {terms:Terms} and {privacy:Privacy Policy}." | Under the enquiry form's submit button (Next.js app). `{terms:label}` and `{privacy:label}` become links to that site's legal pages. |

Wording values are trusted HTML (write `&amp;` for an ampersand). Content files are reviewed in PRs like code, and the admin is a trusted-user tool, so it does not sanitise them.

Placeholder testimonials (`quote`, `profileQuote`) are site-level placeholders, never attributed to a real person.

## Event Spaces

`site.json → eventSpaces` configures one venue-hire promotion ("book a meeting or event space at the stadium"). It appears on the home page (after the booking form, before the closing call to action) and on the ways-to-book page (after the formats), with a line under the button for visitors who already have a venue. Optional `eyebrow` replaces the "Event spaces" label above the heading. It inherits the brand’s theme and button styling, and stacks photo above copy on mobile. It is separate from bookable people.

Set these fields in **Site settings → Event Spaces** in the local admin, or supply them through the CMS content provider:

```json
"eventSpaces": {
  "heading": "Your next event. Our iconic stadium.",
  "copy": "Explore spaces for meetings, conferences and celebrations at Tottenham Hotspur Stadium. Enquire and book directly with the stadium’s events team.",
  "image": "2290101699",
  "imageAlt": "Tottenham Hotspur Stadium",
  "buttonText": "Explore event spaces",
  "url": "https://www.tottenhamhotspurstadium.com/venue-hire/"
}
```

The image is a key in that brand’s `images.json`; use a venue photograph with the usual licence review. All fields are required when `url` is set. Omit `eventSpaces`, omit `url`, or leave `url` empty to hide the module with no placeholder. Other settings can be retained while hidden. The button opens the partner’s HTTPS page in a new tab; all venue enquiries and bookings take place there. Look-only demo pages keep their existing disabled-link behaviour.

Clicks emit `event_spaces_click` through the existing tracking loader, with `brand`, `link_url`, `link_text` and `page_path`. GA4 receives the event directly; GTM receives a data-layer event (configure a Custom Event trigger for `event_spaces_click` and map those parameters). Tags must be configured via `tracking` or `TRACKING_GTM_ID`; no analytics is sent without tags, or before required consent is granted. See [tracking and consent](architecture.md#tracking-and-consent). CMS changes use the normal [site revalidation](content-contract.md#revalidation).
