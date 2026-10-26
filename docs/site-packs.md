# Site packs

A site pack is a whole site in one zip file, `<slug>.site-pack.zip`. It lets a site be built anywhere: the `/new-appearances-site --pack` skill, a scratch checkout or a cloud agent. A human then reviews and imports it in the admin, with nothing committed by the agent.

```
skill / new-site --pack / assemble-site --pack ──► wimbledon.site-pack.zip ──► admin: New site → Upload a site pack
                                                                               └─ review, preview, Import (inactive)
pack-site / admin "Download pack" ──► <slug>.site-pack.zip ──► another checkout (move a site)
```

## Format (version 1)

A plain zip (stored or deflate entries, no encryption, no zip64) holding only these files:

| File | Required | What it is |
|---|---|---|
| `manifest.json` | yes | `{ "format": "peptalk-appearances-site-pack", "version": 1, "slug", "orgName", "mode": "shell" \| "populated", "createdAt", "generator" }` |
| `site.json`, `people.json`, `images.json` | yes | The site exactly as in `src/sites/<slug>/`, in the canonical JSON format ([content-model.md](content-model.md)) |
| `verify.md` | no | The verify list for the human reviewer: facts to confirm, current jobs (which drive `limited`), naming conflicts, people left out and why, image concerns |
| `og/<slug>.jpg`, `og/<slug>-<page>.jpg` | no | Open Graph cards from `npm run og-cards` (`<page>` is `legends`, `ways-to-book`, `hospitality`, `about` or `check-availability`) |
| `licences.json`, `verification.json` | no | Normally absent: licences and verification are done by a human after import |

Anything else (other files, folders, cards for another slug, a non-JPEG card) makes the pack unusable, with a message naming the problem. `verify.md` is shown on the admin's review page and printed by `import-pack`. It is **not** stored in the site's content: it belongs in the PR description, like every verify list.

Readers check the version: a pack with a version newer than the reader knows is refused, with a message to update the repository.

## Making a pack

| How | Command |
|---|---|
| Shell site | `npm run new-site -- --slug wimbledon --name "Wimbledon" … --pack [--out dir] [--verify verify.md]` |
| Populated site | `npm run assemble-site -- --slug f1 --config … --people … --pack [--out research] [--verify research/f1-verify.md]` (without `--verify`, the `verify` lists from the research files become `verify.md`) |
| Existing site | `npm run pack-site -- --slug spurs [--out dir] [--verify verify.md]`, or the admin's **Download pack** on the Sites list |
| The skill | `/new-appearances-site "Wimbledon" --shell --pack` (see `.claude/commands/new-appearances-site.md`) |

With `--pack`, `new-site` and `assemble-site` write nothing to `src/sites/` and leave the registry alone. Packs include the site's og cards when `public/og/` has them.

## Importing a pack

- **Admin** (`npm run admin`): Sites → **Upload a site pack**. The review page shows:
  - the manifest
  - people counts by role and the image count
  - og cards
  - licence and verification status (all unapproved, as expected)
  - the verify list (as text, with headings and bullets only)
  - any validation problems, which block the import
  - **Preview the site**, which renders the pack in memory before anything is written

  **Import** writes through the normal storage (local files or a GitHub branch and PR) and appends the site to the registry. Uploaded packs are held in memory only, for 30 minutes (five at most), and nothing is written until Import.
- **Command line:** `npm run import-pack -- wimbledon.site-pack.zip [--root] [--publish] [--force]`. Same checks, same result.

Rules for both:
- A new site is imported **inactive** unless *Publish now* / `--publish`. *Make root* / `--root` (make `/` redirect to the site instead of serving the landing page) needs it published.
- A slug that already exists is refused unless *Replace existing site* / `--force`. Replacing:
  - overwrites that site's content files and og cards
  - keeps its place in the registry order and its live or inactive state
  - keeps any licence approvals and verification checks the pack doesn't carry, pruned to what still exists
- A slug that is an old redirect in `registry.json` can't be imported.
- After import: `npm run check`, then tick licences and work through verification in the admin before publishing.

## Safety

Packs come from outside the repository, so the reader (`src/sites/zip.mjs`) is strict:
- it trusts the central directory only
- it refuses encryption, zip64, multi-disk archives, duplicate names, absolute paths, `.`/`..` segments, backslashes and symbolic links
- it caps the zip at 15 MB, the unpacked total at 30 MB and the entry count at 50
- it inflates each entry with a hard limit at its declared size, so a zip bomb fails instead of filling memory
- it verifies every CRC

The admin accepts uploads only on that route, as `multipart/form-data` up to 15 MB (every other route keeps the 1 MB limit). The upload needs the same same-origin check and form token as every other change; the token is checked before the zip is opened. Pack content then goes through the same validator as every save, and files are only ever written under `src/sites/<slug>/` and `public/og/`.
