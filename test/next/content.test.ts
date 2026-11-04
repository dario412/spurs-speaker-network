// Content layer: the JSON provider applies the publishing switches exactly like src/sites/index.mjs, the loader the admin,
// the validator and the site tools use, so both read the same content the same way.
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { createCmsProvider } from '../../lib/content/cms-provider.ts';
import { isContentError } from '../../lib/content/errors.ts';
import { createJsonProvider } from '../../lib/content/json-provider.ts';
import { parseLegal } from '../../lib/content/legal.ts';
import { imageHosts, pagesFor, personImageIds, pickImages, publishable, siteImageIds } from '../../lib/content/publish.ts';
import { selectProvider, withBuildSnapshot, withPeople } from '../../lib/content/select.ts';
import type { RawSite } from '../../lib/content/types.ts';
import { buildManifest, extraImageHosts } from '../../lib/manifest.ts';
import { loadSite, SITES as TOOL_SITES } from '../../src/sites/index.mjs';
import { writeSitesDir } from '../fixtures/sites.mjs';

const repo = createJsonProvider({ cache: false });
/** The real sites plus the fictional ones (test/fixtures/sites.mjs), for what needs more than one site. */
const fixture = createJsonProvider({ sitesDir: writeSitesDir(), cache: false });

test('published sites match the site tools’ loader exactly (order, switches, hidden people)', async () => {
  assert.deepEqual(await repo.listSites(), TOOL_SITES);
});

test('raw sites keep hidden people and bookkeeping, like loadSite()', async () => {
  const registry = await repo.getRegistry();
  for (const slug of registry.order) assert.deepEqual(await repo.getRawSite(slug), loadSite(slug));
  assert.equal((await repo.listRawSites()).length, registry.order.length);
});

test('unknown and malformed slugs never reach the filesystem', async () => {
  for (const slug of ['nope', '../registry', 'Spurs', 'spurs/../northbridge', '']) {
    assert.equal(await repo.getSite(slug), null, slug);
    assert.equal(await repo.getRawSite(slug), null, slug);
  }
});

let dir: string;
before(async () => {
  dir = writeSitesDir();
  const [first, second] = JSON.parse(await readFile(join(dir, 'registry.json'), 'utf8')).order as string[];
  const site = JSON.parse(await readFile(join(dir, first, 'site.json'), 'utf8'));
  await writeFile(join(dir, first, 'site.json'), JSON.stringify({ ...site, pages: { hospitality: false } }));
  const people = JSON.parse(await readFile(join(dir, first, 'people.json'), 'utf8'));
  const hidden = people.find((person: { slug: string }) => !site.featured.includes(person.slug));
  hidden.active = false;
  await writeFile(join(dir, first, 'people.json'), JSON.stringify(people));
  const other = JSON.parse(await readFile(join(dir, second, 'site.json'), 'utf8'));
  await writeFile(join(dir, second, 'site.json'), JSON.stringify({ ...other, active: false }));
});

test('inactive sites, hidden people and page switches are applied', async () => {
  const provider = createJsonProvider({ sitesDir: dir, cache: false });
  const [first, second] = (await provider.getRegistry()).order;
  const sites = await provider.listSites();
  assert.ok(!sites.some(site => site.slug === second), 'inactive site listed');
  assert.equal(await provider.getSite(second), null);
  assert.ok(await provider.getRawSite(second), 'raw access still sees the inactive site');
  const site = await provider.getSite(first);
  const raw = (await provider.getRawSite(first)) as RawSite;
  assert.ok(site);
  assert.equal(site.people.length, raw.people.length - 1);
  assert.ok(site.people.every(person => person.active !== false));
  assert.equal(pagesFor(site).hospitality, false);
  assert.equal(pagesFor(site).about, true);
  assert.ok(!('licences' in site) && !('verification' in site), 'bookkeeping must never reach the renderer');
});

test('image hosts are Getty plus every published site’s mark hosts', async () => {
  const hosts = imageHosts(await repo.listSites());
  assert.equal(hosts[0], 'https://media.gettyimages.com');
  for (const site of await repo.listSites()) for (const host of site.cspHosts ?? []) assert.ok(hosts.includes(host), host);
  assert.equal(new Set(hosts).size, hosts.length);
});

test('provider selection: json by default, typed errors for unknown or unconfigured providers', async () => {
  assert.ok(await selectProvider({}).getRegistry());
  const configError = (pattern: RegExp) => (error: unknown) =>
    isContentError(error) && error.code === 'config' && pattern.test(error.message);
  assert.throws(() => selectProvider({ CONTENT_PROVIDER: 'mongo' }), configError(/Unknown CONTENT_PROVIDER/));
  assert.throws(() => selectProvider({ PEOPLE_PROVIDER: 'sheets' }), configError(/Unknown PEOPLE_PROVIDER/));
  // The CMS provider needs its database; without DATABASE_URL every read is a typed config error, never empty content.
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  await assert.rejects(createCmsProvider().listSites(), configError(/CONTENT_PROVIDER=cms needs DATABASE_URL/));
  if (saved !== undefined) process.env.DATABASE_URL = saved;
  assert.throws(() => selectProvider({ PEOPLE_PROVIDER: 'airtable' }), configError(/PEOPLE_PROVIDER=airtable needs AIRTABLE_TOKEN/));
});

test('the JSON provider raises typed errors for unreadable or malformed files, never an empty site', async () => {
  const missing = createJsonProvider({ sitesDir: join(dir, 'nope'), cache: false });
  await assert.rejects(
    missing.listSites(),
    (error: unknown) => isContentError(error) && error.code === 'unavailable' && !error.message.includes(dir),
  );
  const [first] = (await repo.getRegistry()).order;
  const broken = join(dir, first, 'images.json');
  const before = await readFile(broken, 'utf8');
  await writeFile(broken, '{ not json');
  try {
    await assert.rejects(
      createJsonProvider({ sitesDir: dir, cache: false }).getSite(first),
      (error: unknown) =>
        isContentError(error) && error.code === 'invalid_content' && error.message === `${first}/images.json is not valid JSON`,
    );
  } finally {
    await writeFile(broken, before);
  }
});

test('IMAGE_HOSTS_EXTRA adds R2 hosts to next/image remote patterns and the CSP; anything but an https origin fails the build', async () => {
  const extra = 'https://media.example.com, https://pub-0123456789abcdef0123456789abcdef.r2.dev';
  assert.deepEqual(extraImageHosts({ IMAGE_HOSTS_EXTRA: extra }), [
    'https://media.example.com',
    'https://pub-0123456789abcdef0123456789abcdef.r2.dev',
  ]);
  assert.deepEqual(extraImageHosts({}), []);
  for (const bad of ['http://media.example.com', 'https://media.example.com/images', 'media.example.com'])
    assert.throws(() => extraImageHosts({ IMAGE_HOSTS_EXTRA: bad }), /IMAGE_HOSTS_EXTRA/, bad);
  const manifest = await buildManifest(repo, join(process.cwd(), 'public', 'og'), { IMAGE_HOSTS_EXTRA: extra });
  for (const host of extraImageHosts({ IMAGE_HOSTS_EXTRA: extra })) {
    assert.ok(manifest.imageHosts.includes(host), `${host} not in img-src`);
    assert.ok(manifest.photoOrigins.includes(host), `${host} not in remotePatterns`);
  }
});

test('a people provider replaces people and their images; site images and the switches still apply', async () => {
  const [slug, other] = (await fixture.getRegistry()).order;
  const raw = (await fixture.getRawSite(slug)) as RawSite;
  const [keep, hide] = raw.people;
  const x = 'https://example.test/x.jpg';
  const merged = withPeople(fixture, {
    peopleFor: async site =>
      site.slug === slug
        ? {
            people: [
              { ...keep, card: 'x' },
              { ...hide, active: false },
            ],
            images: { x, ...pickImages(raw.images, [keep.hero, ...keep.gallery, ...personImageIds(hide)]) },
          }
        : null,
  });
  const site = await merged.getSite(slug);
  assert.deepEqual(
    site?.people.map(person => person.slug),
    [keep.slug],
  );
  assert.equal(site?.images.x, x);
  for (const id of siteImageIds(raw)) if (id) assert.equal(site?.images[id], raw.images[id], `site image ${id} kept`);
  const used = new Set([...siteImageIds(raw), keep.hero, 'x', ...keep.gallery, hide.hero, hide.card, ...hide.gallery]);
  assert.deepEqual(
    Object.keys(site?.images ?? {}).sort(),
    [...used].filter((id): id is string => Boolean(id)).sort(),
    'only used images remain',
  );
  assert.equal((await merged.getRawSite(slug))?.people.length, 2);
  assert.ok(other, 'a second site');
  assert.deepEqual(await merged.getSite(other), await fixture.getSite(other), 'a site the provider doesn’t manage is unchanged');
  assert.deepEqual(publishable({ ...raw, people: [hide] }).people.length, raw.people.includes(hide) && hide.active === false ? 0 : 1);
});

test('legal documents: frontmatter stripped, title and "Last update" taken from the source', async () => {
  const privacy = await repo.getLegal('privacy');
  assert.equal(privacy.title, 'Privacy Policy');
  assert.equal(privacy.lastUpdated, '03 June 2025');
  assert.doesNotMatch(privacy.body, /^---|status: placeholder|Last update:/m);
  assert.equal(privacy.meta.status, 'placeholder');
  const terms = await repo.getLegal('terms');
  assert.equal(terms.title, 'Terms of Service');
  assert.equal(terms.lastUpdated, null);
  const parsed = parseLegal('terms', '---\ntitle: T\n---\nBody\n\nLast updated: 1 May 2026\n');
  assert.deepEqual([parsed.title, parsed.lastUpdated, parsed.body], ['T', '1 May 2026', 'Body']);
  assert.equal(parseLegal('privacy', 'No frontmatter').title, 'Privacy Policy');
});

test('build snapshot: one people read per site per build, shared with the page workers', async () => {
  const path = join(dir, 'build-snapshot');
  const raw = (await repo.getRawSite('spurs')) as RawSite;
  let reads = 0;
  const source = {
    peopleFor: async (site: RawSite) => {
      reads += 1;
      return site.slug === 'spurs' ? { people: raw.people, images: raw.images } : null;
    },
  };
  const first = withBuildSnapshot(source, path);
  assert.deepEqual(await first.peopleFor(raw), { people: raw.people, images: raw.images });
  assert.equal(await first.peopleFor({ ...raw, slug: 'northbridge' }), null);
  // A worker process: a new provider over the same file reads nothing from the source.
  const worker = withBuildSnapshot(source, path);
  assert.deepEqual(await worker.peopleFor(raw), { people: raw.people, images: raw.images });
  assert.equal(await worker.peopleFor({ ...raw, slug: 'northbridge' }), null, 'an unmanaged site is recorded too');
  assert.equal(reads, 2);
  assert.deepEqual((await readdir(path)).sort(), ['northbridge.json', 'spurs.json'], 'one file per site, no temporary files left');
});
