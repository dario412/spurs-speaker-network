// POST /api/enquiry: the enquiry form's endpoint (lib/enquiry/handler.ts). Dynamic: it reads the request. The proxy lets
// only POST through to it, gates it, and names the site when the form was posted on a site's own domain.

import { createRateLimiter, handleEnquiry } from '../../../lib/enquiry/handler.ts';
import { publicOrigin } from '../../../lib/origin.ts';
import { loadSite } from '../../../lib/pages/site-page.ts';

export const dynamic = 'force-dynamic';

const limiter = createRateLimiter();

export function POST(request: Request) {
  return handleEnquiry(request, {
    env: process.env,
    fetch,
    now: Date.now,
    limiter,
    log: line => console.log(JSON.stringify(line)),
    loadSite: async slug => {
      const mounted = await loadSite(slug);
      return mounted && !mounted.onDomain ? { site: mounted.site, domain: mounted.domain } : null;
    },
    hubOrigin: publicOrigin(),
  });
}
