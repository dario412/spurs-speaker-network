// Loads every site's content from src/sites/<slug>/ (site.json, people.json, images.json, optional licences.json and verification.json).
// The order in registry.json is the display order on the landing page.
//
// Publishing switches (all default to on, all edited from the admin or by hand):
// - site.json `active: false` leaves the whole site out of the build (its URLs 404).
// - site.json `pages: { waysToBook, hospitality, about }` turns optional pages off.
// - `active: false` on a person hides that profile.
import { existsSync, readFileSync } from 'node:fs';
import { emptyLicences } from './licences.mjs';

const optionalJson = (path, dir, fallback) => {
  const url = new URL(path, dir);
  return existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : fallback;
};

export const SITES_DIR = new URL('./', import.meta.url);

const readJson = (path, dir) => JSON.parse(readFileSync(new URL(path, dir), 'utf8'));

/** @returns {{ order: string[], rootSite?: string, redirects: Record<string, string> }} */
export const readRegistry = (dir = SITES_DIR) => readJson('registry.json', dir);

/** A site exactly as stored, including inactive people, licence approvals and verification checks. */
export function loadSite(slug, dir = SITES_DIR) {
  return {
    ...readJson(`${slug}/site.json`, dir),
    people: readJson(`${slug}/people.json`, dir),
    images: readJson(`${slug}/images.json`, dir),
    licences: optionalJson(`${slug}/licences.json`, dir, emptyLicences()),
    // Empty default inlined (not imported) because verification.mjs imports the renderer, which must not load here.
    verification: optionalJson(`${slug}/verification.json`, dir, { pages: {}, people: {} }),
  };
}

export const isActive = item => item.active !== false;

/** The site as published: hidden people removed, licence and verification bookkeeping left behind. */
export const publishable = ({ licences: _, verification: __, ...site }) => ({
  ...site,
  people: site.people.filter(isActive),
});

/** Every published site in registry order. */
export const loadSites = (dir = SITES_DIR) =>
  readRegistry(dir)
    .order.map(slug => loadSite(slug, dir))
    .filter(isActive)
    .map(publishable);

const registry = readRegistry();

export const SITES = loadSites();

/** Where `/` redirects, or undefined when `/` serves the PepTalk landing page. */
export const ROOT_SITE = registry.rootSite;

/** Old slugs that 301 to their new folder, e.g. { england: 'thefa' }. */
export const SLUG_REDIRECTS = registry.redirects;

/** Hosts allowed in the image-src CSP: Getty comps plus each site's mark hosts. */
export const IMAGE_HOSTS = ['https://media.gettyimages.com', ...new Set(SITES.flatMap(site => site.cspHosts ?? []))];
