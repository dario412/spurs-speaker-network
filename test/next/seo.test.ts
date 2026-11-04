// SEO and AEO building blocks (lib/seo, lib/render/images.ts, lib/behaviour.ts helpers): titles and descriptions,
// the indexing switch and its guards, sitemaps, robots.txt, llms.txt and structured data, on the real content plus the
// fictional test sites (test/fixtures/sites.mjs), and on edited copies of it (an indexable site, demo pages, hidden
// people, switched-off pages).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legendChoice, nextSlide, rosterState, rosterUrl } from '../../lib/behaviour.ts';
import { createJsonProvider } from '../../lib/content/json-provider.ts';
import type { FormatKey, Site } from '../../lib/content/types.ts';
import { personAlt, slotAlt } from '../../lib/render/alt.ts';
import { siteContext } from '../../lib/render/context.ts';
import { sitePaths } from '../../lib/render/routes.ts';
import {
  aboutCopy,
  checkAvailabilityCopy,
  clampDescription,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  fitTitle,
  hospitalityCopy,
  legalCopy,
  legendsCopy,
  profileCopy,
  TITLE_MAX,
  waysCopy,
} from '../../lib/seo/copy.ts';
import {
  hubLlmsTxt,
  hubSitemapEntries,
  robotsRules,
  siteLlmsTxt,
  sitemapIndexXml,
  sitemapPaths,
  siteSitemapEntries,
  urlsetXml,
} from '../../lib/seo/discovery.ts';
import { indexableSlugs, indexingAllowed, isHubIndexable, isSiteIndexable, langFor, ogLocale } from '../../lib/seo/indexing.ts';
import { faqNode, hubGraph, peopleListNode, personNode, servicesNode, siteGraph } from '../../lib/seo/jsonld.ts';
import { writeSitesDir } from '../fixtures/sites.mjs';
import { checkStructuredData, nodes } from './schema.ts';

const ORIGIN = 'https://appearances.example';
const provider = createJsonProvider({ sitesDir: writeSitesDir(), cache: false });
const sites = await provider.listSites();
const legal = await provider.getLegal('terms');
const byPathCopy = (site: Site) => {
  const ctx = siteContext(site, { origin: ORIGIN });
  return [
    ['legends', legendsCopy(ctx)],
    ['ways', waysCopy(ctx)],
    ['hospitality', hospitalityCopy(ctx)],
    ['about', aboutCopy(ctx)],
    ['check', checkAvailabilityCopy(ctx)],
    ['terms', legalCopy(ctx, legal)],
    ...site.people.map(person => [person.slug, profileCopy(ctx, person)] as const),
  ] as const;
};

test('titles fit the budget by trying shorter forms; descriptions clamp at a word boundary', () => {
  assert.equal(fitTitle(['x'.repeat(70), 'short'], 65), 'short');
  assert.equal(fitTitle(['x'.repeat(70), 'y'.repeat(80)], 65), 'y'.repeat(80), 'the last form is the fallback');
  const long = `${'word '.repeat(50)}end`;
  const clamped = clampDescription(long);
  assert.ok(clamped.length <= DESCRIPTION_MAX);
  assert.ok(clamped.endsWith('…'));
  assert.doesNotMatch(clamped, /\s…$/);
  assert.equal(clampDescription('  a  b \n c '), 'a b c');
});

test('every page copy on every site fits the title and description budgets', () => {
  for (const site of sites) {
    for (const [name, copy] of byPathCopy(site)) {
      assert.ok(copy.title.length <= TITLE_MAX + 10, `${site.slug} ${name}: title "${copy.title}" (${copy.title.length})`);
      assert.ok(copy.description.length >= DESCRIPTION_MIN, `${site.slug} ${name}: description too short "${copy.description}"`);
      assert.ok(copy.description.length <= DESCRIPTION_MAX, `${site.slug} ${name}: description too long`);
    }
  }
});

test('indexing: off by default, on per site, never on a preview deployment, and the kill switch wins', () => {
  const [site] = sites;
  assert.equal(isSiteIndexable(site, {}), false, 'no site is indexable today');
  assert.deepEqual(indexableSlugs(sites, {}), []);
  const launched = { ...site, indexable: true };
  assert.equal(isSiteIndexable(launched, {}), true);
  assert.equal(isSiteIndexable(launched, { VERCEL_ENV: 'preview' }), false);
  assert.equal(isSiteIndexable(launched, { VERCEL_ENV: 'production' }), true);
  assert.equal(isSiteIndexable(launched, { SEARCH_INDEXING: 'OFF' }), false);
  assert.equal(indexingAllowed({ SEARCH_INDEXING: 'on' }), true);
  assert.equal(isHubIndexable({ indexable: true }, {}), true);
  assert.equal(isHubIndexable({}, {}), false);
  assert.equal(langFor(site), site.lang ?? 'en-GB');
  assert.equal(langFor(sites.find(candidate => candidate.slug === 'eastvale')), 'en-US', 'a US club is en-US');
  assert.equal(ogLocale('en-US'), 'en_US');
});

test('sitemaps list only built, published, indexable pages', () => {
  const spurs = sites.find(site => site.slug === 'spurs') as Site;
  assert.deepEqual(siteSitemapEntries(spurs, { indexable: false, legalIndexable: true }), [], 'not indexable: empty');
  const hidden = spurs.people[spurs.people.length - 1];
  const edited: Site = {
    ...spurs,
    pages: { hospitality: false },
    people: spurs.people.filter(person => person !== hidden),
    demoHome: true,
    demoProfiles: [spurs.people[0].slug],
  };
  const paths = siteSitemapEntries(edited, { indexable: true, legalIndexable: false }).map(entry => entry.path);
  assert.ok(!paths.includes('/spurs'), 'demo home left out');
  assert.ok(!paths.includes(`/spurs/legends/${spurs.people[0].slug}`), 'demo profile left out');
  assert.ok(!paths.includes('/spurs/hospitality'), 'switched-off page left out');
  assert.ok(!paths.includes(`/spurs/legends/${hidden.slug}`), 'hidden person left out');
  assert.ok(!paths.some(path => /terms|privacy/.test(path)), 'placeholder legal pages left out');
  assert.ok(paths.includes('/spurs/legends') && paths.includes('/spurs/about'));
  for (const path of paths) assert.ok(sitePaths(edited).includes(path), `${path} is a built page`);
  const withImages = siteSitemapEntries({ ...spurs }, { indexable: true, legalIndexable: true });
  const profile = withImages.find(entry => entry.path === `/spurs/legends/${spurs.people[1].slug}`);
  assert.match(profile?.images?.[0] ?? '', /^https:\/\/media\.gettyimages\.com\//);
  const xml = urlsetXml(withImages, ORIGIN);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.match(xml, /<loc>https:\/\/appearances\.example\/spurs\/legends<\/loc>/);
  assert.doesNotMatch(xml, /&(?!amp;|lt;|gt;|quot;)/, 'URLs are XML-escaped');
  assert.equal(sitemapIndexXml([], ORIGIN).includes('<sitemap>'), false);
  assert.deepEqual(sitemapPaths(['eastvale'], true), ['/all/sitemap.xml', '/eastvale/sitemap.xml']);
  assert.deepEqual(hubSitemapEntries(false, true), []);
  assert.deepEqual(
    hubSitemapEntries(true, false).map(entry => entry.path),
    ['/'],
    'the landing page at its URL: / (no root site)',
  );
  assert.deepEqual(
    hubSitemapEntries(true, true, '/all').map(entry => entry.path),
    ['/all', '/terms', '/privacy', '/accessibility'],
  );
  const hubXml = urlsetXml(hubSitemapEntries(true, false), ORIGIN);
  assert.ok(hubXml.includes(`<loc>${ORIGIN}/</loc>`) && !hubXml.includes('/all<'), 'the hub sitemap lists / , never /all');
});

test('robots.txt disallows everything until something is indexable, then allows exactly that', () => {
  assert.deepEqual(robotsRules([], false, ORIGIN), { rules: { userAgent: '*', disallow: '/' } });
  const rules = robotsRules(['eastvale'], false, ORIGIN);
  assert.equal(rules.sitemap, `${ORIGIN}/sitemap.xml`);
  assert.equal(rules.rules.disallow, '/');
  assert.ok(rules.rules.allow?.includes('/eastvale/') && rules.rules.allow.includes('/eastvale$'));
  assert.ok(rules.rules.allow?.includes('/_next/static/') && rules.rules.allow.includes('/_next/image'), 'crawlers can render the page');
  assert.ok(!rules.rules.allow?.some(path => path.startsWith('/spurs') || path.startsWith('/all')));
  const hub = robotsRules([], true, ORIGIN).rules.allow ?? [];
  assert.ok(hub.includes('/$') && !hub.includes('/all$'), 'the landing page at /');
  assert.ok(hub.includes('/all/'), 'the hub sitemap keeps its path');
  assert.ok(hub.includes('/terms$') && hub.includes('/privacy$'));
  assert.ok(robotsRules([], true, ORIGIN, '/all').rules.allow?.includes('/all$'), 'with a root site, /all');
});

test('llms.txt: an indexable site lists its pages, people and FAQ; the hub lists only indexable sites', () => {
  const eastvale = sites.find(site => site.slug === 'eastvale') as Site;
  const text = siteLlmsTxt(eastvale, ORIGIN, [legal]);
  assert.match(text, /^# Eastvale Rovers Legends\n\n> /);
  assert.match(text, /^## Pages$/m);
  assert.match(text, /^## Optional$/m);
  for (const person of eastvale.people) assert.ok(text.includes(`(${ORIGIN}/eastvale/legends/${person.slug})`), person.slug);
  assert.doesNotMatch(text, /&amp;/, 'decoded text');
  assert.equal(hubLlmsTxt(sites, [], false, ORIGIN), null, 'nothing indexable: no hub llms.txt');
  const hub = hubLlmsTxt(sites, ['eastvale'], false, ORIGIN) ?? '';
  assert.match(hub, /\(https:\/\/appearances\.example\/eastvale\)/);
  assert.doesNotMatch(hub, /\/spurs/);
  assert.doesNotMatch(hub, /All platforms/, 'the hub isn’t indexable');
  const indexableHub = hubLlmsTxt(sites, [], true, ORIGIN) ?? '';
  assert.match(indexableHub, /^- \[All platforms\]\(https:\/\/appearances\.example\/\): every official platform in one place$/m);
  assert.doesNotMatch(indexableHub, /\/all\b/);
  assert.match(hubLlmsTxt(sites, [], true, ORIGIN, {}, '/all') ?? '', /\[All platforms\]\(https:\/\/appearances\.example\/all\)/);
});

test('structured data for every page type validates against the schema.org types we use, with no review markup', () => {
  for (const site of sites) {
    const ctx = siteContext(site, { origin: ORIGIN });
    const person = site.people[0];
    const url = `${ORIGIN}/${site.slug}`;
    const graphs = {
      home: siteGraph({ ctx, path: `/${site.slug}`, name: site.platform }),
      roster: siteGraph({
        ctx,
        path: `/${site.slug}/legends`,
        type: 'CollectionPage',
        name: 'Roster',
        crumbs: [
          { name: 'Home', path: `/${site.slug}` },
          { name: 'Roster', path: `/${site.slug}/legends` },
        ],
        mainEntity: peopleListNode(ctx, site.people, `${url}/legends`, 'Roster'),
      }),
      profile: siteGraph({
        ctx,
        path: `/${site.slug}/legends/${person.slug}`,
        type: 'ProfilePage',
        name: person.name,
        crumbs: [
          { name: 'Home', path: `/${site.slug}` },
          { name: 'Roster', path: `/${site.slug}/legends` },
          { name: person.name, path: `/${site.slug}/legends/${person.slug}` },
        ],
        mainEntity: personNode(ctx, { ...person, sameAs: ['https://www.wikidata.org/wiki/Q1'] }),
        extra: [faqNode(ctx.faq(person), `${url}/legends/${person.slug}`, ctx)],
      }),
      ways: siteGraph({
        ctx,
        path: `/${site.slug}/ways-to-book`,
        name: 'Ways',
        mainEntity: servicesNode(ctx, (Object.keys(ctx.FORMATS) as FormatKey[]).slice(0, 2), `${url}/ways-to-book`),
      }),
    };
    for (const [name, graph] of Object.entries(graphs)) assert.deepEqual(checkStructuredData(graph, `${site.slug} ${name}`), []);
    const person0 = nodes(graphs.profile).find(node => node['@type'] === 'Person');
    assert.equal(person0?.name, person.name);
    assert.deepEqual(person0?.sameAs, ['https://www.wikidata.org/wiki/Q1']);
    assert.equal(nodes(graphs.home).find(node => node['@type'] === 'Organization')?.name, 'PepTalk');
    assert.deepEqual(nodes(graphs.home).find(node => node['@type'] === 'Organization')?.sameAs, ['https://www.getapeptalk.com/']);
  }
  const noSameAs = personNode(siteContext(sites[0], { origin: ORIGIN }), sites[0].people[0]);
  assert.equal('sameAs' in noSameAs, false, 'bug: an empty sameAs array was emitted on every profile');
});

test('hub structured data: the landing page’s URL is the WebSite and the CollectionPage; legal breadcrumbs start there', () => {
  const landing = hubGraph({
    origin: ORIGIN,
    path: '/',
    name: 'Official sports talent',
    sites,
    siteHome: site => `${ORIGIN}/${site.slug}`,
  });
  assert.deepEqual(checkStructuredData(landing, 'landing'), []);
  const website = nodes(landing).find(node => node['@type'] === 'WebSite');
  assert.equal(website?.url, `${ORIGIN}/`);
  const page = nodes(landing).find(node => node['@type'] === 'CollectionPage');
  assert.equal(page?.url, `${ORIGIN}/`);
  assert.equal(nodes(landing).find(node => node['@type'] === 'ItemList')?.numberOfItems, sites.length);
  const crumbs = [
    { name: 'PepTalk Appearances', path: '/' },
    { name: 'Terms', path: '/terms' },
  ];
  const terms = hubGraph({ origin: ORIGIN, path: '/terms', name: 'Terms', crumbs });
  assert.deepEqual(checkStructuredData(terms, 'terms'), []);
  assert.equal(nodes(terms).find(node => node['@type'] === 'WebPage')?.url, `${ORIGIN}/terms`);
  const list = nodes(terms).find(node => node['@type'] === 'BreadcrumbList') as { itemListElement: { item: string }[] } | undefined;
  assert.equal(list?.itemListElement[0].item, `${ORIGIN}/`);
  // With a root site the landing page is at /all, and so is the WebSite.
  const folder = hubGraph({ origin: ORIGIN, path: '/all', landing: '/all', name: 'Official sports talent', sites });
  assert.equal(nodes(folder).find(node => node['@type'] === 'WebSite')?.url, `${ORIGIN}/all`);
  assert.equal(nodes(folder).find(node => node['@type'] === 'CollectionPage')?.url, `${ORIGIN}/all`);
});

test('the checker catches what it should', () => {
  const bad = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Person', '@id': 'https://x.test/#p', nme: 'typo' },
      { '@type': 'Review', '@id': 'https://x.test/#r' },
      {
        '@type': 'BreadcrumbList',
        '@id': 'https://x.test/#b',
        itemListElement: [{ '@type': 'ListItem', position: 2, name: 'x', item: '/x' }],
      },
      { '@type': 'WebPage', '@id': 'https://x.test/', isPartOf: { '@id': 'https://x.test/#missing' } },
    ],
  };
  const problems = checkStructuredData(bad, 'bad').join('\n');
  for (const expected of [
    'no property "nme"',
    'Person needs a name',
    'banned or invalid @type Review',
    'at least two items',
    'position 2',
    'is not in the graph',
  ])
    assert.ok(problems.includes(expected), expected);
});

test('alt text: the person and their position, or the slot caption', () => {
  assert.equal(
    personAlt({ name: 'Sandro', pos: 'Defensive midfielder · Tottenham Hotspur 2010–2014 · Brazil' }),
    'Sandro, Defensive midfielder, Tottenham Hotspur 2010–2014, Brazil',
  );
  assert.equal(slotAlt({ name: 'Sandro', line: 'Midfielder · 2010–2014' }), 'Sandro, Midfielder, 2010–2014');
});

test('bug: roster filters ignore unknown roles and topics from the URL instead of hiding every card', () => {
  const chips = [
    { filter: 'role', value: '' },
    { filter: 'role', value: 'player' },
    { filter: 'topic', value: 'leadership' },
    { filter: 'format', value: 'keynote' },
  ];
  assert.deepEqual(rosterState('?role=player&topic=leadership&q=kane', chips), {
    role: 'player',
    topic: 'leadership',
    format: '',
    sort: '',
    q: 'kane',
  });
  assert.deepEqual(rosterState('?role=goalkeeper&topic=juggling', chips), { role: '', topic: '', format: '', sort: '', q: '' });
  assert.deepEqual(rosterState('?format=keynote', chips), { role: '', topic: '', format: 'keynote', sort: '', q: '' });
  assert.deepEqual(rosterState('?format=juggling', chips), { role: '', topic: '', format: '', sort: '', q: '' });
});

test('the home carousel steps through its slides and wraps at both ends', () => {
  assert.equal(nextSlide(0, 1, 5), 1);
  assert.equal(nextSlide(4, 1, 5), 0);
  assert.equal(nextSlide(0, -1, 5), 4);
});

test('bug: updating the roster URL keeps the #fragment', () => {
  assert.equal(rosterUrl({ role: 'player', topic: '', q: '' }, '/spurs/legends', '#top'), '?role=player#top');
  assert.equal(rosterUrl({ role: '', topic: '', q: '' }, '/spurs/legends', ''), '/spurs/legends');
});

test('bug: an unknown ?legend= no longer blanks the enquiry form’s person select', () => {
  assert.equal(legendChoice('sandro', ['', 'sandro', 'dele-alli']), 'sandro');
  assert.equal(legendChoice('someone-hidden', ['', 'sandro']), null);
  assert.equal(legendChoice(null, ['', 'sandro']), null);
});
