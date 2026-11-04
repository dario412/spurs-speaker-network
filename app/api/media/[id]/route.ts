// /api/media/<id>: an image uploaded in the CMS media library (lib/cms/media.ts). Public, like any site photo, and
// immutable (an id never changes its bytes), so the CDN and the image optimizer can cache it for good.
import { readMedia } from '../../../../lib/cms/media.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const media = await readMedia((await params).id);
  if (!media) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(new Uint8Array(media.bytes), {
    headers: {
      'Content-Type': media.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
