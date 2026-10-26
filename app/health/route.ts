// /health: status and deployed commit only, no password (the proxy lets it through and answers 503 when misconfigured).
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { status: 'ok', revision: process.env.VERCEL_GIT_COMMIT_SHA || 'local' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
