import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateRegistry, validateSite } from '../scripts/validate-content.mjs';
import { loadSite, loadSites, readRegistry, SITES } from '../src/sites/index.mjs';
import { licenceAssets, licenceStatus } from '../src/sites/licences.mjs';
import { formatJson, siteFiles, withoutRoot, withSite } from '../src/sites/store.mjs';
import { verificationEntries, verificationStatus } from '../src/sites/verification.mjs';
import { eastvale, writeSitesDir } from './fixtures/sites.mjs';

const clone = value => structuredClone(value);
const spurs = SITES.find(site => site.slug === 'spurs');
/** The real sites plus the fictional ones (test/fixtures/sites.mjs), for what needs more than one site. */
const FIXTURE = pathToFileURL(`${writeSitesDir()}/`);
const FIXTURE_SITES = loadSites(FIXTURE);
/** The fixture registry: every site in order, no root site (the landing page at /). */
const fixtureRegistry = () => clone(readRegistry(FIXTURE));

test('every registered site passes content validation', () => {
  for (const site of SITES) assert.deepEqual(validateSite(site), [], site.slug);
});

test('broken references are reported, not silently rendered', () => {
  const site = clone(spurs);
  site.featured = [...site.featured, 'nobody'];
  site.people[0].role = 'mascot';
  site.people[1].hero = '999';
  site.people[2].bio[0] += ' (verify date)';
  site.theme.brand = 'navy';
  site.vocab.notAKey = 'x';
  const problems = validateSite(site).join('\n');
  assert.match(problems, /featured "nobody" is not in people\.json/);
  assert.match(problems, /\.role is not one of this site’s roles/);
  assert.match(problems, /image "999" is not in images\.json/);
  assert.match(problems, /contains a review note/);
  assert.match(problems, /theme\.brand must be a #rrggbb colour/);
  assert.match(problems, /vocab\.notAKey is not a known wording key/);
});

test('indexable, lang, orgType and person sameAs are validated; unknown settings are rejected', () => {
  const ok = clone(eastvale());
  ok.indexable = true;
  ok.lang = 'en-US';
  ok.people[0].sameAs = ['https://www.wikidata.org/wiki/Q1', 'https://en.wikipedia.org/wiki/Example'];
  assert.deepEqual(validateSite(ok), []);
  const site = clone(spurs);
  site.indexable = 'yes';
  site.lang = 'fr-FR';
  site.orgType = 'Club';
  site.layoutMode = 'wide';
  site.people[0].sameAs = ['http://insecure.example', 'https://dup.example', 'https://dup.example'];
  site.people[1].nickname = 'x';
  const problems = validateSite(site).join('\n');
  assert.match(problems, /indexable must be true or false/);
  assert.match(problems, /lang must be one of en-GB, en-US/);
  assert.match(problems, /orgType must be one of SportsTeam, SportsOrganization/);
  assert.match(problems, /layoutMode is not a site setting/);
  assert.match(problems, /sameAs "http:\/\/insecure\.example" must be an https URL/);
  assert.match(problems, /sameAs lists a URL twice/);
  assert.match(problems, /nickname is not a person field/);
  // Indexing is the public launch: no demo pages, no placeholder (shell) content.
  const demo = clone(spurs);
  demo.demoHome = true;
  demo.indexable = true;
  assert.match(validateSite(demo).join('\n'), /indexable cannot be true while demoHome or demoProfiles are set/);
  const shell = clone(spurs);
  shell.status = 'shell';
  shell.indexable = true;
  delete shell.demoHome;
  delete shell.demoProfiles;
  assert.match(validateSite(shell).join('\n'), /indexable cannot be true on a shell site/);
});

test('tracking and consent are validated against strict patterns; reserved slugs are rejected', () => {
  const ok = clone(spurs);
  ok.tracking = { gtmId: 'GTM-ABC1234', ga4Id: 'G-ABCDEF1234' };
  ok.consent = { required: true };
  assert.deepEqual(validateSite(ok), []);
  const site = clone(spurs);
  site.tracking = { gtmId: 'GTM-abc"><script>', ga4Id: 'UA-1234-1', pixelId: '1' };
  site.consent = { required: 'yes', banner: true };
  const problems = validateSite(site).join('\n');
  assert.match(problems, /tracking\.gtmId must look like GTM-XXXXXXX/);
  assert.match(problems, /tracking\.ga4Id must look like G-XXXXXXXXXX/);
  assert.match(problems, /tracking\.pixelId is not a tracking setting/);
  assert.match(problems, /consent\.required must be true or false/);
  assert.match(problems, /consent\.banner is not a consent setting/);
  assert.match(validateSite({ ...clone(spurs), tracking: 'GTM-ABC1234' }).join('\n'), /tracking must be \{ gtmId\?, ga4Id\? \}/);
  assert.match(validateSite({ ...clone(spurs), slug: 'api' }).join('\n'), /slug is reserved/);
});

test('registry domains: valid hostnames, one site per host, known slugs, never the hub', () => {
  const registry = fixtureRegistry();
  registry.domains = {
    spurs: { primary: 'spurslegends.com', aliases: ['www.spurslegends.com'], live: false },
    northbridge: { primary: 'northbridgelegends.example', aliases: [], live: true },
  };
  assert.deepEqual(validateRegistry(registry, FIXTURE_SITES), []);
  registry.domains = {
    spurs: { primary: 'https://spurslegends.com', aliases: ['www.SpursLegends.com', 'shared.example'], live: 'soon' },
    northbridge: { primary: 'shared.example', aliases: ['appearances.getapeptalk.com'], live: true, redirect: 'x' },
    nobody: { primary: 'nobody.example', aliases: [], live: false },
    eastvale: { primary: 'eastvale.example:8080', aliases: 'www.eastvale.example', live: true },
  };
  const problems = validateRegistry(registry, FIXTURE_SITES).join('\n');
  assert.match(problems, /domains\.spurs\.primary "https:\/\/spurslegends\.com" must be a lowercase hostname/);
  assert.match(problems, /domains\.spurs\.aliases "www\.SpursLegends\.com" must be a lowercase hostname/);
  assert.match(problems, /domains\.spurs\.live must be true or false/);
  assert.match(problems, /domains\.northbridge\.primary "shared\.example" is already used by "spurs"/);
  assert.match(problems, /domains\.northbridge\.aliases "appearances\.getapeptalk\.com" is the hub's host/);
  assert.match(problems, /domains\.northbridge\.redirect is not a domain setting/);
  assert.match(problems, /domains\.nobody is not a site in order/);
  assert.match(problems, /domains\.eastvale\.primary "eastvale\.example:8080" must be a lowercase hostname/);
  assert.match(problems, /domains\.eastvale\.aliases must be a list of hostnames/);
  assert.match(validateRegistry({ ...fixtureRegistry(), domains: [] }, FIXTURE_SITES).join('\n'), /domains must be an object/);
});

test('registry rootSite is optional (the landing page at /); when set it must be an active site in order', () => {
  const registry = fixtureRegistry();
  assert.equal(registry.rootSite, undefined, 'the fixture registry serves the landing page at /');
  assert.deepEqual(validateRegistry(registry, FIXTURE_SITES), []);
  assert.deepEqual(validateRegistry({ ...registry, rootSite: 'spurs' }, FIXTURE_SITES), []);
  assert.match(validateRegistry({ ...registry, rootSite: 'nobody' }, FIXTURE_SITES).join('\n'), /rootSite "nobody" is not in order/);
  const inactive = FIXTURE_SITES.map(site => (site.slug === 'spurs' ? { ...site, active: false } : site));
  assert.match(validateRegistry({ ...registry, rootSite: 'spurs' }, inactive).join('\n'), /rootSite "spurs" is inactive, so \/ would 404/);
  assert.deepEqual(validateRegistry(registry, inactive), [], 'no root site: any site may be inactive');
  // withSite keeps an absent root absent (no `"rootSite": undefined` key), sets it with { root }, and withoutRoot clears it.
  assert.equal('rootSite' in withSite(registry, 'new-club'), false);
  assert.equal(withSite(registry, 'new-club', { root: true }).rootSite, 'new-club');
  assert.equal(withSite({ ...registry, rootSite: 'spurs' }, 'new-club').rootSite, 'spurs');
  assert.deepEqual(withoutRoot({ ...registry, rootSite: 'spurs' }), registry);
});

test('faqOverrides must use known FAQ keys and a string or { q, a } value', () => {
  const site = clone(spurs);
  site.faqOverrides = {
    'How far in advance should we book?': 'Old question-text key.',
    leadTime: ['Old array form', 'answer'],
    travel: { q: 'Can {first|speakers} travel?', extra: 'x' },
    cost: { a: 'A new answer only.' },
  };
  const problems = validateSite(site).join('\n');
  assert.match(problems, /faqOverrides\.How far in advance should we book\? is not an FAQ key/);
  assert.match(problems, /faqOverrides\.leadTime must be an answer string or \{ q, a \}/);
  assert.match(problems, /faqOverrides\.travel must be an answer string or \{ q, a \}/);
  assert.doesNotMatch(problems, /faqOverrides\.cost/);
});

test('shell sites may use null images but real sites may not', () => {
  const site = clone(spurs);
  site.people[0].hero = null;
  assert.match(validateSite(site).join('\n'), /image "null"/);
  site.status = 'shell';
  assert.doesNotMatch(validateSite(site).join('\n'), /image "null"/);
});

/** A stored site (with its licences) as the validator and admin see it, not the published copy. */
const stored = slug => loadSite(slug);
const approveAll = site => {
  const licences = { images: {}, marks: {} };
  for (const asset of licenceAssets(site))
    licences[asset.kind === 'image' ? 'images' : 'marks'][asset.id] = { url: asset.url, approvedAt: '2026-10-19' };
  return licences;
};

test('licences.json shape errors are problems; missing or stale approvals are not', () => {
  const site = stored('spurs');
  const [id, url] = Object.entries(site.images)[0];
  assert.deepEqual(validateSite({ ...site, licences: { images: { [id]: { url: `${url}-old` } }, marks: {} } }), [], 'stale is a warning');
  site.licences = {
    images: { 'not-an-image': { url }, [id]: { url: 'http://insecure.example/x.jpg', approvedAt: '19/10/2026', by: 'me' } },
    marks: { badge: { url } },
    extra: {},
  };
  const problems = validateSite(site).join('\n');
  assert.match(problems, /licences\.extra is not a licences key/);
  assert.match(problems, /licences\.images\.not-an-image is not an image in images\.json/);
  assert.match(problems, new RegExp(`licences\\.images\\.${id}\\.url must be the https URL`));
  assert.match(problems, new RegExp(`licences\\.images\\.${id}\\.approvedAt must be a YYYY-MM-DD date`));
  assert.match(problems, new RegExp(`licences\\.images\\.${id}\\.by is not a licence field`));
  assert.match(problems, /licences\.marks\.badge is not a mark this site uses/);
  assert.match(validateSite({ ...site, licences: [] }).join('\n'), /licences\.json must be an object/);
});

test('licenceStatus counts every image and mark, tracks stale approvals and ignores shell placeholders', () => {
  const site = stored('spurs');
  const marks = ['crest', 'wordmark'].filter(name => site.marks[name]).length;
  const total = Object.keys(site.images).length + marks;
  assert.deepEqual(licenceStatus(site), { total, approved: 0, missing: licenceAssets(site), stale: [] });
  site.licences = approveAll(site);
  assert.equal(licenceStatus(site).approved, total);
  site.marks = { ...site.marks, crest: `${site.marks.crest}?v=2` };
  const status = licenceStatus(site);
  assert.equal(status.approved, total - 1);
  assert.deepEqual(
    status.stale.map(asset => asset.id),
    ['crest'],
  );
  const shell = { slug: 'x', status: 'shell', images: {}, marks: { crest: null, wordmark: null }, people: [{ hero: null }] };
  assert.deepEqual(licenceStatus(shell), { total: 0, approved: 0, missing: [], stale: [] });
});

test('licences never reach the renderer, and only sites with approvals get a licences.json', () => {
  assert.ok(
    SITES.every(site => !('licences' in site)),
    'published sites carry no licence data',
  );
  const site = stored('spurs');
  assert.ok(!('src/sites/spurs/licences.json' in siteFiles(site)), 'no approvals, no file');
  assert.equal(siteFiles(site, { licencesPresent: true })['src/sites/spurs/licences.json'], formatJson({ images: {}, marks: {} }));
  site.licences = approveAll(site);
  assert.equal(siteFiles(site)['src/sites/spurs/licences.json'], formatJson(site.licences));
});

test('npm run validate prints a licence line per site and --strict-licences gates on active sites only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'appearances-validate-'));
  try {
    // The real sites plus the fictional ones, so one of them can be inactive.
    writeSitesDir({ dir });
    const stored = slug => loadSite(slug, pathToFileURL(`${dir}/`));
    const script = fileURLToPath(new URL('../scripts/validate-content.mjs', import.meta.url));
    const run = (...flags) => spawnSync(process.execPath, [script, '--dir', dir, ...flags], { encoding: 'utf8' });
    const plain = run();
    assert.equal(plain.status, 0, plain.stderr);
    const spurs = stored('spurs');
    assert.match(plain.stdout, new RegExp(`^spurs: 0/${licenceStatus(spurs).total} assets licensed$`, 'm'));
    assert.equal(run('--strict-licences').status, 1);

    const order = readRegistry(pathToFileURL(`${dir}/`)).order;
    for (const slug of order) await writeFile(join(dir, slug, 'licences.json'), formatJson(approveAll(stored(slug))));
    assert.equal(run('--strict-licences').status, 0);

    const licences = approveAll(spurs);
    const [first] = Object.keys(licences.images);
    licences.images[first].url += '-old';
    await writeFile(join(dir, 'spurs', 'licences.json'), formatJson(licences));
    const stale = run('--strict-licences');
    assert.equal(stale.status, 1);
    assert.match(stale.stdout, /^spurs: \d+\/\d+ assets licensed \(1 changed since approval\)$/m);

    // An inactive site's missing approvals do not fail the launch gate.
    await writeFile(join(dir, 'northbridge', 'licences.json'), formatJson({ images: {}, marks: {} }));
    const northbridge = JSON.parse(await readFile(join(dir, 'northbridge', 'site.json'), 'utf8'));
    await writeFile(join(dir, 'northbridge', 'site.json'), formatJson({ slug: 'northbridge', active: false, ...northbridge }));
    await writeFile(join(dir, 'spurs', 'licences.json'), formatJson(approveAll(spurs)));
    const gated = run('--strict-licences');
    assert.equal(gated.status, 0, gated.stdout + gated.stderr);
    assert.match(gated.stdout, /^northbridge: 0\/\d+ assets licensed \[inactive\]$/m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** Every built entry fully checked against its current content. */
const verifyAll = site => {
  const verification = { pages: {}, people: {} };
  for (const entry of verificationEntries(site))
    verification[entry.group][entry.key] = {
      items: Object.fromEntries(entry.checklist.map(([key]) => [key, { checkedAt: '2026-10-19' }])),
      fingerprint: entry.fingerprint,
    };
  return verification;
};

test('verification.json shape errors are problems; missing or stale checks are not', () => {
  const site = stored('spurs');
  const stale = verifyAll(site);
  stale.people[site.people[0].slug].fingerprint = 'outdated';
  assert.deepEqual(validateSite({ ...site, verification: stale }), [], 'stale is a warning');
  site.verification = {
    pages: {
      contact: { items: {}, fingerprint: 'x' },
      home: { items: { colours: { checkedAt: '2026-10-19' }, copy: { checkedAt: 'today' } } },
    },
    stories: {},
    people: {
      nobody: { items: {}, fingerprint: 'x' },
      [site.people[0].slug]: { items: { photos: { checkedAt: '2026-10-19', by: 'me' } }, fingerprint: 'x', extra: 1 },
    },
    other: {},
  };
  const problems = validateSite(site).join('\n');
  assert.match(problems, /verification\.other is not a verification key/);
  assert.match(problems, /verification\.pages\.contact is not a page/);
  assert.match(problems, /verification\.pages\.home\.fingerprint is required/);
  assert.match(problems, /verification\.pages\.home\.items\.colours is not a checklist item/);
  assert.match(problems, /verification\.pages\.home\.items\.copy needs a YYYY-MM-DD checkedAt/);
  assert.match(problems, /verification\.people\.nobody is not a person in people\.json/);
  assert.match(problems, /verification\.stories is no longer supported \(stories were removed\)/);
  assert.match(problems, /verification\.people\.[a-z0-9-]+\.extra is not a field/);
  assert.match(problems, /verification\.people\.[a-z0-9-]+\.items\.photos\.by is not valid/);
});

test('verificationStatus counts built pages and visible people, and spots changed content', () => {
  const site = stored('spurs');
  const visible = items => items.filter(item => item.active !== false).length;
  // Spurs builds five checklist pages: its hospitality page is switched off in site.json.
  const pages = 5;
  assert.equal(verificationStatus(site).total, pages + visible(site.people));
  site.verification = verifyAll(site);
  assert.equal(verificationStatus(site).verified, verificationStatus(site).total);

  site.pages = { hospitality: false, about: false };
  site.people[0] = { ...site.people[0], active: false };
  const status = verificationStatus(site);
  assert.equal(status.total, pages - 1 + visible(site.people), 'switched-off pages and hidden people');
  assert.ok(!('pages:hospitality' in status.entries) && !(`people:${site.people[0].slug}` in status.entries));

  const legends = () => verificationEntries(site).find(entry => entry.key === 'legends').fingerprint;
  const legendsBefore = legends();
  site.people[1] = { ...site.people[1], honour: `${site.people[1].honour}!` };
  const changed = verificationStatus(site).entries[`people:${site.people[1].slug}`];
  assert.deepEqual(changed, { done: 0, total: 7, stale: true, state: 'changed' });
  assert.equal(legends(), legendsBefore, 'a profile-only edit leaves the legends index alone');
});

test('verification never reaches the renderer, and only sites with checks get a verification.json', () => {
  assert.ok(SITES.every(site => !('verification' in site)));
  const site = stored('spurs');
  assert.ok(!('src/sites/spurs/verification.json' in siteFiles(site)));
  site.verification = verifyAll(site);
  assert.equal(siteFiles(site)['src/sites/spurs/verification.json'], formatJson(site.verification));
});

test('validate prints a verification line per site; --strict-verification and --strict gate on active sites', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'appearances-verify-'));
  try {
    await cp(fileURLToPath(new URL('../src/sites/', import.meta.url)), dir, { recursive: true });
    const script = fileURLToPath(new URL('../scripts/validate-content.mjs', import.meta.url));
    const run = (...flags) => spawnSync(process.execPath, [script, '--dir', dir, ...flags], { encoding: 'utf8' });
    const plain = run();
    assert.equal(plain.status, 0, plain.stderr);
    const spurs = stored('spurs');
    assert.match(plain.stdout, new RegExp(`^spurs: 0/${verificationStatus(spurs).total} pages and profiles verified$`, 'm'));
    assert.equal(run('--strict-verification').status, 1);

    for (const slug of readRegistry().order) await writeFile(join(dir, slug, 'licences.json'), formatJson(approveAll(stored(slug))));
    assert.equal(run('--strict-licences').status, 0);
    const strict = run('--strict');
    assert.equal(strict.status, 1, 'licences done, verification not');
    assert.match(strict.stderr, /unverified pages or profiles/);

    for (const slug of readRegistry().order) await writeFile(join(dir, slug, 'verification.json'), formatJson(verifyAll(stored(slug))));
    assert.equal(run('--strict').status, 0);
    const verification = verifyAll(spurs);
    verification.pages.home.fingerprint = 'outdated';
    verification.people[spurs.people[0].slug].fingerprint = 'outdated';
    await writeFile(join(dir, 'spurs', 'verification.json'), formatJson(verification));
    const stale = run('--strict-verification');
    assert.equal(stale.status, 1);
    assert.match(stale.stdout, /^spurs: \d+\/\d+ pages and profiles verified \(2 changed\)$/m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('leftover stories content is a validation error, so it cannot linger unnoticed', () => {
  const site = stored('spurs');
  const problems = validateSite({
    ...site,
    stories: [],
    pages: { stories: true },
    vocab: { ...site.vocab, storiesHeadline: 'x', navLabels: { stories: 'Stories' } },
  }).join('\n');
  assert.match(problems, /spurs: stories is no longer supported \(stories were removed\)/);
  assert.match(problems, /spurs: pages\.stories is no longer supported/);
  assert.match(problems, /vocab\.storiesHeadline is not a known wording key/);
  assert.match(problems, /vocab\.navLabels\.stories is not a nav label/);
});

test('assembleSite ignores stories in an older research config', async () => {
  const { assembleSite } = await import('../src/sites/scaffold.mjs');
  const story = { slug: 'old', kind: 'Interview', mins: 3, title: 'Old', image: '1', body: ['x'] };
  const site = assembleSite({
    slug: 'x',
    config: { club: {}, roles: [], eras: [], stories: [story], images: { 1: 'https://example.com/1.jpg' } },
  });
  assert.ok(!('stories' in site));
  assert.deepEqual(site.images, {}, 'story-only images are not kept');
});

test('Event Spaces requires complete content and a safe partner URL only when enabled', () => {
  const site = clone(spurs);
  for (const config of [undefined, {}, { url: '' }, { heading: 'Event spaces' }]) {
    site.eventSpaces = config;
    assert.deepEqual(validateSite(site), []);
  }
  site.eventSpaces = { ...spurs.eventSpaces };
  assert.deepEqual(validateSite(site), []);
  site.eventSpaces.url = 'javascript:alert(1)';
  assert.match(validateSite(site).join('\n'), /eventSpaces.url must be an https URL/);
  site.eventSpaces = { url: 'https://www.tottenhamhotspurstadium.com/venue-hire/', image: 'missing' };
  const problems = validateSite(site).join('\n');
  assert.match(problems, /eventSpaces.heading is required/);
  assert.match(problems, /eventSpaces.copy is required/);
  assert.match(problems, /eventSpaces.buttonText is required/);
  assert.match(problems, /eventSpaces.imageAlt is required/);
  assert.match(problems, /eventSpaces.image image "missing" is not in images.json/);
  for (const config of [null, [], 'venue', { url: 123 }, { url: '', extra: true }]) {
    site.eventSpaces = config;
    assert.ok(validateSite(site).some(problem => problem.includes('eventSpaces')));
  }
});
