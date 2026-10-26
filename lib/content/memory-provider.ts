// In-memory ContentProvider: content handed over as plain objects (a CMS snapshot, an export, test fixtures). It is
// the smallest complete provider, so it doubles as the reference for a CMS implementation: return the contract shapes,
// apply the publishing switches with publish.ts, null for unknown slugs, ContentError for broken input.
import { ContentError } from './errors.ts';
import { parseLegal } from './legal.ts';
import type { ContentProvider } from './provider.ts';
import { isActive, publishable, publishedSites } from './publish.ts';
import type { LegalDoc, LegalKind, RawSite, Registry } from './types.ts';

export interface MemoryContent {
  registry: Registry;
  /** Sites as stored (hidden people and bookkeeping included); `licences` / `verification` default to empty. */
  sites: (Omit<RawSite, 'licences' | 'verification'> & Partial<Pick<RawSite, 'licences' | 'verification'>>)[];
  /** Legal documents as parsed docs, or markdown with frontmatter (parsed with parseLegal). */
  legal: Record<LegalKind, LegalDoc | string>;
}

const clone = <T>(value: T): T => structuredClone(value);

export function createMemoryProvider(input: MemoryContent): ContentProvider {
  const bySlug = new Map<string, RawSite>();
  for (const site of input.sites) {
    if (bySlug.has(site.slug)) throw new ContentError('invalid_content', `Site "${site.slug}" is listed twice`, { provider: 'memory' });
    bySlug.set(site.slug, { licences: { images: {}, marks: {} }, verification: { pages: {}, people: {} }, ...clone(site) } as RawSite);
  }
  const missing = input.registry.order.filter(slug => !bySlug.has(slug));
  if (missing.length)
    throw new ContentError('invalid_content', `The registry lists sites with no content: ${missing.join(', ')}`, { provider: 'memory' });
  const raw = (slug: string): RawSite | null => (input.registry.order.includes(slug) ? clone(bySlug.get(slug) ?? null) : null);
  const raws = () => input.registry.order.map(slug => raw(slug)).filter((site): site is RawSite => site !== null);
  return {
    getRegistry: async () => clone(input.registry),
    listSites: async () => publishedSites(input.registry, raws()),
    getSite: async slug => {
      const site = raw(slug);
      return site && isActive(site) ? publishable(site) : null;
    },
    getRawSite: async slug => raw(slug),
    listRawSites: async () => raws(),
    getLegal: async kind => {
      const doc = input.legal[kind];
      if (doc === undefined) throw new ContentError('invalid_content', `No ${kind} document`, { provider: 'memory' });
      return typeof doc === 'string' ? parseLegal(kind, doc) : clone(doc);
    },
  };
}
