// Crawler-facing files, as pure functions of the content, so the routes stay thin and the tests can check every case:
// - sitemaps: /sitemap.xml (an index) -> /<slug>/sitemap.xml per indexable site, /all/sitemap.xml for the hub (which
//   lists the landing page at its URL: `/`, or `/all` when a root site takes `/`; lib/render/routes.ts → landingPath).
//   Only built, published, indexable pages are listed: no hidden people (unpublished), switched-off pages (not built),
//   look-only demo pages or placeholder legal text (both noindex). Not indexable: an empty, valid file.
// - robots.txt: `Disallow: /` for everything, plus `Allow` lines for indexable sites and the assets they render with,
//   and the sitemap. With nothing indexable it stays exactly "disallow everything".
// - llms.txt (https://llmstxt.org/): a markdown index of an indexable site's key pages and people; 404 otherwise.
// Per-site domains (lib/domains.ts): every URL is canonical (the live domain, else the hub folder). A site whose domain
// is live has its sitemap, robots.txt and llms.txt on that domain, and the hub's sitemap index leaves it out.
// Sources: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap,
// https://developers.google.com/search/docs/crawling-indexing/robots/create-robots-txt
import type { LegalDoc, Site } from '../content/types.ts';
import { canonicalUrl, type Domains, type SiteDomain } from '../domains.ts';
import { absoluteUrl } from '../origin.ts';
import { siteContext } from '../render/context.ts';
import { LANDING_HOME, sitePaths } from '../render/routes.ts';
import { decodeDeep } from '../render/text.ts';

const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface SitemapEntry {
  /** Hub-folder path (`/spurs/legends`); urlsetXml makes it canonical. */
  path: string;
  /** Absolute image URLs shown on the page (image sitemap extension). */
  images?: string[];
}

/** The pages of one site that belong in its sitemap (empty unless the site is indexable). */
export function siteSitemapEntries(
  site: Site,
  { indexable, legalIndexable }: { indexable: boolean; legalIndexable: boolean },
): SitemapEntry[] {
  if (!indexable) return [];
  const demo = new Set([
    ...(site.demoHome ? [`/${site.slug}`] : []),
    ...(site.demoProfiles ?? []).map(slug => `/${site.slug}/legends/${slug}`),
  ]);
  const legal = new Set([`/${site.slug}/terms`, `/${site.slug}/privacy`]);
  const byPath = new Map(site.people.map(person => [`/${site.slug}/legends/${person.slug}`, person]));
  return sitePaths(site)
    .filter(path => !demo.has(path) && (legalIndexable || !legal.has(path)))
    .map(path => {
      const person = byPath.get(path);
      const image = person?.hero ? site.images[person.hero] : undefined;
      return image ? { path, images: [image] } : { path };
    });
}

/** A urlset. `origin` is the hub's origin, or a function giving a path's canonical URL (a site with a domain). */
export function urlsetXml(entries: SitemapEntry[], origin: string | ((path: string) => string)): string {
  const loc = typeof origin === 'string' ? (path: string) => absoluteUrl(path, origin) : origin;
  const urls = entries.map(({ path, images = [] }) => {
    const imageTags = images.map(url => `<image:image><image:loc>${xml(url)}</image:loc></image:image>`).join('');
    return `<url><loc>${xml(loc(path))}</loc>${imageTags}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join('')}</urlset>\n`;
}

export function sitemapIndexXml(paths: string[], origin: string): string {
  const items = paths.map(path => `<sitemap><loc>${xml(absoluteUrl(path, origin))}</loc></sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join('')}</sitemapindex>\n`;
}

/** A hub-folder path of a site (`/spurs/legends`) -> its canonical URL (on the domain once live). */
export const folderToCanonical =
  (site: Pick<Site, 'slug'>, domain: SiteDomain | null | undefined, hubOrigin: string) =>
  (path: string): string =>
    canonicalUrl(site.slug, path.slice(site.slug.length + 1), domain, hubOrigin);

/**
 * Sitemaps listed in the hub's /sitemap.xml: one per indexable site, plus the hub's when it is indexable. A site with
 * a live domain is left out: its sitemap is on its own host, and an index may only list sitemaps on the same host.
 */
export const sitemapPaths = (indexableSlugs: string[], hubIndexable: boolean, domains: Domains = {}): string[] => [
  ...(hubIndexable ? ['/all/sitemap.xml'] : []),
  ...indexableSlugs.filter(slug => !domains[slug]?.live).map(slug => `/${slug}/sitemap.xml`),
];

/** Hub pages in /all/sitemap.xml: the landing page at `landing` (its URL, lib/render/routes.ts → landingPath), legal pages. */
export const hubSitemapEntries = (hubIndexable: boolean, legalIndexable: boolean, landing: string = LANDING_HOME): SitemapEntry[] =>
  hubIndexable ? [{ path: landing }, ...(legalIndexable ? [{ path: '/terms' }, { path: '/privacy' }] : [])] : [];

/** Paths every indexable page needs to render for a crawler (styles, fonts, scripts, images, cards). */
export const RENDER_ASSETS = ['/styles.css', '/fonts/', '/_next/static/', '/_next/image', '/og/', '/peptalk/', '/sitemap.xml', '/llms.txt'];

export interface RobotsRules {
  rules: { userAgent: string; allow?: string[]; disallow: string };
  sitemap?: string;
}

/** `landing` is the landing page's URL (`/` or `/all`); `/all/` stays allowed for the hub's sitemap either way. */
export function robotsRules(indexableSlugs: string[], hubIndexable: boolean, origin: string, landing: string = LANDING_HOME): RobotsRules {
  const allow = [
    ...indexableSlugs.flatMap(slug => [`/${slug}$`, `/${slug}/`]),
    ...(hubIndexable ? [`${landing}$`, '/all/', '/terms$', '/privacy$'] : []),
  ];
  if (!allow.length) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: [...allow, ...RENDER_ASSETS], disallow: '/' },
    sitemap: absoluteUrl('/sitemap.xml', origin),
  };
}

/**
 * robots.txt on a site's own domain: everything there is that site's, so allow all once the site is indexable and the
 * domain is live (the canonical host), with its sitemap; disallow everything otherwise.
 */
export function domainRobotsTxt(indexable: boolean, origin: string): string {
  return indexable ? `User-Agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('/sitemap.xml', origin)}\n` : 'User-Agent: *\nDisallow: /\n';
}

/** /<slug>/llms.txt for an indexable site: what the platform is, its key pages and its people, with one-line answers. */
export function siteLlmsTxt(
  stored: Site,
  origin: string,
  legal: Pick<LegalDoc, 'kind' | 'title'>[] = [],
  domain: SiteDomain | null = null,
): string {
  const ctx = siteContext(stored, { origin, domain });
  const { site, v, nl, pages, FORMATS } = ctx;
  const url = ctx.url;
  const base = `/${site.slug}`;
  const formats = Object.values(FORMATS).map(format => format.title);
  const pageLinks = [
    `- [${site.platform}](${url(base)}): ${site.entity}`,
    `- [${nl.legends}](${url(`${base}/legends`)}): all ${site.people.length} ${site.orgName} ${v.legendsNoun}, with role, era and topics`,
    ...(pages.waysToBook ? [`- [Ways to book](${url(`${base}/ways-to-book`)}): ${formats.join(', ')}`] : []),
    ...(pages.hospitality ? [`- [${v.hospitalityTitle}](${url(`${base}/hospitality`)}): ${v.hospitalityBody}`] : []),
    ...(pages.about ? [`- [${v.aboutTitle}](${url(`${base}/about`)}): who runs the platform, and booking FAQs`] : []),
    `- [Check availability](${url(`${base}/check-availability`)}): the enquiry form; the PepTalk bookings team replies within one working day`,
  ];
  const people = site.people.map(
    person =>
      `- [${person.name}](${url(`${base}/legends/${person.slug}`)}): ${person.roleLabel}, ${ctx.eraLabel(person.era)}. ${person.line}`,
  );
  const faq = ctx.faq().map(({ q, a }) => `- ${q} ${a}`);
  return [
    `# ${site.platform}`,
    '',
    `> ${site.entity}`,
    '',
    `Bookings, contracts and payments are handled by PepTalk (https://www.getapeptalk.com) on behalf of ${site.orgName}. Fees are on enquiry.`,
    '',
    '## Pages',
    '',
    ...pageLinks,
    '',
    `## ${nl.legends}`,
    '',
    ...people,
    '',
    '## Booking FAQ',
    '',
    ...faq,
    ...(legal.length ? ['', '## Optional', '', ...legal.map(doc => `- [${doc.title}](${url(`${base}/${doc.kind}`)})`)] : []),
    '',
  ].join('\n');
}

/** /llms.txt on the hub: the indexable platforms (and the landing page, at `landing`, when the hub is indexable). */
export function hubLlmsTxt(
  sites: Site[],
  indexableSlugs: string[],
  hubIndexable: boolean,
  origin: string,
  domains: Domains = {},
  landing: string = LANDING_HOME,
): string | null {
  const listed = decodeDeep(sites).filter(site => indexableSlugs.includes(site.slug));
  if (!listed.length && !hubIndexable) return null;
  return [
    '# PepTalk Appearances',
    '',
    '> Official sports talent booking platforms for clubs, leagues and associations, operated by PepTalk.',
    '',
    'Each platform lists former players, current stars, managers and staff who can be booked for keynotes, hospitality, brand work and community events. PepTalk (https://www.getapeptalk.com) handles enquiries, contracts and payments.',
    '',
    '## Platforms',
    '',
    ...listed.map(
      site =>
        `- [${site.platform}](${canonicalUrl(site.slug, '', domains[site.slug], origin)}): ${site.entity} Details: ${canonicalUrl(site.slug, '/llms.txt', domains[site.slug], origin)}`,
    ),
    ...(hubIndexable ? [`- [All platforms](${absoluteUrl(landing, origin)}): every official platform in one place`] : []),
    '',
  ].join('\n');
}
