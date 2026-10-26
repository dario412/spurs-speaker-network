// Shared loaders for the app/[site] routes: route segment -> published site and mount (or notFound()), static params,
// render context, metadata. The `[site]` segment is a slug (the hub folder copy) or `<slug>--domain` (the copy the
// proxy serves on the site's own domain, whose links have no slug prefix); see lib/domains.ts and docs/domains.md.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { content } from '../content/index.ts';
import { pagesFor } from '../content/publish.ts';
import type { PageKey, Site } from '../content/types.ts';
import { domainsFor, mountSegments, type SiteDomain } from '../domains.ts';
import { type SiteContext, siteContext } from '../render/context.ts';
import { langFor } from '../seo/indexing.ts';
import { type PageMeta, pageMetadata } from './metadata.ts';
import { type MountedSite, mountedSite } from './mount.ts';

export type { MountedSite } from './mount.ts';

/** Domains of published sites only. */
async function publishedDomains(): Promise<Record<string, SiteDomain>> {
  const [registry, sites] = await Promise.all([content().getRegistry(), content().listSites()]);
  return domainsFor(
    registry.domains,
    sites.map(site => site.slug),
  );
}

/** The site and mount for a route segment, or null (unknown or inactive site, or a domain mount without a domain). */
export const loadSite = (segment: string): Promise<MountedSite | null> => mountedSite(content(), segment);

/** The site for a route, or a 404 (inactive and unknown sites). */
export async function siteOr404(segment: string): Promise<MountedSite> {
  const mounted = await loadSite(segment);
  if (!mounted) notFound();
  return mounted;
}

/** The site, 404 when the optional page is switched off in site.json `pages`. */
export async function optionalPageOr404(segment: string, page: PageKey): Promise<MountedSite> {
  const mounted = await siteOr404(segment);
  if (!pagesFor(mounted.site)[page]) notFound();
  return mounted;
}

/** Route segments to prerender for the sites `filter` keeps: each slug, plus `<slug>--domain` for a site with a domain. */
export async function siteSegments(filter: (site: Site) => boolean = () => true): Promise<{ site: string }[]> {
  const sites = (await content().listSites()).filter(filter);
  return mountSegments(
    sites.map(site => site.slug),
    await publishedDomains(),
  ).map(site => ({ site }));
}

export const siteParams = (): Promise<{ site: string }[]> => siteSegments();

export const optionalPageParams = (page: PageKey): Promise<{ site: string }[]> => siteSegments(site => pagesFor(site)[page]);

export const ctxFor = ({ site, domain, onDomain }: MountedSite, demo = false): SiteContext => siteContext(site, { demo, domain, onDomain });

/** The site's favicon: its crest when it has one. */
export const iconFor = (site: Site): string => site.marks.crest ?? '/peptalk/favicon.png';

/**
 * Metadata for a site page: the page's copy plus the site's name, icon, language and indexing switch. `path` is the
 * page's link path (`${ctx.base}/legends`); canonical and Open Graph URLs are the canonical copy's, on any copy.
 */
export function siteMetadata(
  ctx: SiteContext,
  copy: { title: string; description: string },
  page: Omit<PageMeta, 'title' | 'description' | 'siteName' | 'icon' | 'indexable' | 'lang' | 'origin'> & { indexable?: boolean },
): Metadata {
  const { site } = ctx;
  return pageMetadata({
    ...copy,
    siteName: site.platform,
    icon: iconFor(site),
    lang: langFor(site),
    ...page,
    path: ctx.url(page.path),
    origin: ctx.origin,
    indexable: ctx.indexable && page.indexable !== false,
  });
}
