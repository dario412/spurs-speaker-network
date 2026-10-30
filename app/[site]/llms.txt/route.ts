// /<slug>/llms.txt (and /llms.txt on the site's domain; https://llmstxt.org/): a plain-markdown index of an indexable
// site, served only by its canonical copy (the domain once live, else the hub folder).
import { notFound } from 'next/navigation';
import { content } from '../../../lib/content/index.ts';
import { publicOrigin } from '../../../lib/origin.ts';
import { legalIndexable } from '../../../lib/pages/hub.ts';
import { ctxFor, loadSite, siteSegments } from '../../../lib/pages/site-page.ts';
import { siteLlmsTxt } from '../../../lib/seo/discovery.ts';
import { isSiteIndexable } from '../../../lib/seo/indexing.ts';

export const dynamic = 'force-static';
export const dynamicParams = false;

export const generateStaticParams = () => siteSegments(site => isSiteIndexable(site));

export async function GET(_request: Request, { params }: RouteContext<'/[site]/llms.txt'>) {
  const mounted = await loadSite((await params).site);
  if (!mounted || !ctxFor(mounted).indexable) notFound();
  const legal = await Promise.all([content().getLegal('terms'), content().getLegal('privacy'), content().getLegal('accessibility')]);
  return new Response(siteLlmsTxt(mounted.site, publicOrigin(), legal.filter(legalIndexable), mounted.domain), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
