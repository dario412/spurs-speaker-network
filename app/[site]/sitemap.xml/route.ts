// /<slug>/sitemap.xml (and /sitemap.xml on the site's domain): that site's built, indexable pages (lib/seo/discovery.ts)
// with canonical URLs. Only the canonical copy lists anything (the domain once live, else the hub folder): the other copy,
// and every site until it launches, has an empty urlset.
import { notFound } from 'next/navigation';
import { content } from '../../../lib/content/index.ts';
import { publicOrigin } from '../../../lib/origin.ts';
import { legalIndexable } from '../../../lib/pages/hub.ts';
import { ctxFor, loadSite, siteParams } from '../../../lib/pages/site-page.ts';
import { folderToCanonical, siteSitemapEntries, urlsetXml } from '../../../lib/seo/discovery.ts';

export const dynamic = 'force-static';
export const dynamicParams = false;
export const generateStaticParams = siteParams;

export async function GET(_request: Request, { params }: RouteContext<'/[site]/sitemap.xml'>) {
  const mounted = await loadSite((await params).site);
  if (!mounted) notFound();
  const entries = siteSitemapEntries(mounted.site, {
    indexable: ctxFor(mounted).indexable,
    legalIndexable: legalIndexable(await content().getLegal('terms')),
  });
  return new Response(urlsetXml(entries, folderToCanonical(mounted.site, mounted.domain, publicOrigin())), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
