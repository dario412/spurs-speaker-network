// The local admin's content API (src/admin/content.mjs: snapshot, validated saveSite / saveRegistry) over the CMS
// database: the committed files with the saved files on top. Used by the /admin screens and the Airtable sync.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createContent } from '../../src/admin/content.mjs';
import { imageHosts, publishedSites } from '../content/publish.ts';
import { allPaths, landingPath } from '../render/routes.ts';
import { loadContentFiles, saveContentFiles } from './content-files.ts';

const dirUrl = (...parts: string[]) => pathToFileURL(`${join(/*turbopackIgnore: true*/ process.cwd(), ...parts)}/`);

/** `saved.paths` collects every file the returned content API writes, for cache refresh after the request. */
export async function cmsContent(userEmail: string, saved: { paths: string[] }) {
  const overlay = await loadContentFiles();
  const storage = {
    name: 'cms',
    describe: () => ({
      label: 'CMS database',
      detail: 'Saves go live within a minute; new pages need a rebuild, which starts automatically.',
    }),
    read: (path: string) => overlay.get(path),
    async save(files: Record<string, string | Buffer>) {
      const text = Object.fromEntries(
        Object.entries(files).map(([path, body]) => [path, Buffer.isBuffer(body) ? body.toString('utf8') : body]),
      );
      await saveContentFiles(text, userEmail);
      for (const [path, body] of Object.entries(text)) overlay.set(path, body);
      saved.paths.push(...Object.keys(text));
      return { message: 'Saved.' };
    },
  };
  return createContent({ dir: dirUrl('src', 'sites'), publicDir: dirUrl('public'), storage });
}

/** What a build fixes: the pages that exist, the image hosts, domains and redirects. A change here needs a rebuild. */
export function buildShape(snap: { registry: unknown; sites: { broken?: unknown }[] }): string {
  const sites = publishedSites(snap.registry as never, snap.sites.filter(site => !site.broken) as never);
  const registry = snap.registry as { rootSite?: string; domains?: unknown; redirects?: unknown };
  return JSON.stringify([
    allPaths(sites, landingPath(registry.rootSite)).sort(),
    imageHosts(sites).sort(),
    registry.domains ?? null,
    registry.redirects ?? null,
  ]);
}
