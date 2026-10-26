// /llms.txt (https://llmstxt.org/): the indexable platforms; 404 while nothing is indexable.
import { content } from '../../lib/content/index.ts';
import { publicOrigin } from '../../lib/origin.ts';
import { landingPath } from '../../lib/render/routes.ts';
import { hubLlmsTxt } from '../../lib/seo/discovery.ts';
import { indexableSlugs, isHubIndexable } from '../../lib/seo/indexing.ts';

export const dynamic = 'force-static';

export async function GET() {
  const provider = content();
  const [sites, registry] = await Promise.all([provider.listSites(), provider.getRegistry()]);
  const text = hubLlmsTxt(
    sites,
    indexableSlugs(sites),
    isHubIndexable(registry),
    publicOrigin(),
    registry.domains,
    landingPath(registry.rootSite),
  );
  return text === null
    ? new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    : new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
