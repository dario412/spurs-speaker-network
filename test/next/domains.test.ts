// Per-site domains (lib/domains.ts): host parsing, the hub host, mounts, canonical URLs, and what a site renders on
// each mount (links, canonical, Open Graph, structured data, indexing, sitemaps, robots.txt, llms.txt).
// Host routing in the proxy is in proxy.test.ts; real Host headers against a build are in app.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJsonProvider } from '../../lib/content/json-provider.ts';
import type { Site } from '../../lib/content/types.ts';
import {
  canonicalUrl,
  type Domains,
  domainsFor,
  hubHost,
  isHostname,
  mountSegments,
  normaliseHost,
  parseMount,
  routeForHost,
} from '../../lib/domains.ts';
import { publicOrigin } from '../../lib/origin.ts';
import { pageMetadata } from '../../lib/pages/metadata.ts';
import { siteContext } from '../../lib/render/context.ts';
import {
  domainRobotsTxt,
  folderToCanonical,
  hubLlmsTxt,
  siteLlmsTxt,
  sitemapPaths,
  siteSitemapEntries,
  urlsetXml,
} from '../../lib/seo/discovery.ts';
import { siteGraph } from '../../lib/seo/jsonld.ts';
import { writeSitesDir } from '../fixtures/sites.mjs';
import { nodes } from './schema.ts';

const HUB = 'https://appearances.example';
const DOMAINS: Domains = {
  spurs: { primary: 'spurslegends.com', aliases: ['www.spurslegends.com'], live: true },
  northbridge: { primary: 'northbridgelegends.example', aliases: [], live: false },
};
/** The real sites plus the fictional ones (test/fixtures/sites.mjs). */
const sites = await createJsonProvider({ sitesDir: writeSitesDir(), cache: false }).listSites();
const spurs = sites.find(site => site.slug === 'spurs') as Site;
const northbridge = sites.find(site => site.slug === 'northbridge') as Site;

test('hosts: normalised from the Host header; hostnames validated; the hub from HUB_HOST, then PUBLIC_ORIGIN', () => {
  assert.equal(normaliseHost('SpursLegends.com:443'), 'spurslegends.com');
  assert.equal(normaliseHost('spurslegends.com.'), 'spurslegends.com');
  assert.equal(normaliseHost('[::1]:3000'), '[::1]');
  assert.equal(normaliseHost(null), '');
  for (const good of ['spurslegends.com', 'www.spurs-legends.co.uk', 'xn--bcher-kva.example', 'a.io']) assert.ok(isHostname(good), good);
  for (const bad of ['localhost', 'https://x.com', 'x.com/path', 'x.com:80', '-x.com', 'X.com', 'x..com', 'x.c', '', 'x.123'])
    assert.ok(!isHostname(bad), bad);
  assert.equal(hubHost({}), 'appearances.getapeptalk.com');
  assert.equal(hubHost({ PUBLIC_ORIGIN: 'https://hub.example/' }), 'hub.example');
  assert.equal(hubHost({ HUB_HOST: 'Staging.Hub.example', PUBLIC_ORIGIN: 'https://hub.example' }), 'staging.hub.example');
  assert.equal(hubHost({ HUB_HOST: 'not a host' }), 'appearances.getapeptalk.com');
});

test('routing table: primaries and aliases map to their site; mounts parse back; only published sites count', () => {
  assert.deepEqual(routeForHost('spurslegends.com', DOMAINS), { slug: 'spurs', domain: DOMAINS.spurs, alias: false });
  assert.deepEqual(routeForHost('www.spurslegends.com', DOMAINS), { slug: 'spurs', domain: DOMAINS.spurs, alias: true });
  assert.equal(routeForHost('appearances.getapeptalk.com', DOMAINS), null);
  assert.equal(routeForHost('evil.example', DOMAINS), null);
  assert.deepEqual(parseMount('spurs', DOMAINS), { slug: 'spurs', domain: null });
  assert.deepEqual(parseMount('spurs--domain', DOMAINS), { slug: 'spurs', domain: DOMAINS.spurs });
  assert.equal(parseMount('eastvale--domain', DOMAINS), null, 'no domain, no mount');
  assert.deepEqual(mountSegments(['spurs', 'eastvale', 'northbridge'], DOMAINS), [
    'spurs',
    'eastvale',
    'northbridge',
    'spurs--domain',
    'northbridge--domain',
  ]);
  assert.deepEqual(Object.keys(domainsFor(DOMAINS, ['northbridge'])), ['northbridge'], 'an inactive site’s domain is dropped');
});

test('canonical URLs: the domain once live, else the hub folder', () => {
  assert.equal(canonicalUrl('spurs', '/legends', DOMAINS.spurs, HUB), 'https://spurslegends.com/legends');
  assert.equal(canonicalUrl('spurs', '', DOMAINS.spurs, HUB), 'https://spurslegends.com/');
  assert.equal(canonicalUrl('northbridge', '/legends', DOMAINS.northbridge, HUB), `${HUB}/northbridge/legends`);
  assert.equal(canonicalUrl('eastvale', '', undefined, HUB), `${HUB}/eastvale`);
});

test('the hub origin never falls back to a partner domain (VERCEL_PROJECT_PRODUCTION_URL is the shortest custom domain)', () => {
  assert.equal(publicOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'spurslegends.com' }, DOMAINS), 'https://appearances.getapeptalk.com');
  assert.equal(publicOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'www.spurslegends.com' }, DOMAINS), 'https://appearances.getapeptalk.com');
  assert.equal(publicOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'hub.vercel.app' }, DOMAINS), 'https://hub.vercel.app');
  assert.equal(
    publicOrigin({ PUBLIC_ORIGIN: 'https://hub.example', VERCEL_PROJECT_PRODUCTION_URL: 'spurslegends.com' }, DOMAINS),
    'https://hub.example',
  );
});

test('render context per mount: links without the slug on the domain; canonical URLs and indexing follow `live`', () => {
  const launched = { ...spurs, indexable: true, demoHome: false, demoProfiles: [] };
  const folder = siteContext(launched, { origin: HUB, domain: DOMAINS.spurs });
  const domain = siteContext(launched, { origin: HUB, domain: DOMAINS.spurs, onDomain: true });
  assert.equal(folder.base, '/spurs');
  assert.equal(folder.home, '/spurs');
  assert.equal(domain.base, '');
  assert.equal(domain.home, '/');
  assert.equal(domain.url('/legends'), 'https://spurslegends.com/legends');
  assert.equal(domain.url('/'), 'https://spurslegends.com/');
  assert.equal(folder.url('/spurs/legends'), 'https://spurslegends.com/legends', 'the folder copy points at the domain');
  assert.equal(domain.origin, 'https://spurslegends.com');
  assert.equal(domain.indexable, true);
  assert.equal(folder.indexable, false, 'the folder copy of a live site is never indexed');
  assert.equal(folder.launched, true);
  // Not live: the folder is canonical, the domain copy is not.
  const before = siteContext(launched, { origin: HUB, domain: { ...DOMAINS.spurs, live: false }, onDomain: true });
  assert.equal(before.url('/legends'), `${HUB}/spurs/legends`);
  assert.equal(before.indexable, false);
  assert.equal(siteContext(launched, { origin: HUB, domain: { ...DOMAINS.spurs, live: false } }).indexable, true);
  // A site without a domain renders as before.
  const plain = siteContext(spurs, { origin: HUB });
  assert.equal(plain.base, '/spurs');
  assert.equal(plain.url('/spurs/legends'), `${HUB}/spurs/legends`);
});

test('canonical, Open Graph and structured data per host', () => {
  const domain = siteContext(spurs, { origin: HUB, domain: DOMAINS.spurs, onDomain: true });
  const meta = pageMetadata({
    title: 't',
    description: 'd',
    path: domain.url('/legends'),
    origin: domain.origin,
    siteName: 's',
    image: '/og/spurs-legends.jpg',
  });
  assert.equal(meta.alternates?.canonical, 'https://spurslegends.com/legends');
  assert.equal(String(meta.metadataBase), 'https://spurslegends.com/');
  const graph = siteGraph({
    ctx: domain,
    path: '/legends',
    name: 'Roster',
    crumbs: [
      { name: 'Home', path: domain.home },
      { name: 'Roster', path: '/legends' },
    ],
  });
  const urls = nodes(graph).flatMap(node => [node['@id'], node.url].filter((v): v is string => typeof v === 'string'));
  for (const url of urls.filter(url => !url.startsWith('https://www.getapeptalk.com/')))
    assert.ok(url.startsWith('https://spurslegends.com/'), url);
  const crumbs = nodes(graph).find(node => node['@type'] === 'BreadcrumbList')?.itemListElement as { item: string }[];
  assert.deepEqual(
    crumbs.map(crumb => crumb.item),
    ['https://spurslegends.com/', 'https://spurslegends.com/legends'],
  );
});

test('discovery per host: sitemaps on the canonical copy only, robots.txt on the domain, llms.txt and the hub index', () => {
  const launched = { ...northbridge, indexable: true };
  const live = { ...DOMAINS.northbridge, live: true };
  const xml = urlsetXml(siteSitemapEntries(launched, { indexable: true, legalIndexable: false }), folderToCanonical(launched, live, HUB));
  assert.match(xml, /<loc>https:\/\/northbridgelegends\.example\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/northbridgelegends\.example\/legends<\/loc>/);
  // No hub folder and no slug under the domain (the people's photo URLs on media.example.com do contain the slug).
  assert.doesNotMatch(xml, /northbridgelegends\.example\/northbridge|appearances\.example/);
  assert.deepEqual(sitemapPaths(['northbridge', 'eastvale'], true, { northbridge: live }), ['/all/sitemap.xml', '/eastvale/sitemap.xml']);
  assert.equal(
    domainRobotsTxt(true, 'https://northbridgelegends.example'),
    'User-Agent: *\nAllow: /\n\nSitemap: https://northbridgelegends.example/sitemap.xml\n',
  );
  assert.equal(domainRobotsTxt(false, 'https://northbridgelegends.example'), 'User-Agent: *\nDisallow: /\n');
  const llms = siteLlmsTxt(launched, HUB, [], live);
  assert.match(llms, /\(https:\/\/northbridgelegends\.example\/legends\)/);
  assert.doesNotMatch(llms, /appearances\.example/);
  const hub = hubLlmsTxt(sites, ['northbridge'], false, HUB, { northbridge: live }) ?? '';
  assert.match(hub, /\(https:\/\/northbridgelegends\.example\/\): .* Details: https:\/\/northbridgelegends\.example\/llms\.txt/);
});
