// Which pages exist: the single definition shared by the root layout (body class, stylesheet, icon), the proxy
// manifest, the admin preview and the tests. The app/ routes call notFound() on exactly the cases this returns null for.
import { LEGAL_KINDS } from '../content/legal.ts';
import { pagesFor } from '../content/publish.ts';
import type { LegalKind, PageKey, Person, Role, Site } from '../content/types.ts';
import { categoryRoles, roleForSlug, roleSlug } from './category.ts';

export type PageKind =
  | 'home'
  | 'legends'
  | 'profile'
  | 'category'
  | 'ways-to-book'
  | 'hospitality'
  | 'about'
  | 'check-availability'
  | LegalKind;

export type ResolvedPage =
  | { kind: 'landing' }
  | { kind: 'hub-legal'; legal: LegalKind }
  | { kind: PageKind; site: Site; person?: Person; role?: Role; demo: boolean };

/** The landing page's URL when it is the hub's home (registry.json has no `rootSite`): `/all` answers 301 here. */
export const LANDING_HOME = '/';
/** The landing page's URL when `/` redirects to a root site. */
export const LANDING_FOLDER = '/all';

/** Where the PepTalk landing page lives on the hub: `/` unless registry.json → rootSite makes `/` redirect to a site. */
export const landingPath = (rootSite: string | null | undefined): string => (rootSite ? LANDING_FOLDER : LANDING_HOME);

/** Optional site pages: URL segment -> switch in site.json `pages`. */
export const OPTIONAL_PAGES: Record<string, PageKey> = { 'ways-to-book': 'waysToBook', hospitality: 'hospitality', about: 'about' };
const ALWAYS = new Set<string>(['check-availability', ...LEGAL_KINDS]);

export function resolvePage(sites: Site[], pathname: string): ResolvedPage | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  // Both URLs the landing page can have (landingPath); the proxy redirects whichever one isn't in use.
  if (clean === LANDING_HOME || clean === LANDING_FOLDER) return { kind: 'landing' };
  const parts = clean.split('/').slice(1);
  if (parts.length === 1 && (LEGAL_KINDS as readonly string[]).includes(parts[0]))
    return { kind: 'hub-legal', legal: parts[0] as LegalKind };
  const site = sites.find(candidate => candidate.slug === parts[0]);
  if (!site) return null;
  const [, page, person] = parts;
  if (page === undefined) return { kind: 'home', site, demo: site.demoHome === true };
  if (page === 'legends' && person === undefined) return { kind: 'legends', site, demo: false };
  if (page === 'legends' && parts.length === 3) {
    const found = site.people.find(candidate => candidate.slug === person);
    return found ? { kind: 'profile', site, person: found, demo: site.demoProfiles?.includes(found.slug) === true } : null;
  }
  if (page === 'category' && parts.length === 3) {
    const role = roleForSlug(site, person);
    return role ? { kind: 'category', site, role, demo: false } : null;
  }
  if (parts.length !== 2) return null;
  if (ALWAYS.has(page)) return { kind: page as PageKind, site, demo: false };
  if (Object.hasOwn(OPTIONAL_PAGES, page) && pagesFor(site)[OPTIONAL_PAGES[page]]) return { kind: page as PageKind, site, demo: false };
  return null;
}

/** A category page's path within a site: `${base}/category/<role-slug>`. */
export const categoryPath = (base: string, role: Pick<Role, 'label'>): string => `${base}/category/${roleSlug(role)}`;

/** Every page path one site serves: home, roster, categories, the optional pages that are on, enquiry, legal pages, profiles. */
export function sitePaths(site: Site): string[] {
  const base = `/${site.slug}`;
  const pages = pagesFor(site);
  return [
    base,
    `${base}/legends`,
    ...categoryRoles(site).map(role => categoryPath(base, role)),
    ...Object.entries(OPTIONAL_PAGES)
      .filter(([, key]) => pages[key])
      .map(([segment]) => `${base}/${segment}`),
    `${base}/check-availability`,
    ...LEGAL_KINDS.map(kind => `${base}/${kind}`),
    ...site.people.map(person => `${base}/legends/${person.slug}`),
  ];
}

/** Every page path: the landing page at `landing` (landingPath), the hub legal pages, then every site's pages. */
export const allPaths = (sites: Site[], landing: string): string[] => [
  landing,
  ...LEGAL_KINDS.map(kind => `/${kind}`),
  ...sites.flatMap(sitePaths),
];
