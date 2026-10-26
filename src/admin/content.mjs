// Content access for the admin: one snapshot of the registry and every stored site per request, and the single
// save path (validate the in-memory result, write nothing on problems, otherwise persist only changed files).
import { readFileSync } from 'node:fs';
import { SLUG, validateRegistry, validateSite } from '../../scripts/validate-content.mjs';
import { IMAGE_HOSTS, loadSite, readRegistry } from '../sites/index.mjs';
import { emptyLicences, pruneLicences } from '../sites/licences.mjs';
import { PUBLIC_DIR, registryFile, siteFiles, targetFor } from '../sites/store.mjs';
import { emptyVerification, pruneVerification } from '../sites/verification.mjs';

/** Site slugs and person slugs: the only values ever placed in a file path or URL segment. */
export const KEY = SLUG;
export const isKey = value => typeof value === 'string' && KEY.test(value);

export const REGISTRY_PATH = 'src/sites/registry.json';
export const siteFile = (slug, file) => `src/sites/${slug}/${file}.json`;
/** Per-site files; licences.json and verification.json are optional (absent means nothing approved or checked yet). */
export const SITE_FILES = ['site', 'people', 'images', 'licences', 'verification'];

/**
 * @param {{ dir: URL, publicDir?: URL, storage: { read?: (path: string) => string|Buffer|undefined, save: Function } }} options
 * `storage.read` overlays files saved this session (GitHub mode) on top of the local checkout. `publicDir` is where
 * `public/…` paths (og cards imported from site packs) live.
 */
export function createContent({ dir, publicDir = PUBLIC_DIR, storage }) {
  /** Current bytes of a repo-relative content file (src/sites/… or public/…), or undefined when it does not exist. */
  function bytes(path) {
    const saved = storage.read?.(path);
    if (saved !== undefined) return Buffer.isBuffer(saved) ? saved : Buffer.from(saved, 'utf8');
    try {
      return readFileSync(targetFor(path, dir, publicDir));
    } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
  }

  /** Current text of a repo-relative content file, or undefined when it does not exist. */
  const text = path => bytes(path)?.toString('utf8');

  const json = path => {
    const body = text(path);
    if (body === undefined) throw new Error(`${path} does not exist`);
    return JSON.parse(body);
  };

  // With nothing saved this session the shared loaders read the checkout directly; the overlay path mirrors
  // loadSite() so sessions that saved to GitHub still see their own edits.
  const overlaid = path => storage.read?.(path) !== undefined;
  const registryNow = () => (overlaid(REGISTRY_PATH) ? json(REGISTRY_PATH) : readRegistry(dir));
  const siteNow = slug => {
    if (!SITE_FILES.some(file => overlaid(siteFile(slug, file)))) return loadSite(slug, dir);
    const licences = text(siteFile(slug, 'licences'));
    const verification = text(siteFile(slug, 'verification'));
    return {
      ...json(siteFile(slug, 'site')),
      people: json(siteFile(slug, 'people')),
      images: json(siteFile(slug, 'images')),
      licences: licences === undefined ? emptyLicences() : JSON.parse(licences),
      verification: verification === undefined ? emptyVerification() : JSON.parse(verification),
    };
  };

  /**
   * Registry plus every listed site as stored (inactive ones included). A site whose files do not parse is kept as
   * `{ slug, broken }` so the dashboard can still load and point at the raw editor.
   */
  function load(slug) {
    if (!isKey(slug)) return { slug, broken: 'not a valid slug' };
    try {
      return siteNow(slug);
    } catch (error) {
      return { slug, broken: error.message };
    }
  }

  function snapshot() {
    const registry = registryNow();
    const sites = registry.order.map(load);
    const find = slug => (isKey(slug) ? (sites.find(site => site.slug === slug && !site.broken) ?? null) : null);
    return { registry, sites, find };
  }

  async function commit(files, message) {
    // Text compares as text, binary (og cards) byte for byte; either way unchanged files are not written.
    const same = (path, body) => (Buffer.isBuffer(body) ? bytes(path)?.equals(body) === true : text(path) === body);
    const changed = Object.fromEntries(Object.entries(files).filter(([path, body]) => !same(path, body)));
    const paths = Object.keys(changed);
    if (paths.length === 0) return { unchanged: true, paths, message: 'No changes to save.' };
    const result = await storage.save(changed, message);
    return { ...result, paths };
  }

  /**
   * The one way the admin writes a site. `registry` (optional) is validated against the updated site list and
   * written alongside when it changed.
   * @returns {Promise<{ problems: string[] } | { saved: object }>}
   */
  /** `extraFiles` (e.g. og cards from a site pack) are written in the same save, after validation passes. */
  async function saveSite(snap, candidate, { registry, message, extraFiles = {} }) {
    // Approvals and checks for images, marks or people this edit removed would otherwise fail validation.
    const next = pruneVerification(pruneLicences(candidate));
    const listed = snap.sites.some(site => site.slug === next.slug);
    const sites = listed ? snap.sites.map(site => (site.slug === next.slug ? next : site)) : [...snap.sites, next];
    const problems = validateSite(next);
    if (registry) problems.push(...validateRegistry(registry, sites));
    if (problems.length) return { problems };
    const present = file => text(siteFile(next.slug, file)) !== undefined;
    const options = { licencesPresent: present('licences'), verificationPresent: present('verification') };
    const files = { ...siteFiles(next, options), ...extraFiles, ...(registry ? registryFile(registry) : {}) };
    return { saved: await commit(files, message) };
  }

  /** The registry may name sites the snapshot never loaded (raw edits), so its sites are loaded afresh by slug. */
  async function saveRegistry(snap, registry, message) {
    const sites = registry.order.map(slug => snap.sites.find(site => site.slug === slug) ?? load(slug));
    const problems = validateRegistry(registry, sites);
    for (const site of sites.filter(site => site.broken)) problems.push(`registry: "${site.slug}" cannot be read (${site.broken})`);
    if (problems.length) return { problems };
    return { saved: await commit(registryFile(registry), message) };
  }

  /** Image hosts for the CSP: the published set plus every stored site's mark and image hosts, inactive ones too. */
  function imageHosts(snap = snapshot()) {
    const hosts = new Set(IMAGE_HOSTS);
    for (const site of snap.sites) {
      for (const host of site.cspHosts ?? []) hosts.add(host);
      for (const url of Object.values(site.images ?? {})) if (typeof url === 'string' && URL.canParse(url)) hosts.add(new URL(url).origin);
    }
    // Content is editable here, so only plain https origins may reach the header (no `;` or keywords smuggled in).
    return [...hosts].filter(host => /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i.test(String(host)));
  }

  return { text, bytes, load, snapshot, commit, saveSite, saveRegistry, imageHosts, publicDir };
}
