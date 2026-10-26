// The component gallery (lib/gallery.ts, components/gallery/): every component exported from components/site/ has an
// entry, so a new component without one fails here; every site (a shell site included) renders every entry with no
// inline styles; the gallery stays out of the public route table, sitemaps and llms.txt; and the consent banner's
// static twin matches what public/tracking.js builds. Gating: proxy.test.ts (decide) and app.test.ts (a real server).
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createJsonProvider } from '../../lib/content/json-provider.ts';
import { publishable } from '../../lib/content/publish.ts';
import type { RawSite, Site } from '../../lib/content/types.ts';
import { GALLERY_ROUTE_SEGMENT, galleryPaths, galleryRoute, isGalleryPath, siteGalleryPath } from '../../lib/gallery.ts';
import { buildManifest } from '../../lib/manifest.ts';
import { siteContext } from '../../lib/render/context.ts';
import { allPaths } from '../../lib/render/routes.ts';
import { hubLlmsTxt, siteLlmsTxt, sitemapPaths, siteSitemapEntries } from '../../lib/seo/discovery.ts';
import { ready } from '../../src/admin/next-render/index.mjs';
import { shellSite } from '../../src/sites/scaffold.mjs';
import { writeSitesDir } from '../fixtures/sites.mjs';

// The .tsx components load through the admin preview's module hooks (SWC from Next.js), registered by ready().
await ready();
type GalleryModule = typeof import('../../components/gallery/entries.tsx');
type PagesModule = typeof import('../../components/gallery/gallery.tsx');
const { GALLERY } = (await import('../../components/gallery/entries.tsx')) as GalleryModule;
const { GalleryIndex, SiteGallery } = (await import('../../components/gallery/gallery.tsx')) as PagesModule;
const { CONSENT_BANNER_TEXT, ConsentBanner } = await import('../../components/site/components.tsx');

/** The real sites plus the fictional ones (test/fixtures/sites.mjs): every site's branding, not just one. */
const provider = createJsonProvider({ sitesDir: writeSitesDir(), cache: false });
const sites: Site[] = await provider.listSites();
const legal = await provider.getLegal('terms');
const SITE_COMPONENTS = 'components/site';

/** Every component (a PascalCase function) each module in components/site/ exports. */
async function siteComponents(): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const file of readdirSync(SITE_COMPONENTS).filter(name => name.endsWith('.tsx'))) {
    const module = (await import(`../../${SITE_COMPONENTS}/${file}`)) as Record<string, unknown>;
    for (const [name, value] of Object.entries(module))
      if (typeof value === 'function' && /^[A-Z][A-Za-z0-9]*$/.test(name)) found.set(name, `${SITE_COMPONENTS}/${file}`);
  }
  return found;
}

test('every component exported from components/site/ has a gallery entry, and every entry names real exports', async () => {
  const components = await siteComponents();
  assert.ok(components.size > 30, 'components were found');
  const covered = new Set(GALLERY.flatMap(entry => entry.covers));
  for (const [name, file] of components)
    assert.ok(covered.has(name), `${name} (${file}) has no gallery entry: add one to components/gallery/entries.tsx`);
  for (const name of covered) assert.ok(components.has(name), `the gallery names ${name}, which components/site/ doesn't export`);
  const ids = GALLERY.map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'entry ids are unique');
  for (const required of ['header', 'hero', 'roles', 'card', 'featured', 'squad', 'ways', 'event-story', 'eras', 'quote', 'form', 'faq'])
    assert.ok(ids.includes(required), required);
  for (const required of ['profile-hero', 'at-a-glance', 'booking-card', 'timeline', 'gallery', 'closing', 'footer', 'legal'])
    assert.ok(ids.includes(required), required);
  for (const required of ['consent', 'beyond', 'breadcrumbs', 'badges']) assert.ok(ids.includes(required), required);
});

const render = (site: Site) =>
  renderToStaticMarkup(
    createElement(SiteGallery, {
      ctx: siteContext(site),
      demo: siteContext(site, { demo: true }),
      legal,
      sites: sites.map(({ slug, short }) => ({ slug, short })),
    }),
  );

test('every site renders every entry in its own branding: no inline styles, no tracking, a switcher to every site', () => {
  for (const site of sites) {
    const html = render(site);
    for (const entry of GALLERY) assert.ok(html.includes(`id="g-${entry.id}"`), `${site.slug}: ${entry.id}`);
    assert.doesNotMatch(html, /\sstyle="/, `${site.slug}: inline style`);
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/, `${site.slug}: no scripts of its own (no tracking)`);
    for (const other of sites) assert.ok(html.includes(`href="${siteGalleryPath(other.slug)}"`), `${site.slug} switcher: ${other.slug}`);
    assert.match(html, new RegExp(`href="${siteGalleryPath(site.slug)}" aria-current="page"`));
    // The three enquiry states, with ids that don't clash.
    assert.match(html, /<form[^>]*class="enquiry"[^>]*data-state="error"/);
    assert.match(html, /<form[^>]*class="enquiry"[^>]*data-state="sent"/);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(
      ids.filter((id, i) => ids.indexOf(id) !== i),
      [],
      `${site.slug}: duplicate ids`,
    );
  }
});

test('a shell site (placeholder people, null images) renders the whole gallery', () => {
  const shell = shellSite({ slug: 'shellco', name: 'Shell County FC', short: 'Shell County', brand: '#123456', ink: '#111111' });
  const html = render(publishable({ ...shell, licences: {}, verification: {} } as RawSite));
  for (const entry of GALLERY) assert.ok(html.includes(`id="g-${entry.id}"`), entry.id);
  assert.match(html, /Photo to come/);
});

test('the gallery index links every site’s gallery', () => {
  const html = renderToStaticMarkup(createElement(GalleryIndex, { sites }));
  for (const site of sites) assert.ok(html.includes(`href="${siteGalleryPath(site.slug)}"`), site.slug);
});

test('gallery paths: known to the proxy, routed internally, and never in the public route table, sitemaps or llms.txt', async () => {
  assert.deepEqual(galleryPaths([{ slug: 'spurs' }, { slug: 'eastvale' }]), ['/_gallery', '/_gallery/spurs', '/_gallery/eastvale']);
  for (const path of ['/_gallery', '/_gallery/', '/_gallery/spurs', '/_gallery/man-utd/']) assert.ok(isGalleryPath(path), path);
  for (const path of ['/spurs/_gallery', '/_gallery/spurs/legends', '/_galleryx', '/_gallery/Spurs', `/${GALLERY_ROUTE_SEGMENT}`])
    assert.ok(!isGalleryPath(path), path);
  assert.equal(galleryRoute('/_gallery'), `/${GALLERY_ROUTE_SEGMENT}`);
  assert.equal(galleryRoute('/_gallery/spurs/'), `/${GALLERY_ROUTE_SEGMENT}/spurs`);

  const dir = mkdtempSync(join(tmpdir(), 'gallery-og-'));
  try {
    const manifest = await buildManifest(provider, dir, {});
    for (const path of galleryPaths(sites)) assert.ok(manifest.pages.includes(path), `${path} is a known page for the proxy`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const isGallery = (text: string | null) => /_gallery|gallery--internal/.test(text ?? '');
  assert.ok(
    !allPaths(sites, '/').some(isGallery),
    'the public route table (and the integration suite’s page and link checks) leaves it out',
  );
  const launched = sites.map(site => ({ ...site, indexable: true }));
  for (const site of launched) {
    assert.ok(!siteSitemapEntries(site, { indexable: true, legalIndexable: true }).some(entry => isGallery(entry.path)), site.slug);
    const llms = siteLlmsTxt(site, 'https://appearances.example', [legal]);
    assert.ok(llms && !isGallery(llms), `${site.slug}: llms.txt`);
  }
  const slugs = launched.map(site => site.slug);
  assert.ok(!sitemapPaths(slugs, true).some(isGallery));
  const hubLlms = hubLlmsTxt(launched, slugs, true, 'https://appearances.example');
  assert.ok(hubLlms && !isGallery(hubLlms));
});

test('the consent banner twin matches the banner public/tracking.js builds (wording, labels, classes)', () => {
  const loader = readFileSync('public/tracking.js', 'utf8');
  const html = renderToStaticMarkup(createElement(ConsentBanner));
  assert.ok(loader.includes(JSON.stringify(CONSENT_BANNER_TEXT)), 'banner wording');
  for (const label of ['Accept analytics cookies', 'Reject']) {
    assert.ok(loader.includes(`'${label}'`), label);
    assert.ok(html.includes(`>${label}</button>`), label);
  }
  for (const cls of ['consent-banner', 'consent-actions', 'btn btn-blue', 'btn btn-line']) {
    assert.ok(loader.includes(`'${cls}'`), cls);
    assert.ok(html.includes(`class="${cls}"`), cls);
  }
  assert.ok(loader.includes("'Cookie choices'") && html.includes('aria-label="Cookie choices"'));
});
