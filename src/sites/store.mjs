// Turns site content back into files (and writes them). Content JSON has one canonical form (JSON.stringify, 2-space indent,
// trailing newline) so the site tools, the admin and hand edits all produce minimal diffs.
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITES_DIR } from './index.mjs';
import { hasLicences, normaliseLicences } from './licences.mjs';
import { hasVerification, normaliseVerification } from './verification.mjs';

export const formatJson = value => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Repo-relative path → file contents for one site. People, images, licences and verification are separate files;
 * everything else is site.json. licences.json and verification.json are written only when they have entries or the
 * `…Present` option says the file already exists (so clearing the last entry empties it), which keeps sites without
 * approvals or checks free of empty files.
 * @param {{ slug: string, people: object[], images: Record<string, string>, licences?: object, verification?: object }} site
 * @param {{ licencesPresent?: boolean, verificationPresent?: boolean }} [options]
 */
export function siteFiles(
  { people, images, licences, verification, ...site },
  { licencesPresent = false, verificationPresent = false } = {},
) {
  const dir = `src/sites/${site.slug}`;
  return {
    [`${dir}/site.json`]: formatJson(site),
    [`${dir}/people.json`]: formatJson(people),
    [`${dir}/images.json`]: formatJson(images),
    ...(hasLicences(licences) || licencesPresent ? { [`${dir}/licences.json`]: formatJson(normaliseLicences(licences)) } : {}),
    ...(hasVerification(verification) || verificationPresent
      ? { [`${dir}/verification.json`]: formatJson(normaliseVerification(verification)) }
      : {}),
  };
}

export const registryFile = registry => ({ 'src/sites/registry.json': formatJson(registry) });

// Inside the Next.js app (the CMS at /admin) modules are bundled, so the folder is found from the working directory.
export const PUBLIC_DIR = process.env.NEXT_RUNTIME
  ? pathToFileURL(`${join(/*turbopackIgnore: true*/ process.cwd(), 'public')}/`)
  : new URL(/*turbopackIgnore: true*/ '../../public/', import.meta.url);

/**
 * Where a repo-relative content path lives on disk: `src/sites/…` under `dir`, `public/…` (og cards from site packs)
 * under `publicDir`. Anything else is refused, so a files map can never write outside those two folders.
 */
export function targetFor(path, dir = SITES_DIR, publicDir = PUBLIC_DIR) {
  if (/(^|\/)\.\.(\/|$)|\\/.test(path)) throw new Error(`Refusing to write ${path}`);
  if (path.startsWith('src/sites/')) return new URL(path.slice('src/sites/'.length), dir);
  if (path.startsWith('public/')) return new URL(path.slice('public/'.length), publicDir);
  throw new Error(`Refusing to write ${path}: only src/sites/ and public/ are content`);
}

/**
 * Writes a `{ 'src/sites/…' | 'public/…': contents }` map (text or Buffer).
 * @param {Record<string, string|Buffer>} files
 * @param {URL} [dir] the src/sites/ directory
 * @param {{ publicDir?: URL }} [options]
 */
export async function writeFiles(files, dir = SITES_DIR, { publicDir = PUBLIC_DIR } = {}) {
  for (const [path, contents] of Object.entries(files)) {
    const target = targetFor(path, dir, publicDir);
    await mkdir(new URL('./', target), { recursive: true });
    // Write then rename, so a reader never sees a half-written file.
    const temporary = new URL(`${target.href}.${process.pid}.tmp`);
    await writeFile(temporary, contents);
    await rename(temporary, target);
  }
}

/**
 * Adds `slug` to the registry's display order (once) and optionally makes it the root site (`/` redirects there). An
 * absent rootSite (`/` serves the landing page) stays absent unless `root` is set.
 */
export function withSite(registry, slug, { root = false } = {}) {
  const { rootSite, ...rest } = registry;
  const next = root ? slug : rootSite;
  return {
    ...rest,
    order: registry.order.includes(slug) ? registry.order : [...registry.order, slug],
    ...(next ? { rootSite: next } : {}),
  };
}

/** The registry with no root site: `/` on the hub serves the PepTalk landing page, and `/all` answers 301 to it. */
export function withoutRoot(registry) {
  const { rootSite: _, ...rest } = registry;
  return rest;
}
