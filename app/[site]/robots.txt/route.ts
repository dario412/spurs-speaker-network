// /robots.txt on a site's own domain (the proxy rewrites it to /<slug>--domain/robots.txt; the hub's is app/robots.ts).
// Allows everything once the site is indexable and the domain is live, with the domain's sitemap; disallows all before.
import { notFound } from 'next/navigation';
import { content } from '../../../lib/content/index.ts';
import { domainsFor, mountSegment } from '../../../lib/domains.ts';
import { ctxFor, loadSite } from '../../../lib/pages/site-page.ts';
import { domainRobotsTxt } from '../../../lib/seo/discovery.ts';

export const dynamic = 'force-static';
export const dynamicParams = false;

/** Domain mounts only: a hub folder has no robots.txt of its own. */
export async function generateStaticParams(): Promise<{ site: string }[]> {
  const [registry, sites] = await Promise.all([content().getRegistry(), content().listSites()]);
  return Object.keys(
    domainsFor(
      registry.domains,
      sites.map(site => site.slug),
    ),
  ).map(slug => ({ site: mountSegment(slug) }));
}

export async function GET(_request: Request, { params }: RouteContext<'/[site]/robots.txt'>) {
  const mounted = await loadSite((await params).site);
  if (!mounted?.onDomain) notFound();
  const ctx = ctxFor(mounted);
  return new Response(domainRobotsTxt(ctx.indexable, ctx.origin), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
