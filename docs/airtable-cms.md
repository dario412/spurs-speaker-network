# Airtable profile sync: how to switch it on

The people on each site (profiles, card lines, stats, photos) can come from one Airtable table instead of `src/sites/<slug>/people.json`. Everything else (site settings, wording, branding, legal text) stays with the content provider: the JSON files today, or your CMS. The sync is built and tested against fixtures, and it stays off until you set `PEOPLE_PROVIDER=airtable`.

What you get:

- **Field IDs, not names:** renaming a column in Airtable changes nothing.
- **Per-site switch-on:** only the sites you list in the config read from Airtable. The rest keep their JSON people.
- **A publishing gate:** status, consent and archived checks, applied by the API query and checked again on every record that comes back.
- **Per-record validation:** against the content contract ([content-contract.md](content-contract.md)) and the site's content rules. A bad record is skipped and reported, never dropped silently, and the sync **fails closed** if too many are bad or a featured person goes missing.
- **R2 images:** stable Cloudflare R2 URLs only. Airtable's own attachment URLs expire.
- **Offline first:** an offline dry run on an export, with no API key.
- **Page refreshes without a deploy:** an Airtable automation calls `POST /api/revalidate`.

## Airtable API facts this relies on

Checked on 2026-10-20:

| Fact | Source |
|---|---|
| List records: `GET https://api.airtable.com/v0/{baseId}/{tableIdOrName}`, or `POST …/listRecords` with the same parameters as a JSON body. The POST form exists because URLs over 16,000 characters are refused. The client uses POST. | [List records](https://airtable.com/developers/web/api/list-records) |
| `pageSize` is at most 100. The response has `offset` while more records exist; send it back for the next page. An expired iterator answers 422 `LIST_RECORDS_ITERATOR_NOT_AVAILABLE`; restart from the first page. | [List records](https://airtable.com/developers/web/api/list-records) |
| `returnFieldsByFieldId: true` keys `fields` by field ID. `fields[]` and `filterByFormula` accept field IDs (field-ID support in formulas dates from 2023-04-05). Empty cells (`""`, `[]`, `false`) are left out of `fields`. | [List records](https://airtable.com/developers/web/api/list-records), [changelog](https://airtable.com/developers/web/api/changelog) |
| Rate limits: **5 requests per second per base**, and 50 per second across all of one user's (or service account's) personal-access-token traffic. Going over returns 429, and you must wait 30 seconds before requests succeed again. No `Retry-After` header is documented. | [Rate limits](https://airtable.com/developers/web/api/rate-limits) |
| Errors: `{"error":"NOT_FOUND"}` or `{"error":{"type":…,"message":…}}`. 401 is missing or invalid credentials, 403 is no access, 404 is not found, 422 is an invalid request, 429 is rate limited, and 502/503 are transient (retry with backoff). | [Errors](https://airtable.com/developers/web/api/errors) |
| Personal access tokens go in `Authorization: Bearer <token>`. API keys stopped working on 2024-02-01. Reading records needs the `data.records:read` scope; reading field IDs through the metadata API needs `schema.bases:read`. Each token only reaches the bases you grant it. | [Authentication](https://airtable.com/developers/web/api/authentication), [scopes](https://airtable.com/developers/web/api/scopes) |
| IDs: base `app…`, table `tbl…`, field `fld…`, view `viw…`, record `rec…`. Find field IDs under Manage fields, or with `GET /v0/meta/bases/{baseId}/tables`. Airtable recommends keying integrations on field IDs because names change. | [Finding IDs](https://support.airtable.com/docs/finding-airtable-ids), [base schema](https://airtable.com/developers/web/api/get-base-schema) |
| Attachment URLs expire 2 hours after the API returns them. | [Field model](https://airtable.com/developers/web/api/field-model) |
| Automation scripts have `fetch` (no CORS, no redirects followed, responses up to 4.5 MB). | [Scripting: fetch](https://airtable.com/developers/scripting/api/fetch) |

The client (`lib/content/airtable/client.ts`) follows these rules:

- It keeps under 5 requests per second (one request every 220 ms).
- On a 429 it waits 30 seconds; on 5xx or network errors it backs off 1, 2, then 4 seconds. After 4 attempts it raises a typed error.
- It restarts an expired listing once, and caps pagination at `maxPages`.
- It puts the token only in the `Authorization` header. The tests check that the token never appears in logs or error messages.

## How it fits

```
Airtable table ──(build, and each revalidation)──> airtable-provider ──> withPeople(content provider) ──> pages
   │                                                     │
   └─ automation: record updated ──> POST /api/revalidate┘ (tag: site:<slug>, one read of that site)
```

| File | Role |
|---|---|
| `config/airtable.example.json` | Example config: base and table IDs, field map (placeholder field IDs), site filter, publishing gate, image fields |
| `lib/content/airtable/config.ts` | Loads and validates the config; reads `AIRTABLE_TOKEN` and `AIRTABLE_CONFIG` / `AIRTABLE_CONFIG_FILE` |
| `lib/content/airtable/mapper.ts` | Pure: records → `Person[]` and images, with per-record errors, the publishing gate and the fail-closed check |
| `lib/content/airtable/client.ts` | fetch-based client: pagination, rate limiting, backoff, typed errors |
| `lib/content/airtable-provider.ts` | The `PeopleProvider` behind `PEOPLE_PROVIDER=airtable` |
| `lib/content/airtable/export.ts`, `scripts/airtable-dry-run.mjs` | Offline dry run on a CSV or JSON export |
| `test/fixtures/airtable/` | Fixture config, API JSON pages, the same records as CSV, the mocked fetch |

## Switching it on

### 1. Shape the table

One table, one row per person per site (the same person on two sites is two rows, with each site's own copy). Field types and how each is read:

| Person field | Airtable field (suggested) | Config `type` | Notes |
|---|---|---|---|
| `slug` | Slug (single line) | `text` | URL segment, unique per site, never changed once live |
| `name`, `first` | Display name, First name | `text` | `first` defaults to the first word of the name |
| `role` | Role (single select) | `select` with `map` | Options map to `player`, `manager`, `staff`, `women`, `squad` |
| `roleLabel`, `pos`, `short`, `honour`, `line`, `why`, `langs`, `travelsFrom` | single line / long text | `text` | |
| `era` | Era key (single line or select) | `text` / `select` | Must be one of the site's `eras[].key` |
| `limited` | Limited availability (checkbox) | `checkbox` | |
| `stats` | Stats (long text) | `pairs` | Exactly four lines, `value \| caption` |
| `timeline` | Timeline (long text) | `pairs` | `year \| text`, one per line |
| `bio` | Bio (long text) | `paragraphs` | Paragraphs separated by a blank line |
| `talks`, `audiences`, `industries` | multiple select | `list` | |
| `formats` | Formats (multiple select) | `list` with `map` | Options map to the seven format keys |
| `sameAs` | Official profiles (long text) | `urls` | https URLs, one per line, at most 10 |
| `active` | (optional) Show on site (checkbox) | `checkbox` | Unchecked hides the profile. Usually the publishing gate is enough. |
| hero, card | Hero image URL, Card image URL (URL fields) | `url` | Stable R2 URLs |
| gallery | Gallery image URLs (long text) | `urls` | Exactly three |
| site | Site (single select, or a text/formula field) | `select` / `text` / `list` | Values listed in `sites.values`. Linked-record fields return record IDs in the API, so use a lookup or formula field that returns a name. |
| gate | Publish status (select), Consent (checkbox), Archived (checkbox) | | See step 4 |
| order | Display order (number) | `number` | Optional. People sort by it, then by slug. |

Keep copy original. The [content rules](content-model.md) apply exactly as for JSON: no quotes, no contested numbers, no review notes ("TODO", "TBC", "(verify…)"), which are rejected per record.

### 2. Create a token

Airtable → Builder hub → Personal access tokens → Create:

- scope `data.records:read` (and `schema.bases:read` if you'll look up field IDs through the API)
- access: this one base only

Store it as `AIRTABLE_TOKEN` (Vercel → Settings → Environment Variables, Production and Preview). It never goes in the config file or the repository. A service-account token is a good choice so the sync doesn't depend on one person's account.

### 3. Collect the IDs

- **Base and table:** from the table's URL, `https://airtable.com/appXXXXXXXXXXXXXX/tblXXXXXXXXXXXXXX/…`.
- **Field IDs:** in the table, Manage fields → show the Field ID column. Or through the API:

  ```sh
  curl -s -H "Authorization: Bearer $AIRTABLE_TOKEN" https://api.airtable.com/v0/meta/bases/appXXXXXXXXXXXXXX/tables \
    | jq '.tables[] | select(.id=="tblXXXXXXXXXXXXXX") | .fields[] | {id, name, type}'
  ```

### 4. Write the config

Copy `config/airtable.example.json` to `config/airtable.json` and replace every placeholder ID:

- `baseId`, `tableId`, and optionally `view` (a view ID: only its records).
- `fields`: one entry per person field, `{ "id": "fld…", "type": …, "name": "…" }`. `name` is the column's display name, used only to read CSV exports in the dry run. The API is always queried by `id`.
- `sites`: `field` holds the site value, and `values` maps each site slug that should read from Airtable to that value (`"spurs": "Tottenham Hotspur"`). **Only listed sites switch over.** Start with one. Each site needs its own value: the config is rejected if two slugs share one, so one partner's people can never appear on another partner's site.
- `publish`: the gate. `status` (the field and the option names that count as published), `consent` (a checkbox that must be ticked) and `archived` (a checkbox that must not be). At least a status or a consent condition is required, and a missing value fails closed.
- `images.hosts`: the https origin(s) of your R2 bucket (`https://pub-<id>.r2.dev` or a custom domain). Image URLs on any other host are rejected. `hero`, `card` and `gallery` say which fields hold the URLs.
- `failClosed`: `maxInvalidRatio` (default `0.1`: the sync fails if more than 10% of a site's records are invalid) and `minPeople` (default `1`).

On Vercel, supply the config as `AIRTABLE_CONFIG` (the JSON inline; preferred), or commit `config/airtable.json` and leave `AIRTABLE_CONFIG_FILE` unset. The file holds IDs, not secrets, but the IDs name your base and tables, so keep it out of any public repository.

### 5. Dry run on an export (no API key)

Download a CSV from a grid view showing every mapped field (view menu → Download CSV), or save API responses as JSON. Then:

```sh
npm run airtable:dry-run -- --file export.csv --site spurs
npm run airtable:dry-run -- --file export.json            # every site in sites.values
npm run airtable:dry-run -- --file export.json --json     # machine-readable
```

It prints, per site:

- the people it would publish
- skipped records with every problem (field, field ID, message)
- records left out by the publishing gate
- the site-level checks (featured people present, and so on)
- a diff against the current `people.json` (`+` added, `-` removed, `~` changed fields)
- image and licence counts

It exits 1 when the live sync would fail closed. Try it now with the fixtures:

```sh
npm run airtable:dry-run -- --file test/fixtures/airtable/records.json \
  --config test/fixtures/airtable/config.json --site-file schema/examples/site-populated.json
```

CSV notes: columns are matched to the config by `name`, checkboxes read `checked`, and multiple selects are comma-separated. Attachment fields can't be read from CSV (no attachment IDs); use URL fields or the JSON export. Airtable doesn't document the CSV format, so check a real export once.

Fix what it reports in Airtable, and repeat until it's clean. `featured`, `demoProfiles` and the home slots in `site.json` must name people that Airtable publishes.

### 6. Images on R2

- Put stable R2 URLs in URL fields. If your photos live in Airtable attachment fields, mirror them to R2 (for example with an automation or a small worker) and map the attachment field with `"type": "attachment", "urlTemplate": "https://media.example.com/airtable/{id}/{filename}"`, where `{id}` is Airtable's attachment ID and `{filename}` its file name, URL-encoded. Airtable's own attachment URLs are never used: they expire after 2 hours.
- Set `IMAGE_HOSTS_EXTRA=https://media.example.com` (comma-separated for several) so `next/image` and the CSP allow the host even before the first image from it is published. Hosts in the content at build time are allowed automatically.
- Licence tracking keeps working. An R2 image's id is its host and path (`media.example.com/people/a.jpg`), and approvals in `src/sites/<slug>/licences.json` are checked against the URL in use. A replaced photo at a new URL needs a new approval. `npm run validate -- --strict-licences` stays the launch gate, and the dry run reports approved/total.

### 7. Run the conformance suite against the real base

```sh
PEOPLE_PROVIDER=airtable AIRTABLE_TOKEN=pat… AIRTABLE_CONFIG_FILE=config/airtable.json npm run contract
```

Add `CONTRACT_FAILING_ENV='{"AIRTABLE_TOKEN":"invalid"}'` to check that a bad token surfaces as a typed error, and `CONTRACT_FETCH_IMAGES=1` to fetch every R2 image once. When this is green and `npm run check` passes, the integration is done.

### 8. Deploy

On Vercel (Production and Preview):

| Variable | Value |
|---|---|
| `PEOPLE_PROVIDER` | `airtable` |
| `AIRTABLE_TOKEN` | the token from step 2 |
| `AIRTABLE_CONFIG` | the config JSON (or commit `config/airtable.json`) |
| `IMAGE_HOSTS_EXTRA` | your R2 origin(s) |
| `REVALIDATE_SECRET` | a long random string (`openssl rand -hex 32`) |

Redeploy. During the build:

- `next.config.ts` reads each listed site once (two or so API calls per site at 100 records a page) and shares the result with the page workers.
- The build log shows one JSON line per site, for example `{"event":"airtable.synced","site":"spurs","records":61,"people":58,"skipped":1,"excluded":2}`, plus one `airtable.record_skipped` line per bad record.
- If the sync fails closed, the build fails with the reason and the records concerned, and the previous deployment keeps serving.

### 9. Refresh pages when a record changes

In Airtable: Automations → Create automation:

- **Trigger:** "When a record is updated", on the people table. Watch the mapped fields and the publishing gate fields.
- **Action:** "Run a script". Add input variables `site` (the record's Site field) and `slug` (its Slug field), then:

```js
// Refreshes the site's pages on the Appearances platform after a record changes.
const SITES = { 'Tottenham Hotspur': 'spurs', Arsenal: 'arsenal' }; // Airtable value -> site slug (as in sites.values)
const ENDPOINT = 'https://<your-domain>/api/revalidate';
const SECRET = '<REVALIDATE_SECRET>';

const { site, slug } = input.config();
const siteSlug = SITES[Array.isArray(site) ? site[0] : site];
if (!siteSlug) {
  console.log(`No Appearances site for "${site}", nothing to refresh.`);
} else {
  // { site } refreshes every page of the site (one Airtable read). No "immediate": the default keeps serving the last
  // good page if Airtable is briefly down while the pages regenerate.
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': SECRET },
    body: JSON.stringify({ site: siteSlug }),
  });
  if (!response.ok) throw new Error(`Revalidation failed: ${response.status} ${await response.text()}`);
  console.log(`Refreshed ${siteSlug} (${slug}).`);
}
```

Anyone who can edit the automation can read the secret. It can only trigger revalidation (it can't read or change content), but rotate it in Vercel and in the script if a collaborator leaves. If you prefer a "send webhook"-style action, any HTTP POST with the same header and body works.

New people need a deploy: their URLs don't exist yet. Add a second automation, "When a record matches conditions" (Publish status is Published and Consent is checked) → Run a script that `POST`s to a [Vercel Deploy Hook](https://vercel.com/docs/deploy-hooks) URL. Unpublishing someone needs only the revalidation above: they leave every list, and their profile answers 404 once regenerated.

### 10. Check and roll back

- **Check:** open a changed profile twice (the first visit triggers regeneration, the second shows it). Vercel's logs show `{"event":"revalidate","outcome":"ok",…}` and `airtable.synced` lines.
- **Roll back:** remove `PEOPLE_PROVIDER` (or the site from `sites.values`) and redeploy. The JSON people are untouched and take over again.

## Behaviour when things go wrong

| Situation | Build | Revalidation at runtime |
|---|---|---|
| Airtable down or 5xx | retried, then the build fails (`unavailable`); the previous deploy keeps serving | the regeneration fails; the last good page keeps serving |
| Bad token or no access | fails at once (`unauthorized`) | same, last good page |
| Rate limited | waits 30 s per 429, up to 4 attempts | same |
| A few invalid records | skipped and logged; the site publishes without them | same |
| Too many invalid records, or fewer than `minPeople` | fails (`invalid_content`) with every record's problems | last good page |
| A featured person unpublished | fails: "featured … is not in people.json" | last good page; unfeature them in `site.json` |
| Wrong field ID or bad formula | fails (`config`, Airtable's 422 message) | last good page |
| Any of the above after a revalidation sent with `"immediate": true` | n/a | **500** until Airtable recovers: `immediate` serves nothing stale. The automation below doesn't use it. |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `PEOPLE_PROVIDER=airtable needs AIRTABLE_TOKEN` | Set the variable for the environment you're building (Preview and Production) |
| `fields.slug.id must be a field ID` | The config has a field name; use the `fld…` ID |
| `422 INVALID_FILTER_BY_FORMULA` / unknown field | A field ID in `sites`, `publish` or `fields` doesn't exist in this table |
| `404 NOT_FOUND` | Wrong `baseId` or `tableId`, or the token lacks access to the base |
| A record is "excluded" | It fails the publishing gate (status, consent, archived): expected |
| `… is not an allowed image host` | Add the origin to `images.hosts` (and to `IMAGE_HOSTS_EXTRA`) |
| A new person 404s after revalidation | New URLs need a deploy (deploy hook) |
| Photos don't load | The image host isn't allowed (`IMAGE_HOSTS_EXTRA`), or the R2 object isn't public |
