// Site packs: a whole site as one `<slug>.site-pack.zip`, so a site can be built anywhere (the
// /new-appearances-site skill, a scratch checkout, a cloud agent) and imported through the admin or `npm run
// import-pack`. Format: docs/site-packs.md. Nothing here touches disk except reading og cards in buildPack.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSite } from '../../scripts/validate-content.mjs';
import { emptyLicences, hasLicences, pruneLicences } from './licences.mjs';
import { siteFiles, withSite } from './store.mjs';
import { emptyVerification, hasVerification, pruneVerification } from './verification.mjs';
import { readZip, writeZip, ZipError } from './zip.mjs';

export const PACK_FORMAT = 'peptalk-appearances-site-pack';
export const PACK_VERSION = 1;
export const packName = slug => `${slug}.site-pack.zip`;

/** The cards `npm run og-cards` makes per site: `<slug>.jpg` and `<slug>-<page>.jpg`. */
const OG_PAGES = ['legends', 'ways-to-book', 'hospitality', 'about', 'check-availability'];
export const isOgCardFor = (slug, name) => name === `${slug}.jpg` || OG_PAGES.some(page => name === `${slug}-${page}.jpg`);

const CONTENT = ['site.json', 'people.json', 'images.json'];
const OPTIONAL = ['licences.json', 'verification.json', 'verify.md'];
const isJpeg = data => data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;

export class PackError extends Error {}

/**
 * Builds a pack for a site (as loaded by loadSite, or straight from shellSite/assembleSite).
 * @param {object} site
 * @param {{ mode?: 'shell'|'populated', ogDir?: URL|string, verify?: string, generator?: string, createdAt?: Date }} [options]
 *   `ogDir` is a directory holding og cards (public/og/); only this site's cards are included.
 * @returns {Buffer}
 */
export function buildPack(site, { mode, ogDir, verify, generator = 'peptalk-appearances', createdAt = new Date() } = {}) {
  const manifest = {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    slug: site.slug,
    orgName: site.orgName,
    mode: mode ?? (site.status === 'shell' ? 'shell' : 'populated'),
    createdAt: createdAt.toISOString(),
    generator,
  };
  const entries = [{ name: 'manifest.json', data: `${JSON.stringify(manifest, null, 2)}\n` }];
  for (const [path, text] of Object.entries(siteFiles(site))) entries.push({ name: path.split('/').at(-1), data: text });
  if (verify?.trim()) entries.push({ name: 'verify.md', data: verify.endsWith('\n') ? verify : `${verify}\n` });
  const dir = ogDir instanceof URL ? fileURLToPath(ogDir) : ogDir;
  if (dir && existsSync(dir))
    for (const name of readdirSync(dir).sort())
      if (isOgCardFor(site.slug, name)) entries.push({ name: `og/${name}`, data: readFileSync(join(dir, name)) });
  return writeZip(entries, { date: createdAt });
}

const parseJson = (name, data) => {
  try {
    return JSON.parse(data.toString('utf8'));
  } catch (error) {
    throw new PackError(`${name} in the pack is not valid JSON: ${error.message}`);
  }
};

/**
 * Reads and checks a pack. Unreadable or malformed packs throw PackError (with a message fit to show a person);
 * content problems are returned in `problems`, and block an import just like the validator blocks a save.
 * @param {Buffer} buffer
 * @param {{ existing?: Iterable<string>, redirects?: Record<string, string> }} [context] the registry's site slugs and
 *   old-slug redirects, to detect collisions
 * @returns {{ manifest: object, site: object, og: Record<string, Buffer>, verify: string, problems: string[],
 *   collision: boolean }}
 */
export function readPack(buffer, { existing = [], redirects = {} } = {}) {
  let entries;
  try {
    entries = readZip(buffer);
  } catch (error) {
    throw new PackError(error instanceof ZipError ? `Not a usable site pack: ${error.message}` : error.message);
  }
  const files = new Map(entries.map(entry => [entry.name, entry.data]));
  const unexpected = [...files.keys()].filter(
    name => name !== 'manifest.json' && !CONTENT.includes(name) && !OPTIONAL.includes(name) && !/^og\/[^/]+$/.test(name),
  );
  if (unexpected.length)
    throw new PackError(
      `The pack contains files a site pack may not: ${unexpected.join(', ')}. Allowed: manifest.json, ${[...CONTENT, ...OPTIONAL].join(', ')}, og/<slug>*.jpg.`,
    );
  if (!files.has('manifest.json')) throw new PackError('The pack has no manifest.json; is this a site pack?');
  const manifest = parseJson('manifest.json', files.get('manifest.json'));
  if (manifest.format !== PACK_FORMAT) throw new PackError(`manifest.json format is "${manifest.format}", not "${PACK_FORMAT}".`);
  if (manifest.version !== PACK_VERSION)
    throw new PackError(
      `This is a version ${manifest.version} site pack; this admin reads version ${PACK_VERSION}. Update the repository.`,
    );
  for (const name of CONTENT) if (!files.has(name)) throw new PackError(`The pack is missing ${name}.`);

  const site = {
    ...parseJson('site.json', files.get('site.json')),
    people: parseJson('people.json', files.get('people.json')),
    images: parseJson('images.json', files.get('images.json')),
    licences: files.has('licences.json') ? parseJson('licences.json', files.get('licences.json')) : emptyLicences(),
    verification: files.has('verification.json') ? parseJson('verification.json', files.get('verification.json')) : emptyVerification(),
  };
  const problems = validateSite(site);
  if (manifest.slug !== site.slug) problems.push(`manifest.json slug "${manifest.slug}" does not match site.json slug "${site.slug}"`);
  if (!['shell', 'populated'].includes(manifest.mode)) problems.push(`manifest.json mode must be "shell" or "populated"`);
  if (Object.hasOwn(redirects, site.slug))
    problems.push(`"${site.slug}" is an old slug that redirects to "${redirects[site.slug]}"; choose another slug`);

  const og = {};
  for (const [name, data] of files) {
    if (!name.startsWith('og/')) continue;
    const file = name.slice(3);
    if (!isOgCardFor(site.slug, file))
      problems.push(`${name} is not an Open Graph card for "${site.slug}" (expected ${site.slug}.jpg or ${site.slug}-<page>.jpg)`);
    else if (!isJpeg(data)) problems.push(`${name} is not a JPEG image`);
    else og[file] = data;
  }
  return {
    manifest,
    site,
    og,
    verify: files.get('verify.md')?.toString('utf8') ?? '',
    problems,
    collision: [...existing].includes(site.slug),
  };
}

/**
 * Repo-relative files for an imported pack: canonical content files plus og cards under public/og/ (binary).
 * @param {{ site: object, og: Record<string, Buffer> }} pack
 * @param {{ licencesPresent?: boolean, verificationPresent?: boolean }} [options] see siteFiles
 */
export function packFiles({ site, og }, options = {}) {
  return {
    ...siteFiles(site, options),
    ...Object.fromEntries(Object.entries(og).map(([name, data]) => [`public/og/${name}`, data])),
  };
}

/**
 * The site and registry an import would write (shared by the admin and `npm run import-pack`).
 * - A new site is inactive unless `publish`. A replaced site keeps its current state (or goes live with `publish`),
 *   so replacing the live root site never takes it offline.
 * - Replacing keeps the stored site's licence approvals and verification checks when the pack has none, pruned to
 *   what still exists (approvals for changed URLs then show as changed, not lost).
 * - The registry keeps its order; a new slug is appended. `root` makes it the root site.
 * @param {{ site: object }} pack from readPack
 * @param {{ registry: object, current?: object|null, publish?: boolean, root?: boolean }} options `current` is the
 *   stored site with the same slug, when replacing
 */
export function prepareImport(pack, { registry, current = null, publish = false, root = false }) {
  const { slug, active: _, ...rest } = pack.site;
  const live = publish || (current ? current.active !== false : false);
  let site = live ? { slug, ...rest } : { slug, active: false, ...rest };
  if (current) {
    if (!hasLicences(site.licences)) site.licences = current.licences;
    if (!hasVerification(site.verification)) site.verification = current.verification;
  }
  site = pruneVerification(pruneLicences(site));
  return { site, registry: withSite(registry, slug, { root }) };
}
