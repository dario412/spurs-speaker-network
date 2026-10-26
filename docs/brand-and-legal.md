# Brand, licensing and consent

These sites are **concept demos**. Nothing here is licensed for public use yet. Before any site goes public, every item below must be resolved for that site. Turning off the password gate (`PREVIEW_PUBLIC=true`) is not a launch either: pages stay `noindex` until the site's `indexable` flag is set (see [Launch SEO checklist](#launch-seo-checklist)).

## What is placeholder today

| Item | Current state | Needed for launch |
|---|---|---|
| Photos | Getty Images **watermarked comps**, hotlinked. Comps are licensed for layout and internal review only. | Licensed files (Getty or the organisation's archive) stored in PepTalk's object storage (Cloudflare R2), with credit lines |
| Club and league marks | Hotlinked from the organisation's CDN or Wikimedia | Master files supplied by the organisation, used per its brand guidelines (clear space, minimum size, colourways) |
| Display fonts | Free stand-ins (Barlow Condensed, Outfit) | The organisation's licensed fonts, if it wants them used |
| "Official" wording | Used throughout | Written agreement and approved wording from each organisation |
| People | Researched profiles with original copy | Written consent from each person (or their agent), and their image rights |
| Facts | Researched, with verify lists in each PR | Checked against the organisation's archive |
| Testimonials, event stories, metrics | Placeholders, labelled as such | Real, approved client quotes and case studies |
| Terms and privacy | `src/copy/legal/terms.md` and `privacy.md` are **placeholder** copies of getapeptalk.com's own documents (`status: placeholder`), shown on every site and the hub | Terms and a privacy policy reviewed for the Appearances sites (the enquiry flow, partner branding, who the controller is), replacing both files |
| Enquiry form | Validates in the browser and on the server (`POST /api/enquiry`); **sends nothing** until `ENQUIRY_WEBHOOK_URL` is set ([vercel.md](vercel.md#enquiry-webhook)). Its consent line links the placeholder terms and privacy pages. | The webhook connected to PepTalk's enquiry pipeline, a Vercel Firewall rate-limit rule, and the privacy policy naming that processing |
| Tracking and cookies | None: no site sets `tracking`, so no tag or cookie is ever loaded. The consent banner (`site.json → consent.required`) is a placeholder. | Legal review (UK GDPR / PECR) of the banner wording, the cookie and which sites need it, before any site sets `tracking` |
| Licence record | Nothing approved (`npm run validate` prints `0/N assets licensed` per site) | All assets licensed in the admin (`npm run validate -- --strict-licences` passes) |
| Verification | Nothing checked (`npm run validate` prints `0/N pages and profiles verified` per site) | Every page and profile verified in the admin's **Verification** tab. Launch needs `npm run validate -- --strict` (licences and verification) to pass. |

Licence approvals are recorded per picture and per mark in the admin's **Licences** tab (`src/sites/<slug>/licences.json`, see [content-model.md](content-model.md#licencesjson)). An approval covers one exact URL: if the file changes, it shows as "changed since approval" until someone approves it again. Missing approvals never block publishing; they show as amber alerts in the admin and as warnings from `npm run validate`. `--strict-licences` turns them into a failure for published sites.

**Launch checklist item: replace the placeholder terms and privacy text** (`src/copy/legal/*.md`) with versions reviewed for the Appearances sites, and drop `status: placeholder` from their frontmatter. The legal pages aren't part of the per-site verification checklists, so this is a separate, one-off sign-off for all sites.

Verification works the same way, per page and profile ([content-model.md](content-model.md#verificationjson)): a checklist confirms photos, facts, consent, original copy, sensitive topics and approvals, and a content change marks it "changed since verification" until someone re-confirms it. **The launch gate is `npm run validate -- --strict`**, which needs every active site fully licensed and verified.

## Launch SEO checklist

Do this per site, after everything above is resolved for it. The SEO and AEO features are built and tested already; they switch on with one flag ([content-model.md → Indexing](content-model.md#indexing-the-launch-switch)).

1. **Set the canonical origin.** `PUBLIC_ORIGIN` in Vercel's production environment must be the hub's public URL (`https://appearances.getapeptalk.com`). For a site on its own domain, follow the [domain runbook](domains.md#pointing-a-domain-runbook-per-site) first and set `live: true`: its canonicals, sitemap, Open Graph and structured data then use the domain, and steps 6 and 7 apply to the domain (its `/robots.txt` and `/sitemap.xml`).
2. **Remove demo flags** (`demoHome`, `demoProfiles`) and confirm the site isn't a shell (`status`). The validator refuses `indexable` otherwise.
3. **Replace the placeholder testimonials** (`vocab.quote`, `profileQuote`, `quoteCite`), event stories and metrics with approved ones, or remove them. They are never marked up as reviews, and must not be.
4. **Replace the placeholder legal text** (above). Until `status: placeholder` is gone, the terms and privacy pages stay `noindex` and out of the sitemaps.
5. **Add `sameAs`** to the people whose official profiles you can confirm (organisation page, Wikipedia or Wikidata).
6. **Set `"indexable": true`** in `src/sites/<slug>/site.json` (and `registry.json → indexable` if the hub should be indexed too). Run `npm run validate -- --strict` and `npm run check`, then deploy to production. Preview deployments never index, so check the production URL:
   - a page's source has `<meta name="robots" content="index, follow, …">` and no `X-Robots-Tag: noindex` header
   - `/robots.txt` allows `/<slug>/` and names the sitemap; `/sitemap.xml` lists `/<slug>/sitemap.xml`
   - the site opens without a password, and other sites still ask for one
7. **Verify in Google Search Console and Bing Webmaster Tools** (DNS TXT record for the domain property), and submit `https://<origin>/sitemap.xml` in both.
8. **Validate rich results** on the home page, the roster, two profiles and the about page with Google's Rich Results Test (https://search.google.com/test/rich-results) and the Schema Markup Validator (https://validator.schema.org/). Expect Organization, WebSite, BreadcrumbList, ProfilePage/Person, ItemList and FAQPage, with no errors. (Google stopped showing FAQ rich results in 2026; the FAQPage markup stays valid schema.org for other engines.)
9. **Request indexing** of the home page in Search Console, and watch Page indexing and Core Web Vitals for the first weeks.
10. **To undo a launch,** set `indexable` back to `false`, or set `SEARCH_INDEXING=off` in Vercel to switch indexing off everywhere, and redeploy.

## Rules that apply now

- **Original copy only:** no copied bios, no quotes attributed to real people (real or invented), no contested numbers. The placeholder testimonials are unattributed and labelled.
- **Sensitive topics:** leave out medical, legal and personal controversy, and anyone who has died. When in doubt, leave it out and note it in the PR.
- **Marks:** never redraw, recolour, stretch or crop them. Show each organisation's marks only on its own site, plus its tile on the landing page.
- **Isolation:** one partner must never see another's pitch. Use per-site passwords when sending a link.
- **Naming conflicts:** several organisations run their own programmes with similar names ("NBA Legends", "NFL Legends Community", "MotoGP Legends", F1 Experiences). Get naming sign-off before launch.
