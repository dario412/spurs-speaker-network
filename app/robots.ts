// robots.txt follows the indexing switch (lib/seo/discovery.ts): "disallow everything" until a site or the hub is
// indexable, then Allow lines for exactly those paths and the assets they render with, plus the sitemap.
import type { MetadataRoute } from 'next';
import { content } from '../lib/content/index.ts';
import { publicOrigin } from '../lib/origin.ts';
import { landingPath } from '../lib/render/routes.ts';
import { robotsRules } from '../lib/seo/discovery.ts';
import { indexableSlugs, isHubIndexable } from '../lib/seo/indexing.ts';

export const dynamic = 'force-static';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const provider = content();
  const [sites, registry] = await Promise.all([provider.listSites(), provider.getRegistry()]);
  return robotsRules(indexableSlugs(sites), isHubIndexable(registry), publicOrigin(), landingPath(registry.rootSite));
}
