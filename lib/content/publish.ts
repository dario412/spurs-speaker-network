// Publishing switches, applied exactly as src/sites/index.mjs (the admin and site tools' loader) does:
// - site.json `active: false` leaves the whole site out (its URLs 404, it leaves the landing page)
// - site.json `pages: { waysToBook, hospitality, about }` switches optional pages off
// - `active: false` on a person hides that profile and removes them from every list
// Pure functions, so every provider (JSON, CMS, Airtable) publishes the same way.
import type { ImageId, Images, PageKey, Person, RawSite, Registry, Site, SiteConfig } from './types.ts';

/** Optional pages a site can switch off. Home, roster, profiles, enquiry and the legal pages always exist. */
export const PAGE_DEFAULTS: Readonly<Record<PageKey, boolean>> = { waysToBook: true, hospitality: true, about: true };

export const isActive = (item: { active?: boolean }): boolean => item.active !== false;

/** The site as published: hidden people removed, licence and verification bookkeeping left behind. */
export function publishable(raw: RawSite): Site {
  const { licences: _licences, verification: _verification, ...site } = raw;
  return { ...site, people: site.people.filter(isActive) };
}

/** Every published site in registry order. */
export const publishedSites = (registry: Registry, raws: RawSite[]): Site[] => {
  const bySlug = new Map(raws.map(raw => [raw.slug, raw]));
  return registry.order
    .map(slug => bySlug.get(slug))
    .filter((raw): raw is RawSite => raw !== undefined && isActive(raw))
    .map(publishable);
};

/** Which optional pages a site builds. */
export const pagesFor = (site: Pick<Site, 'pages'>): Record<PageKey, boolean> => ({ ...PAGE_DEFAULTS, ...site.pages });

/** Hosts allowed in the image-src CSP: Getty comps plus each published site's mark hosts. */
export const imageHosts = (sites: Pick<Site, 'cspHosts'>[]): string[] => [
  'https://media.gettyimages.com',
  ...new Set(sites.flatMap(site => site.cspHosts ?? [])),
];

/** Image ids a site's own settings use (home slots, role tiles), whoever supplies its people. */
export const siteImageIds = (site: Pick<SiteConfig, 'home' | 'roles'>): ImageId[] => [
  site.home.hero.image,
  site.home.inset.image,
  site.home.eraImage,
  site.home.storyImage,
  site.home.hospitalityImage,
  ...site.roles.filter(role => role.image !== undefined).map(role => role.image as ImageId),
];

/** Image ids one person uses. */
export const personImageIds = (person: Pick<Person, 'hero' | 'card' | 'gallery'>): ImageId[] => [
  person.hero,
  person.card,
  ...person.gallery,
];

/** The entries of `images` that `ids` reference, in `images` order. */
export const pickImages = (images: Images, ids: ImageId[]): Images => {
  const wanted = new Set(ids.filter((id): id is string => typeof id === 'string'));
  return Object.fromEntries(Object.entries(images).filter(([id]) => wanted.has(id)));
};
