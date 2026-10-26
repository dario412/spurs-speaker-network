// /sitemap.xml on the hub: the sitemap index (one sitemap per indexable site, plus the hub's; a site with a live domain
// has its own on that domain). Empty while nothing is indexable.
import { content } from '../../lib/content/index.ts';
import { publicOrigin } from '../../lib/origin.ts';
import { sitemapIndexXml, sitemapPaths } from '../../lib/seo/discovery.ts';
import { indexableSlugs, isHubIndexable } from '../../lib/seo/indexing.ts';

export const dynamic = 'force-static';

export async function GET() {
  const provider = content();
  const [sites, registry] = await Promise.all([provider.listSites(), provider.getRegistry()]);
  return new Response(sitemapIndexXml(sitemapPaths(indexableSlugs(sites), isHubIndexable(registry), registry.domains), publicOrigin()), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
