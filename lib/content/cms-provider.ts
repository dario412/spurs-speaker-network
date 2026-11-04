// CMS provider (CONTENT_PROVIDER=cms): the content edited in /admin. Every read is the JSON provider over the files in
// the repository with the CMS's saved files on top (lib/cms/content-files.ts, one database row per edited file), so an
// empty database serves exactly what is committed, and the publishing switches, validation and contract are the same
// as for the JSON files. Each call reads the saved files once; lib/content/cached.ts caches and tags every read, and the
// CMS revalidates the tags it changed after each save (lib/cms/publish.ts).
import { loadContentFiles } from '../cms/content-files.ts';
import { databaseConfigured } from '../cms/db.ts';
import { ContentError } from './errors.ts';
import { createJsonProvider, type JsonProviderOptions } from './json-provider.ts';
import type { ContentProvider } from './provider.ts';

export function createCmsProvider(options: Omit<JsonProviderOptions, 'overlay' | 'cache' | 'name'> = {}): ContentProvider {
  const current = async (): Promise<ContentProvider> => {
    if (!databaseConfigured())
      throw new ContentError('config', 'CONTENT_PROVIDER=cms needs DATABASE_URL (the CMS database)', { provider: 'cms' });
    let overlay: Map<string, string>;
    try {
      overlay = await loadContentFiles();
    } catch (error) {
      throw new ContentError('unavailable', 'The CMS database could not be read', { provider: 'cms', cause: error });
    }
    return createJsonProvider({ ...options, cache: false, overlay, name: 'cms' });
  };
  return {
    getRegistry: async () => (await current()).getRegistry(),
    listSites: async () => (await current()).listSites(),
    getSite: async slug => (await current()).getSite(slug),
    getRawSite: async slug => (await current()).getRawSite(slug),
    listRawSites: async () => (await current()).listRawSites(),
    getLegal: async kind => (await current()).getLegal(kind),
  };
}
