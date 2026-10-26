// /landing.css: every site's theme plus the landing page's images (master password only, like the landing page).
import { content } from '../../lib/content/index.ts';
import { landingStylesheet } from '../../lib/render/theme.ts';

export const dynamic = 'force-static';

export async function GET() {
  return new Response(landingStylesheet(await content().listSites()), {
    headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
