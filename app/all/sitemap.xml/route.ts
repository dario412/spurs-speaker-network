// /all/sitemap.xml: the hub pages, when registry.json makes the hub indexable (else an empty urlset). It lists the landing
// page at its URL (`/`, or `/all` with a root site); this file keeps its path either way.
import { content } from '../../../lib/content/index.ts';
import { publicOrigin } from '../../../lib/origin.ts';
import { legalIndexable } from '../../../lib/pages/hub.ts';
import { landingPath } from '../../../lib/render/routes.ts';
import { hubSitemapEntries, urlsetXml } from '../../../lib/seo/discovery.ts';
import { isHubIndexable } from '../../../lib/seo/indexing.ts';

export const dynamic = 'force-static';

export async function GET() {
  const provider = content();
  const [registry, terms] = await Promise.all([provider.getRegistry(), provider.getLegal('terms')]);
  return new Response(
    urlsetXml(hubSitemapEntries(isHubIndexable(registry), legalIndexable(terms), landingPath(registry.rootSite)), publicOrigin()),
    {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    },
  );
}
