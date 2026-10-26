// CMS provider: the seam for the crediblecreators.com CMS (selected with CONTENT_PROVIDER=cms). Not implemented yet.
//
// To implement, return the shapes in the content contract (docs/content-contract.md, schema/*.schema.json) and apply
// the publishing switches with lib/content/publish.ts, so inactive sites, hidden people and page switches behave
// identically. lib/content/memory-provider.ts is a complete, minimal provider to copy from.
//   getRegistry()   -> { order, rootSite?, redirects }
//   listSites()     -> publishedSites(registry, rawSites)
//   getSite(slug)   -> the published site, or null (unknown, malformed or inactive slug)
//   getRawSite / listRawSites -> stored shape, for validation
//   getLegal(kind)  -> parseLegal(kind, markdown) or an equivalent LegalDoc
// Failures throw ContentError (lib/content/errors.ts), never an empty result. Images are stable URLs keyed with
// imageIdFor(). Don't add fetch caching: lib/content/cached.ts already caches and tags every read for
// POST /api/revalidate. Done when `CONTENT_PROVIDER=cms npm run contract` is green.
import type { ContentProvider } from './provider.ts';

export function createCmsProvider(): ContentProvider {
  const missing = (what: string) => () => Promise.reject(new Error(`CONTENT_PROVIDER=cms: ${what} is not implemented yet`));
  return {
    getRegistry: missing('getRegistry'),
    listSites: missing('listSites'),
    getSite: missing('getSite'),
    getRawSite: missing('getRawSite'),
    listRawSites: missing('listRawSites'),
    getLegal: missing('getLegal'),
  };
}
