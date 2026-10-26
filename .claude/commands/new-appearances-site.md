---
description: Create a new club, league or association site, either a branded shell with placeholders or a fully populated site with researched people and Getty images
argument-hint: <organisation name> [--shell|--populated] [--root] [--pack]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, WebFetch
---

# /new-appearances-site

Create a site for **$ARGUMENTS** in this repository. Default to `--shell` if no mode is given. `--root` makes `/` redirect to the new site (by default `/` is the PepTalk landing page).

**`--pack`**: build the site exactly as below, but finish with a **site pack** (`<slug>.site-pack.zip`, see `docs/site-packs.md`) instead of a commit. Use it when running outside the main checkout (a scratch clone, a cloud agent) or when a human should review and import the site in the admin. With `--pack`: no branch, no commit, no PR, no registry edit; `src/sites/` is left untouched.

Read first: `CLAUDE.md`, `docs/adding-a-site.md`, `docs/content-model.md`, `docs/research-brief.md`.

## 0. Confirm

- Confirm the organisation is a PepTalk pitch or partner. The site says "official" and stays behind the password.
- Choose the slug: short, lowercase letters and digits (avoid hyphens). Make sure it isn't in `src/sites/registry.json`, either as a site or as a redirect.
- Create a branch: `content/<slug>-site` (not with `--pack`).

## 1. Brand (both modes)

Follow `docs/research-brief.md` §1:
- Read the organisation's homepage and CSS for colours, button shape, heading case and naming.
- Find the mark URLs and test them in real Chrome from a neutral origin. Use a Wikimedia fallback if the CDN blocks embedding.
- Get the copyright line from the site footer or legal page.
- Flag naming conflicts with the organisation's own programmes.

For a shell, do this yourself. For a populated site, the brand agent does it (step 3).

## 2. Shell mode

```bash
npm run new-site -- --slug <slug> --name "<organisation>" --short "<short>" \
  --brand "#…" --ink "#…" --dark "#…" --bar "#…" --wordmark "<url>" [--crest "<url>"] [--root]
```

(The admin's **New site** form does the same if a human is driving: `npm run admin`.) The command refuses to overwrite an existing folder unless you pass `--force`.

With `--pack`, still run `new-site` without `--pack` here so you can edit and review the site in this (scratch) checkout; the pack is written in step 5.

Then edit `src/sites/<slug>/site.json` so the copy reads right for the sport:
- `vocab`: roles, hospitality, fixture or calendar word, current-player wording
- `roles` and `eras` labels
- `style`: button radius and case, heading case, matching the organisation's site
- `theme` neutrals

Go to step 4.

## 3. Populated mode

1. Start **two background research agents in parallel**, each given `docs/research-brief.md` and a non-overlapping bucket:
   - **Brand and current agent:** brand, config, vocab, roles, eras, and at least 15 current stars (role `squad`), verified on the official roster that day. Output: `research/<slug>-config.json`.
   - **Legends agent:** about 30 legends (former players, managers or principals, staff, the women's game), with era keys matching the brand agent's. Output: `research/<slug>-legends.json`.
   - For big rosters, split legends across two agents by era and pass both files below.
2. When both finish, assemble:
   ```bash
   npm run assemble-site -- --slug <slug> --config research/<slug>-config.json \
     --people research/<slug>-legends.json [--era-map old=new,…] [--root]
   ```
   If validation fails, fix the research JSON (missing role, featured slug not in people, unknown wording key) and re-run. Never hand-edit around the validator.
3. Collect every agent's verify list for the PR.

## 4. Review visually

```bash
PORT=3091 npm run dev
```

Screenshot (with `puppeteer-core`, already a dev dependency; set `CHROME_PATH` if Chrome isn't found) `/<slug>`, `/<slug>/legends` and two profiles at 1280px and 390px wide, and look at them. `/_gallery/<slug>` shows every component in the new site's branding on one page. Check:
- **Branding:** theme colours applied; marks visible and undistorted; the crest treatment right on the navy, red or dark bars.
- **Hero:** the name card doesn't cover the face. Set `home.hero.tag: "br"` if it does.
- **Photos:** every photo shows the right person; no wrong-name matches, injury shots or rival kit.
- **Wording:** sport-appropriate. No football terms on a non-football site, unless intended.

## 5. Finish

**With `--pack`**, instead of the steps below:
- `npm run og-cards` if Chrome is available (the pack then carries the site's cards), and `npm run check`.
- Write the verify list (facts to confirm, current jobs, naming conflicts, people left out and why, image concerns) to `research/<slug>-verify.md`.
- `npm run pack-site -- --slug <slug> --out research --verify research/<slug>-verify.md` (for a populated site, `npm run assemble-site -- … --pack --out research --verify research/<slug>-verify.md` works too). `research/` is git-ignored.
- Do not commit, push, open a PR or keep the site in the registry of a shared checkout. In a scratch checkout, leave it as is.
- Report the pack path (below) and tell the human: *upload it in the admin, Sites → Upload a site pack, review and preview it, then Import (it arrives inactive).*

**Without `--pack`:**

- `npm run og-cards`, then commit only `public/og/<slug>*.jpg`. Discard incidental changes to other sites' cards.
- Decide whether the site goes live with the merge. To keep it out of the build until the partner is ready, set `"active": false` in `site.json`.
- `npm run check` must pass.
- Commit (`feat(<slug>): add <organisation> site`) and open a PR using the template. Include the screenshots and the combined verify list:
  - facts to confirm
  - current jobs, which drive `limited`
  - naming conflicts
  - people left out and why
  - image concerns
- After merge: if the partner should only see their own site, set `PREVIEW_PASSWORD_<SLUG>` in the Vercel project's environment variables (Production and Preview) and redeploy (`docs/deployment.md`).

## Report back

Report:
- with `--pack`: the pack's path (`research/<slug>.site-pack.zip`) and the upload instruction above, instead of a PR link
- the URL
- people counts by role
- what is placeholder
- the verify list
- anything that needs the organisation (master marks, naming sign-off, image rights)
- the verification and licence status from `npm run validate` (e.g. `man-utd: 0/58 pages and profiles verified`, `man-utd: 0/240 assets licensed`), and a pointer to the admin's Verification and Licences tabs (`npm run admin`), where the owner works through each page's and profile's checklist
