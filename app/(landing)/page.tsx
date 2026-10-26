// The PepTalk landing page listing every published platform (master password only; see lib/proxy/gate.ts). The route is
// `/`: the hub's home. When registry.json → rootSite makes `/` redirect to a site, the proxy serves this page at `/all`
// instead (a rewrite), and its canonical URL follows (lib/render/routes.ts → landingPath). Prerendered.
import type { Metadata } from 'next';
import { LandingPage } from '../../components/landing.tsx';
import { content } from '../../lib/content/index.ts';
import { domainsFor } from '../../lib/domains.ts';
import { publicOrigin } from '../../lib/origin.ts';
import { hubIndexable, hubLanding } from '../../lib/pages/hub.ts';
import { pageMetadata } from '../../lib/pages/metadata.ts';
import { decodeDeep } from '../../lib/render/text.ts';
import { clampDescription } from '../../lib/seo/copy.ts';

async function description(): Promise<string> {
  const sites = decodeDeep(await content().listSites());
  return clampDescription(
    `Book former players, current stars, managers, coaches and crew from ${sites.map(site => site.short).join(', ')} through PepTalk.`,
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: 'Book sports talent for your event | PepTalk Appearances',
    description: await description(),
    path: await hubLanding(),
    siteName: 'PepTalk Appearances',
    image: '/og/appearances.jpg',
    ogTitle: 'Book sporting greats for your next event',
    indexable: await hubIndexable(),
  });
}

export default async function Page() {
  const [sites, registry] = await Promise.all([content().listSites(), content().getRegistry()]);
  return (
    <LandingPage
      sites={sites}
      domains={domainsFor(
        registry.domains,
        sites.map(site => site.slug),
      )}
      origin={publicOrigin()}
      indexable={await hubIndexable()}
      description={await description()}
      path={await hubLanding()}
    />
  );
}
