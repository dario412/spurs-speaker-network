// /<slug>/site.css (and /site.css on the site's domain): that site's theme variables and crest treatment (lib/render/theme.ts).
// Prerendered at build; the proxy still gates it (a site password opens only its own stylesheet).
import { notFound } from 'next/navigation';
import { loadSite, siteParams } from '../../../lib/pages/site-page.ts';
import { siteStylesheet } from '../../../lib/render/theme.ts';

export const dynamic = 'force-static';
export const dynamicParams = false;
export const generateStaticParams = siteParams;

export async function GET(_request: Request, { params }: RouteContext<'/[site]/site.css'>) {
  const mounted = await loadSite((await params).site);
  if (!mounted) notFound();
  return new Response(siteStylesheet(mounted.site), {
    headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
