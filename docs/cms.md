# The CMS (/admin)

The online content editor for the speaker network, modelled on the Credible Creators CMS: email and password sign-in
with two-factor codes, three roles, and one menu for the one site this repository serves: **Pages**, **Speakers**,
**Media**, **Sync**, **Users**, **Style guide** and **Your account**. It is branded like getapeptalk.com (Recoleta Alt
headings, Sofia Pro text, PepTalk blue). There is no way to add sites here: this repository is the Spurs site only.

- **URL:** `/admin` on the deployment (for example `https://spurs-speaker-network.vercel.app/admin`).
- **Code:** `lib/cms/` (sign-in, database, router, views, media, sync), `app/admin/[[...path]]/route.ts`,
  `app/api/media/[id]/route.ts`, `app/api/cron/sync-airtable/route.ts`, `db/migrations/`.
- **Saving:** every edit goes through the local admin's validated save path (`src/admin/content.mjs`, [admin.md](admin.md))
  with the database as storage, so the content rules (`scripts/validate-content.mjs`) still decide what is allowed.

## Sections

- **Pages** (`lib/cms/pages.ts`): one editor per page (Home, Speakers page, Speaker categories, Speaker profile, Ways to
  book, Event spaces, About, FAQs, Header, footer & names) plus the legal pages. Each lists the `site.json` settings
  that page shows. An empty field uses the shared default (shown greyed out as the placeholder); empty carousel slides
  and pitch points are dropped. To make more wording editable, add the setting to `site.json` (CLAUDE.md, rule 4) and a
  field to the page's list; `test/next/cms.test.ts` checks every editor saves an untouched form unchanged.
- **Speakers:** read-only. Airtable owns the speakers: edit them there, then run a sync.
- **Media:** every image in `images.json`, with what uses it, plus uploads.
- **Style guide:** the club's marks, colours, type and buttons, and the editable brand colours and shapes
  (`theme`, `style`).

## How content flows

Every content file the site reads (`src/sites/registry.json`, `src/sites/<slug>/{site,people,images,licences,verification}.json`,
`src/copy/legal/<kind>.md`) can be saved from the CMS. A save writes one row per file to `cms_content_files`; with
`CONTENT_PROVIDER=cms` the site reads the committed files with those rows on top (`lib/content/cms-provider.ts`).

- An empty database serves exactly what is in Git.
- **Once a file is saved in the CMS, the database copy wins**: later commits to that file are not shown until the
  row is removed. Make content changes in the CMS from then on; code changes that need new content fields should
  be applied in the CMS too (or the row deleted so the committed file is used again).
- Every save is validated with the content rules (`scripts/validate-content.mjs`) first; nothing invalid is written.
- After a save the CMS refreshes the affected pages (cache tags, `lib/cms/publish.ts`): **live within a minute**.
- Saves that add or remove pages (new speakers or sites, renamed slugs, page switches, new image hosts) need a
  rebuild. With `VERCEL_DEPLOY_HOOK_URL` set the CMS starts one (about two minutes); otherwise the change appears on
  the next deploy.

## Sign-in and roles

| Role | Can |
|---|---|
| Owner | everything, including Users (add, change role, deactivate, reset 2FA, email reset links) |
| Editor | edit content, upload media, run the Airtable sync |
| Viewer | look at everything, change nothing |

- Passwords: bcrypt (cost 12), at least 12 characters.
- Two-factor sign-in (TOTP, any authenticator app) is required: a user without it can only reach the setup page.
- Sessions: a signed cookie (`AUTH_SECRET`), 12 hours, re-checked against the database on every request, so
  deactivating a user, resetting their 2FA or changing a password signs them out everywhere at once.
- Eight failed sign-ins lock that email and that address for 15 minutes.
- Every form carries a per-session token, and every POST must come from the same origin.
- The CMS is outside the preview password, always `noindex`, never cached, and disallowed in `robots.txt`.
- **First owner:** `ADMIN_EMAIL` is created by the migration without a password. Open `/admin/forgot`, enter that
  email and use the emailed link to set the password, then set up 2FA at the first sign-in. Without email configured,
  run `npm run cms:invite -- <email>` (needs `DATABASE_URL`): it prints a one-time link (72 hours) to set the password.
  Treat that link like a password.
- **Password reset emails** go through Resend (`RESEND_API_KEY`, `AUTH_EMAIL_FROM` on a verified domain). Without
  them nothing is sent (the form still answers the same way, so it never reveals which emails exist).

## Media library

PNG, JPEG or WebP up to 4 MB (checked from the file's bytes; no SVG). Uploads are stored in the database
(`cms_media`) and served from `/api/media/<id>`, like the Credible CMS. Uploading adds the image to
`images.json` with the id `m-…`, which any image field accepts. Use licensed images only (CLAUDE.md, rule 7).

## Airtable sync

Speakers come from PepTalk's base (`appIlXKUGvaErhWeb`), table **BM | Tottenham Hotspurs FC**
(`tblo9zhapzhwKIc5e`), read by field ID (`lib/cms/sync.ts`), with talk topics and languages from their linked tables.

- **Preview sync** maps and checks everything and saves nothing; **Sync speakers now** saves.
- **Merge mode (default)** while the Airtable data is being completed: records update the speaker with the same
  slug (keeping their photos when Airtable has none) or add new ones; speakers without a record stay.
- **Replace mode** (`AIRTABLE_SYNC_MODE=replace`): Airtable owns every speaker, as in the Credible CMS.
- Records without a slug, without hero and card image URLs (for new speakers), or failing the content rules are
  skipped and listed in the run. `Publishing status = Unlisted` saves the speaker hidden. `Featured` ticks set the
  homepage's featured speakers (when any are ticked).
- Formats: the table's old seven choices map to the site's five (Keynote → keynote and after-dinner; Hospitality,
  Brand, Fan and Clinic → appearances; Workshop; Virtual).
- A schedule: `GET` or `POST /api/cron/sync-airtable` with `Authorization: Bearer $CRON_SECRET` (add a Vercel Cron
  when the data is final).

## Database and environment

Postgres from the Vercel Neon integration (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`). `npm run build` runs
`scripts/db-migrate.mjs` first: it applies `db/migrations/*.sql` once each and creates `ADMIN_EMAIL` if missing, and
does nothing without a database. Variables: [vercel.md](vercel.md#environment-variables).

| Table | Holds |
|---|---|
| `cms_users`, `cms_password_resets`, `cms_login_attempts` | accounts, reset links (hashed), sign-in attempts |
| `cms_content_files` | saved content files (path → body, who, when) |
| `cms_media` | uploads (base64) |
| `cms_sync_runs` | Airtable sync history |

## Local development

`vercel env pull .env.development.local --environment=development` brings the database URL; add `AUTH_SECRET`,
`CONTENT_PROVIDER=cms` and `AIRTABLE_TOKEN` there (not in `.env.local`, which the test builds read). Then `npm run dev`
and open `http://localhost:3011/admin`. The development database is the same Neon database as production unless
you point `DATABASE_URL` at a branch.
