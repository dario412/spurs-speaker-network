// /admin: the CMS (lib/cms/web.ts). Dynamic, never cached, behind its own sign-in (not the preview password).
import { revalidateTag } from 'next/cache';
import { handleCms } from '../../../lib/cms/web.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Uploads (4 MB images) and the Airtable sync can take a while.
export const maxDuration = 60;

const handle = (request: Request) => handleCms(request, { revalidate: tag => revalidateTag(tag, 'max') });
export const GET = handle;
export const HEAD = handle;
export const POST = handle;
