// Route segment -> published site and mount, as a pure function of a ContentProvider (lib/pages/site-page.ts passes the
// app's tagged provider; tests pass their own). The `[site]` segment is a slug (the hub folder copy) or `<slug>--domain`
// (the copy the proxy serves on the site's own domain). Both copies read the same two cache entries, the registry and
// the site's own entry, so revalidating `site:<slug>` (or one of its `person:` tags) refreshes both copies, and never
// another site's pages (lib/content/cached.ts, docs/domains.md).
import type { ContentProvider } from '../content/provider.ts';
import type { Site } from '../content/types.ts';
import { domainsFor, MOUNT_SUFFIX, parseMount, type SiteDomain } from '../domains.ts';

/** A published site, and which copy of it a route renders. */
export interface MountedSite {
  site: Site;
  /** The site's domain (registry.json → domains), if it has one. */
  domain: SiteDomain | null;
  /** This copy is served on the site's own domain. */
  onDomain: boolean;
}

/** The site and mount for a route segment, or null (unknown or inactive site, or a domain mount without a domain). */
export async function mountedSite(
  provider: Pick<ContentProvider, 'getRegistry' | 'getSite'>,
  segment: string,
): Promise<MountedSite | null> {
  const slug = segment.endsWith(MOUNT_SUFFIX) ? segment.slice(0, -MOUNT_SUFFIX.length) : segment;
  // getSite answers only for published sites, so the site's own domain entry is all domainsFor needs: no site list,
  // whose entries would tie this page to every other site's cache tags.
  const [registry, site] = await Promise.all([provider.getRegistry(), provider.getSite(slug)]);
  if (!site) return null;
  const domains = domainsFor(registry.domains, [site.slug]);
  const mount = parseMount(segment, domains);
  if (!mount) return null;
  return { site, domain: domains[site.slug] ?? null, onDomain: mount.domain !== null };
}
