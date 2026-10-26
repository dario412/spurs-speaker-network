// Structured data (schema.org JSON-LD) for every page type, built from content only, so every site gets the same graph.
// Each page emits one `@graph` with stable `@id`s: PepTalk (Organization), the rights holder (SportsTeam or
// SportsOrganization), the site (WebSite), the page (WebPage or a subtype), its BreadcrumbList, and the page's main
// entity (Person, ItemList of people or services, FAQPage). Rules (docs/architecture.md, "SEO and AEO"):
// - only content that is visible on the page is marked up (Google's structured data policies)
// - no Review, AggregateRating or rating markup anywhere: the testimonials are unattributed placeholders
// - every URL is absolute and canonical: the site's live domain, else the hub folder on the build's public origin
//   (SiteContext.url), whichever copy of the site is rendering
import type { FormatKey, Person, Site } from '../content/types.ts';
import { absoluteUrl } from '../origin.ts';
import { PEPTALK, type SiteContext } from '../render/context.ts';
import { LANDING_HOME } from '../render/routes.ts';
import { langFor } from './indexing.ts';

export type Node = Record<string, unknown>;
export interface Crumb {
  name: string;
  /** Link path within the site, built from `ctx.base` (`/spurs/legends`, or `/legends` on the site's domain). */
  path: string;
}

export const PEPTALK_ID = `${PEPTALK}/#organization`;

/** PepTalk, the operator of every platform. `sameAs` ties the entity to getapeptalk.com. */
export const peptalkNode = (origin: string): Node => ({
  '@type': 'Organization',
  '@id': PEPTALK_ID,
  name: 'PepTalk',
  url: `${PEPTALK}/`,
  logo: absoluteUrl('/peptalk/logo.png', origin),
  sameAs: [`${PEPTALK}/`],
});

type UrlContext = Pick<SiteContext, 'site' | 'home' | 'base' | 'url'>;
const siteUrl = (ctx: UrlContext) => ctx.url(ctx.home);
const profileUrl = (ctx: UrlContext, person: Pick<Person, 'slug'>) => ctx.url(`${ctx.base}/legends/${person.slug}`);
export const websiteId = (ctx: UrlContext) => `${siteUrl(ctx)}#website`;
export const rightsHolderId = (ctx: UrlContext) => `${siteUrl(ctx)}#rights-holder`;
export const personId = (ctx: UrlContext, person: Pick<Person, 'slug'>) => `${profileUrl(ctx, person)}#person`;

/** The club, league or association the platform is official for. */
export function rightsHolderNode(ctx: UrlContext): Node {
  const { site } = ctx;
  return {
    '@type': site.orgType ?? 'SportsTeam',
    '@id': rightsHolderId(ctx),
    name: site.orgName,
    ...(site.marks.crest ? { logo: site.marks.crest } : {}),
  };
}

export function websiteNode(ctx: UrlContext): Node {
  const { site } = ctx;
  return {
    '@type': 'WebSite',
    '@id': websiteId(ctx),
    url: siteUrl(ctx),
    name: site.platform,
    description: site.entity,
    inLanguage: langFor(site),
    publisher: { '@id': PEPTALK_ID },
    about: { '@id': rightsHolderId(ctx) },
  };
}

/** A breadcrumb trail. `url` turns a crumb's path into an absolute URL (the site's `ctx.url`, or the hub's origin). */
export function breadcrumbNode(crumbs: Crumb[], pageUrl: string, url: (path: string) => string): Node {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: url(crumb.path),
    })),
  };
}

export type PageType = 'WebPage' | 'CollectionPage' | 'ProfilePage' | 'AboutPage' | 'ContactPage';

export interface PageGraph {
  ctx: SiteContext;
  /** The page's link path (`${ctx.base}/legends`). */
  path: string;
  type?: PageType;
  /** The page's name (its h1 or title). */
  name: string;
  description?: string;
  /** Breadcrumb trail from the site home to this page; omitted on the home page. */
  crumbs?: Crumb[];
  /** Absolute URL of the page's main image. */
  image?: string | null;
  /** The page's main entity and any further nodes (Person, ItemList, FAQPage …). */
  mainEntity?: Node;
  extra?: Node[];
}

/** The full `@graph` for one site page. */
export function siteGraph({ ctx, path, type = 'WebPage', name, description, crumbs, image, mainEntity, extra = [] }: PageGraph): Node {
  const { site } = ctx;
  const url = ctx.url(path);
  const page: Node = {
    '@type': type,
    '@id': url,
    url,
    name,
    ...(description ? { description } : {}),
    inLanguage: langFor(site),
    isPartOf: { '@id': websiteId(ctx) },
    ...(crumbs && crumbs.length > 1 ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
    ...(image ? { primaryImageOfPage: { '@type': 'ImageObject', url: image } } : {}),
    ...(mainEntity ? { mainEntity: mainEntity['@id'] ? { '@id': mainEntity['@id'] } : mainEntity } : {}),
  };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      peptalkNode(ctx.origin),
      rightsHolderNode(ctx),
      websiteNode(ctx),
      page,
      ...(crumbs && crumbs.length > 1 ? [breadcrumbNode(crumbs, url, ctx.url)] : []),
      ...(mainEntity?.['@id'] ? [mainEntity] : []),
      ...extra,
    ],
  };
}

/** The person on a profile page: only fields the page shows. `sameAs` comes from people.json when set. */
export function personNode(ctx: SiteContext, person: Person): Node {
  const { site, roleLabel } = ctx;
  const image = person.hero ? site.images[person.hero] : undefined;
  return {
    '@type': 'Person',
    '@id': personId(ctx, person),
    name: person.name,
    url: profileUrl(ctx, person),
    jobTitle: site.roles.find(role => role.key === person.role)?.singular ?? roleLabel(person.role),
    description: person.line,
    ...(image ? { image } : {}),
    affiliation: { '@id': rightsHolderId(ctx) },
    knowsAbout: person.talks,
    ...(person.sameAs?.length ? { sameAs: person.sameAs } : {}),
  };
}

/** The roster: a summary list of profile URLs (the carousel "summary page" shape). */
export function peopleListNode(ctx: SiteContext, people: Person[], pageUrl: string, name: string): Node {
  return {
    '@type': 'ItemList',
    '@id': `${pageUrl}#list`,
    name,
    numberOfItems: people.length,
    itemListElement: people.map((person, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: person.name,
      url: profileUrl(ctx, person),
    })),
  };
}

/** FAQ entries exactly as rendered. Google no longer shows FAQ rich results (2026); the markup stays valid schema.org. */
export function faqNode(entries: { q: string; a: string }[], pageUrl: string, ctx: SiteContext): Node {
  return {
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    url: `${pageUrl}#faq`,
    isPartOf: { '@id': websiteId(ctx) },
    inLanguage: langFor(ctx.site),
    mainEntity: entries.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
}

/** Booking formats as services provided by PepTalk on behalf of the rights holder (no prices, no offers). */
export function servicesNode(ctx: SiteContext, keys: FormatKey[], pageUrl: string): Node {
  return {
    '@type': 'ItemList',
    '@id': `${pageUrl}#formats`,
    name: `Ways to book ${ctx.site.short} ${ctx.v.legendsNoun}`,
    numberOfItems: keys.length,
    itemListElement: keys.map((key, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Service',
        name: ctx.FORMATS[key].title,
        description: ctx.FORMATS[key].desc,
        serviceType: 'Speaker and talent booking',
        provider: { '@id': PEPTALK_ID },
        brand: { '@id': rightsHolderId(ctx) },
      },
    })),
  };
}

/** The PepTalk hub (the landing page and the hub legal pages). */
export function hubGraph({
  origin,
  path,
  landing = LANDING_HOME,
  name,
  description,
  sites,
  crumbs,
  siteHome = site => absoluteUrl(`/${site.slug}`, origin),
}: {
  origin: string;
  path: string;
  /** The landing page's URL (lib/render/routes.ts → landingPath): the WebSite's URL, and the page that is the CollectionPage. */
  landing?: string;
  name: string;
  description?: string;
  sites?: Site[];
  crumbs?: Crumb[];
  /** A listed site's canonical home URL (its live domain, else its hub folder). */
  siteHome?: (site: Site) => string;
}): Node {
  const hubUrl = absoluteUrl(landing, origin);
  const url = absoluteUrl(path, origin);
  const website: Node = {
    '@type': 'WebSite',
    '@id': `${hubUrl}#website`,
    url: hubUrl,
    name: 'PepTalk Appearances',
    inLanguage: 'en-GB',
    publisher: { '@id': PEPTALK_ID },
  };
  const page: Node = {
    '@type': path === landing ? 'CollectionPage' : 'WebPage',
    '@id': url,
    url,
    name,
    ...(description ? { description } : {}),
    inLanguage: 'en-GB',
    isPartOf: { '@id': `${hubUrl}#website` },
    ...(crumbs && crumbs.length > 1 ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
    ...(sites ? { mainEntity: { '@id': `${url}#platforms` } } : {}),
  };
  const list: Node[] = sites
    ? [
        {
          '@type': 'ItemList',
          '@id': `${url}#platforms`,
          name: 'Official PepTalk Appearances platforms',
          numberOfItems: sites.length,
          itemListElement: sites.map((site, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: site.platform,
            url: siteHome(site),
          })),
        },
      ]
    : [];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      peptalkNode(origin),
      website,
      page,
      ...(crumbs && crumbs.length > 1 ? [breadcrumbNode(crumbs, url, path => absoluteUrl(path, origin))] : []),
      ...list,
    ],
  };
}
