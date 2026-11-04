// POST /api/cron/sync-airtable (and GET, for Vercel Cron): the Airtable speaker sync without the CMS button
// (lib/cms/sync.ts). Authorised with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends exactly that).
import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { triggerRebuild } from '../../../../lib/cms/publish.ts';
import { runSpursSync } from '../../../../lib/cms/sync.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function sync(request: Request): Promise<Response> {
  if (!authorised(request))
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const result = await runSpursSync({ trigger: 'cron', startedBy: null });
  for (const tag of result.tags) revalidateTag(tag, 'max');
  if (result.rebuild) await triggerRebuild('airtable sync (cron)');
  return Response.json(
    { ok: result.ok, message: result.message },
    { status: result.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = sync;
export const POST = sync;
