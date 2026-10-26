// POST /api/revalidate: on-demand revalidation for CMS and Airtable webhooks (lib/revalidate/handler.ts). Other methods
// answer 405 (no handler exported). Setup: docs/content-contract.md → Revalidation.
import { revalidateTag } from 'next/cache';
import { createRateLimiter, handleRevalidate } from '../../../lib/revalidate/handler.ts';

export const dynamic = 'force-dynamic';

// Light abuse protection: 30 calls a minute per client, per instance. Webhooks send one call per change.
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export function POST(request: Request): Promise<Response> {
  return handleRevalidate(request, {
    secret: process.env.REVALIDATE_SECRET,
    // 'max': visitors get the cached page while it regenerates (Next 16's recommended profile); { expire: 0 }: the next
    // request waits for fresh content (the documented choice for webhooks that need the old data gone at once).
    revalidate: (tag, mode) => revalidateTag(tag, mode === 'expire' ? { expire: 0 } : 'max'),
    limiter,
    log: entry => console.log(JSON.stringify(entry)),
  });
}
