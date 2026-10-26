# Admin

A small local web app for managing sites and editing their content without touching JSON by hand. You can list every site, create a site, switch sites, pages and people on and off, edit wording, theme and profiles, and preview the result. It's another way to edit `src/sites/`; publishing still goes through a PR and a deploy.

> **Local or trusted-network tool only.** The admin writes to the content files and can commit to GitHub. Never expose it to the internet, and never deploy it with the app.

## Running it

```bash
npm run admin        # http://127.0.0.1:3095
```

| Variable | Purpose |
|---|---|
| `ADMIN_HOST` | Bind address (default `127.0.0.1`). Any non-loopback address needs `ADMIN_PASSWORD`, or the process refuses to start. |
| `ADMIN_PORT` | Port (default `3095`) |
| `ADMIN_PASSWORD` | Optional HTTP Basic password (any username). Required off loopback. |
| `GITHUB_TOKEN`, `GITHUB_REPO` | Turn on GitHub storage (see below). Set both or neither. |
| `GITHUB_BASE` | Base branch for GitHub storage (default `main`) |

Put them in `.env` (see [.env.example](../.env.example)); `npm run admin` loads it if present.

## Security model

- **Bind:** loopback by default. Without a password, only `localhost` / `127.0.0.1` / `[::1]` Host headers are served, so a DNS-rebinding page can't reach the admin through the browser.
- **Password:** with `ADMIN_PASSWORD`, every route (preview and assets included) needs HTTP Basic auth. The comparison is constant-time on SHA-256 digests.
- **State changes:** POST only, and each one needs both:
  - a same-origin check: `Origin` must match the host. If `Origin` is missing or `null`, the browser-set `Sec-Fetch-Site: same-origin` must be present.
  - a CSRF token: random per process, embedded in every form, compared in constant time.
- **Bodies:** only `application/x-www-form-urlencoded`, capped at 1 MB. The one exception is the site-pack upload (`POST /packs`): `multipart/form-data` up to 15 MB, parsed by a small bounded parser. Its form token is checked before the zip is opened, and the zip reader refuses unsafe archives ([site-packs.md](site-packs.md#safety)).
- **Paths:** every site and person key in a URL or form must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` before it is used. Anything else (`..`, `%2f`, capitals) gets a 404 or a form error.
- **Output:** every value in an admin page is HTML-escaped. Wording fields show the stored HTML source (`&amp;`) so you edit exactly what is saved.
- **CSP:** strict: `default-src 'none'`, with scripts and styles only from the same origin (`script-src 'self'`, `style-src 'self'`). The admin serves its own assets under `/assets/`. No inline script or style. Images are allowed only from Getty and the mark and image hosts of the stored sites (thumbnails).
- **Referrer:** `Referrer-Policy: same-origin`, so Getty and partner CDNs never see admin URLs. It's not `no-referrer`, because under that policy Chrome sends `Origin: null` on form posts.
- **Secrets:** `ADMIN_PASSWORD` and `GITHUB_TOKEN` are never logged or rendered. GitHub error messages have the token redacted.
- **Logs:** JSON lines on stdout (`admin.started`, `content.saved`, `content.refused`, `request.failed`), with no request bodies.

## How saving works

Every save follows the same path (`src/admin/content.mjs`):

1. Load the current content.
2. Apply the form to an in-memory copy.
3. Run `validateSite()`, plus `validateRegistry()` when the change affects the registry (activation, root, order, new site).
4. If there are problems, re-render the form with the errors and your input, and **write nothing**.
5. If not, write the canonical JSON (`src/sites/store.mjs`) through the storage adapter, then redirect with a flash message (POST/redirect/GET).

Only files whose text actually changes are written, so saving a form unchanged writes nothing. The forms round-trip the stored JSON exactly; a test checks this for every site, a sample of people, the Licences tab, sample checklists and the raw editors. To keep diffs small:

- An empty optional field removes the key (a stored `null` stays `null`).
- A flag set to the renderer's default removes the key (so `active: true` is never written).
- Existing key order is kept, and new keys are appended.

## Screens

| Screen | What it does |
|---|---|
| **Upload a site pack** (on Sites) | Upload a `<slug>.site-pack.zip` from the `/new-appearances-site --pack` skill, `new-site`/`assemble-site --pack`, `pack-site` or another checkout's *Download pack*. The **review page** shows the manifest, people counts by role, images, og cards, licence and verification status, the verify list (as text) and any validation problems (which block the import). **Preview the site** renders the pack in memory at `/packs/<id>/preview/<slug>`. **Import** writes the site (inactive unless *Publish now*; *Make root* optional) and its og cards through the storage adapter; an existing slug needs *Replace existing site*. Nothing is written before Import; uploads are held in memory for 30 minutes (five at most). Format and rules: [site-packs.md](site-packs.md). |
| **Sites** (`/`) | Every site in registry order, inactive ones included. Each row shows status (active/inactive, shell/populated, root), visible/total people, licensed/total assets and verified/total pages and profiles (amber badge when anything is unlicensed). Actions: Edit, Preview, Download pack (the site and its og cards as a `.site-pack.zip`, to move it to another checkout), Activate/Deactivate, Make root, move up/down. The first row, **Landing page (no root site)**, is the other choice for the root: *Make root* there removes `rootSite` from `registry.json`, so `/` serves the PepTalk landing page (and `/all` answers `301` to it). The **Root** badge and the line under the heading show which is active. Deactivating the root site is refused with the validator's message. The **New site** form uses `shellSite()`; new sites start **inactive** unless *Publish now* is ticked. |
| **Site settings** (`/sites/<slug>`) | One form in sections: basics, homepage hero and images (with thumbnails), **Event Spaces** (heading, short copy, venue image and description, button text and partner HTTPS URL; empty URL hides it), optional pages, **search and language**, theme colours (picker plus text) and neutrals, style tokens, homepage layout flags, demo pages, featured people (tick plus order number) and every wording key. In the wording section the default appears as a placeholder and an empty field means "use the default". List and object wording is edited as JSON. **Search & language** holds:<br>- `indexable`, the launch switch. It sits under a warning: ticking it makes the site public (no password, for that site only) and indexable: robots meta and headers, sitemaps, robots.txt and llms.txt. The validator refuses it on shell sites and sites with demo pages. A newly ticked flag is written right after `slug`, so the diff shows it first.<br>- `lang` (`en-GB` default, `en-US`) and `orgType` (`SportsTeam` default, `SportsOrganization`). Defaults aren't written unless the file already spells them out. |
| **People** (`/sites/<slug>/people`) | Table with thumbnail, role, era, visible/hidden, featured, and Show/Hide. *Add a person* takes a slug and name and opens the full editor with a template, along with the validator's list of what's missing; nothing is saved until the profile validates. |
| **Person editor** | Strings as inputs; bio, talks, audiences and industries one per line; stats and timeline as `value \| caption` lines; formats as checkboxes; role and era as selects; image ids with thumbnails; a field to add an id → URL to `images.json`; and **`sameAs`**, the person's official profiles elsewhere, one https URL per line (validated: https, at most 10, no duplicates; emptied means removed). Slugs are fixed once created. Deleting asks for confirmation, and is refused (with the reason) while the person is featured. A *Checklist n/7* button opens their verification checklist. |
| **Licences** (`/sites/<slug>/licences`) | Every picture (`images.json`) and mark (crest, wordmark) with a thumbnail, where it's used (person and slot, homepage slot, role tile), its host, a status (*Licensed*, *Not licensed*, *Changed since approval*), a tick and a note. *Unapproved only* (`?show=unapproved`) filters the list. *Approve all shown* ticks every row on screen, and works without JavaScript; with JavaScript there's also a tick-all checkbox. Ticking approves the file at its current URL (dated today, London time); unticking removes the entry. Only rows on screen change, so the filter never touches hidden approvals. A stale approval stays until someone re-approves or unticks it. Saves go through the normal validated path into `licences.json`. A test renders every page of every site with the Next.js components and checks that each photo (`<img>`), the nav wordmark and the crest (theme CSS and icon) are on this list. |
| **Verification** (`/sites/<slug>/verification`) | Every page the app builds and every visible profile, with progress (e.g. 4/7) and status: *Verified*, *In progress*, *Not started* or *Changed*. *Incomplete only* (`?show=incomplete`) filters the list. Each row opens a checklist (`/verification/pages/<page path>`, `/verification/people/<slug>`): tick boxes with help text, an optional note per item, *Check all and save*, and a link to preview that page. Saving stamps the checklist with a fingerprint of the content as it is now. When that content later changes, the ticks stay visible but the entry shows as *Changed* and counts as unverified; *Re-confirm and save* is one click. Saves go through the normal validated path into `verification.json`. The Terms and Privacy pages aren't listed: their text is shared by every site (`src/copy/legal/`) and is reviewed once before launch ([brand-and-legal.md](brand-and-legal.md)). |
| **Raw JSON** (`/sites/<slug>/raw/site\|people\|images\|licences\|verification`, `/registry`) | The escape hatch for anything without a form (roles, eras, formats, FAQ overrides, marks, redirects). The whole file is parsed, validated with the rest of the site, and rewritten canonically. It also works for a site whose files no longer parse. |
| **Preview** (`/preview/<path>`) | Renders the stored content in memory with the Next.js app's components. See below. |

## Licence and verification alerts (never blocking)

Missing licence approvals and verification checks never stop anything; they stay visible until cleared:

- **Sites:** a *Licences* column (`approved/total`, amber *N unlicensed* badge) and a *Verified* column (`verified/total`, amber *N to verify* badge).
- **Every site page:** one amber banner with up to two lines, one for licences and one for verification, each linking to its tab (filtered). A tab's own line is left out on that tab.
- **Activating a site** (or creating one with *Publish now*) still publishes; the flash turns amber: "Published with N unlicensed assets and M unverified pages or profiles."
- **People:** a verification badge per visible person, linking to their checklist.
- **Person editor:** each image thumbnail carries its licence status, and a *Checklist n/7* button links to the person's checklist.
- **`npm run validate`:** one licence line and one verification line per site. `--strict-licences`, `--strict-verification`, or `--strict` (both) is the launch gate (see [content-model.md](content-model.md#licencesjson)).

Saving a site drops approvals for images or marks it no longer has, and checklists for people it no longer has, so deleting never leaves an entry the validator would reject.

## Preview

`/preview/spurs/legends/sandro` renders the page the Next.js app builds for `/spurs/legends/sandro`, with **the app's own components** (`components/`, `lib/`), from the content as currently stored. There's no build, and edits show on reload. A pending site pack previews the same way, at `/packs/<id>/preview/<slug>`.

**How (decision, 2026-10-20).** `src/admin/next-render/` renders each page with `react-dom/server` `renderToStaticMarkup`:
- the page component that `app/` uses, inside the app's `<Document>` shell (`components/document.tsx`)
- the page chosen by the app's `resolvePage()` (`lib/render/routes.ts`)
- the site as `lib/content/publish.ts` publishes it, straight from the admin's in-memory snapshot

The admin is plain Node, so a module hook (`next-render/hooks.mjs`) compiles the `.tsx` components with **the SWC compiler bundled in Next.js**, the engine `next/jest` uses, so no extra dependency. Node strips types from the `.ts` files itself.

Two things outside Next.js need small seams:
- `next/image` maps to `next-render/image-shim.mjs`. The admin has no image optimizer, and outside a Next.js build `getImageProps()` refuses every remote host, because its config is injected by the bundler. Photos are plain `<img>` elements loading the original file, with the same attributes minus the `srcset`.
- Bare `next/*` imports resolve to their `.js` files.

We considered proxying to a running `next dev` and rejected it:
- it can't see unsaved content (GitHub mode's session overlay, pending site packs)
- its proxy manifest and `generateStaticParams` are fixed at startup from published sites, so inactive and newly created sites would 404
- it needs a second long-running process

**What the preview leaves out:**
- the Metadata API's head tags (a plain `<title>` stands in)
- Next.js framework scripts and the hydrated behaviour (menu toggle, roster filters, shortlist, form validation)
- the image optimizer

Layout, text, links, structured data, theme CSS, demo mode and `<html lang>` are the app's.

**Risk.** The SWC entry point (`next/dist/build/swc`) is internal to Next.js. If an upgrade moves it, the admin preview tests fail at once. The fix is the import path in `hooks.mjs`, not the components.

- **Inactive sites preview too.** The point is to see a site before activating it. Hidden people are still left out (`publishable()`), exactly as in the build. The landing page lists published sites only; it previews at `/preview/` (at `/preview/all` when a root site takes `/`, as in the app).
- **URL rewriting rather than a second server.** App pages use root-relative URLs (`/styles.css`, `/spurs/legends`). The preview prefixes every root-relative `href`/`src`/`action` and CSS `url()` with `/preview` (or the pack's prefix). Every app URL takes one of those forms, so this small rewrite is complete, and a test asserts nothing unprefixed survives. Absolute URLs in structured data and canonicals keep the production origin. Mounting the preview on a separate port would also have worked, but it would add a second listener, a second auth surface and cross-origin links back to the admin.
- **Assets:** `public/` files are served under `/preview/` from a fixed pattern. `/<slug>/site.css` and `/landing.css` come from the app's `lib/render/theme.ts` on request. The hub pages (the landing page at `/preview/`, `/preview/terms`, `/preview/privacy`) and each site's legal pages render too.
- **CSP:** like the app's, but `script-src 'self'` only, because the preview has no framework scripts. `img-src` covers Getty plus every stored site's mark and image hosts, so inactive sites' hotlinked images load.

## Storage modes

The adapter is picked at start-up (`src/admin/storage/`). Each one has the same small interface: `{ name, describe(), save(files, message), read?(path) }`.

### Local files (default)

Saves write into `src/sites/` in your checkout. The flash message is a reminder of what comes next: run `npm run check`, commit, and open a PR. Changes go live on the next deploy, never directly. Regenerate Open Graph cards (`npm run og-cards`) if you changed a site's name, theme, hero or section titles.

### GitHub

With `GITHUB_TOKEN` (a fine-grained token with *Contents* and *Pull requests* read/write on the repository) and `GITHUB_REPO=owner/name`:

- The first save in a process commits to a new branch, `content/admin-<yyyymmdd-hhmmss>` (UTC), created from `GITHUB_BASE` through the Git data API (blobs → tree → commit → ref). The branch is created at that first commit, so a failed first save leaves nothing behind. The same save opens a PR, and the header links to it.
- Each later save adds a commit to that branch. If opening the PR fails, the commit is kept and the next save tries again.
- The admin never runs `git` and never touches your working tree.
- Binary files (og cards imported from site packs) are uploaded as base64 blobs; text files as UTF-8.

**Limitation:** reads still come from your local checkout, overlaid with the files saved in this admin session (held in memory). The admin doesn't fetch the branch from GitHub, so:

- After a restart, a new branch starts and earlier session edits are no longer visible locally, though they're still on the old branch and PR.
- Changes others make to the branch or `main` aren't seen until you pull.
- Keep one admin process per editing session, and merge or close its PR before starting another.

## Known limitations

- In GitHub mode, if the commit lands but opening the PR fails, the save shows as an error even though the branch has the commit. Check the branch before retrying.
- Wrong passwords are logged and delayed by 500 ms, but there is no lockout. Off-loopback use needs a long random `ADMIN_PASSWORD` on a network you trust.

## Code map

| Path | Role |
|---|---|
| `src/admin/server.mjs` | Entry: environment, bind checks, storage choice, listen |
| `src/admin/app.mjs` | `createAdmin({ dir, password, storage })`: gates, routing, flash, preview mount |
| `src/admin/http.mjs` | Headers, auth, same-origin, body parsing, logging |
| `src/admin/content.mjs` | Snapshot of registry and sites, the single validate-then-save path |
| `src/admin/forms.mjs`, `forms-entries.mjs` | Form → content (site settings, new site, person, licences, checklists) |
| `src/sites/licences.mjs` | Shared licence helpers: assets, `licenceStatus()`, usage, pruning, shape checks |
| `src/sites/zip.mjs`, `src/sites/packs.mjs` | Dependency-free zip reader/writer and site packs (`buildPack`, `readPack`, `packFiles`, `prepareImport`) |
| `src/admin/handlers/packs.mjs`, `views/packs.mjs`, `pending.mjs` | Upload, review, preview, import and download of site packs; pending packs in memory |
| `src/sites/verification.mjs` | Checklist definitions, built-page rules, fingerprints, `verificationStatus()`, pruning, shape checks |
| `src/admin/schema.mjs` | Which fields exist and how each is edited |
| `src/admin/handlers/` | One module per screen group |
| `src/admin/views/` | Pure template functions (escaped HTML strings) |
| `src/admin/next-render/` | Renders preview pages with the Next.js app's components (module hooks for `.tsx` and `next/image`, then `renderToStaticMarkup`) |
| `src/admin/preview.mjs` | In-memory rendering and URL rewriting |
| `src/admin/storage/` | `fs` and `github` adapters |
| `src/admin/public/` | `admin.css`, and `admin.js` (colour-picker sync, live thumbnails, tick-all on the Licences tab; everything works without it) |

Tests: `test/admin.test.mjs`. Each test copies `src/sites/` into a temp directory, so real content is never written.
