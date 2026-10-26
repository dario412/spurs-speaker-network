// The tagged content layer pages read through. Every read is wrapped in a cache entry carrying the tags in tags.ts, so
// POST /api/revalidate can regenerate exactly the prerendered pages that used the data (ISR, no redeploy). The cache
// function is injected: index.ts passes Next's unstable_cache; tests pass a recorder. Pure, no Next.js import.
//
// One entry per site, and nothing else reads the source: the site lists are composed from the per-site entries, and
// profiles read their site's entry. So revalidating `site:<slug>` (or one of its `person:` tags) costs exactly one
// source read for that site, however many pages then regenerate, and never touches the other sites.
import type { ContentProvider } from './provider.ts';
import { legalTag, personTag, SLUG_RE, siteTag, TAG_ALL, TAG_LEGAL, TAG_REGISTRY, TAG_SITES } from './tags.ts';
import type { LegalKind, Site } from './types.ts';

/** Wraps `load` in a cache entry identified by `key` and tagged with `tags`; returns the (possibly cached) result. */
export type CacheFn = <T>(load: () => Promise<T>, key: string[], tags: string[]) => Promise<T>;

/** Next.js keeps at most 128 tags per cache entry; anything past that is dropped. */
export const MAX_TAGS_PER_ENTRY = 128;

export interface CacheOptions {
  /**
   * The person slugs of a site that have pages in this build (from the routing manifest), so the site's entry also
   * carries their `person:` tags. Sites with more people than fit under MAX_TAGS_PER_ENTRY get the first ones only;
   * `site:<slug>` always works.
   */
  peopleOf?: (site: string) => string[];
}

export function withCacheTags(provider: ContentProvider, cache: CacheFn, options: CacheOptions = {}): ContentProvider {
  const getRegistry = () => cache(() => provider.getRegistry(), ['registry'], [TAG_ALL, TAG_REGISTRY, TAG_SITES]);
  const siteTags = (slug: string) => {
    const base = [TAG_ALL, siteTag(slug)];
    const people = (options.peopleOf?.(slug) ?? []).map(person => personTag(slug, person));
    return [...base, ...people.slice(0, MAX_TAGS_PER_ENTRY - base.length)];
  };
  // After a revalidation, several pages regenerate in the background at once and all miss the same entry: share one
  // in-flight source read between them (only while it is in flight, so nothing older than the read is ever reused).
  const inflight = new Map<string, Promise<Site | null>>();
  const readSite = (slug: string): Promise<Site | null> => {
    let pending = inflight.get(slug);
    if (!pending) {
      pending = provider.getSite(slug).finally(() => inflight.delete(slug));
      inflight.set(slug, pending);
    }
    return pending;
  };
  const getSite = async (slug: string): Promise<Site | null> =>
    SLUG_RE.test(slug) ? cache(() => readSite(slug), ['site', slug], siteTags(slug)) : null;
  return {
    getRegistry,
    getSite,
    // Composed from the per-site entries (same result as provider.listSites() for a conforming provider), so a
    // change to one site never re-reads the others.
    listSites: async () => {
      const sites = await Promise.all((await getRegistry()).order.map(getSite));
      return sites.filter((site): site is Site => site !== null);
    },
    // Stored shapes are for the admin and validation; they are never cached.
    getRawSite: slug => provider.getRawSite(slug),
    listRawSites: () => provider.listRawSites(),
    getLegal: (kind: LegalKind) => cache(() => provider.getLegal(kind), ['legal', kind], [TAG_ALL, TAG_LEGAL, legalTag(kind)]),
  };
}

/** No caching (next dev, scripts): every read goes to the provider. */
export const passThrough: CacheFn = load => load();

/** Person slugs per site from the manifest's page list (`/<site>/legends/<person>`). */
export function peopleFromPages(pages: string[]): (site: string) => string[] {
  const bySite = new Map<string, string[]>();
  for (const path of pages) {
    const match = /^\/([a-z0-9-]+)\/legends\/([a-z0-9-]+)$/.exec(path);
    if (match) bySite.set(match[1], [...(bySite.get(match[1]) ?? []), match[2]]);
  }
  return site => bySite.get(site) ?? [];
}
