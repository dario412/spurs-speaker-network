// Next.js 16 proxy (formerly middleware; https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
// Runs on the Node.js runtime, before Vercel's CDN cache, for every request except hashed framework assets: host
// routing (per-site domains), the gate, redirects, security headers and the CSP, X-Robots-Tag and Cache-Control. Pages
// themselves are prerendered (static), so the proxy passes nothing to them; the enquiry endpoint gets one request header
// (the site whose domain it was posted on), always set or removed here. The logic lives in lib/proxy/decide.ts.
import { type NextRequest, NextResponse } from 'next/server';
import { manifest } from './lib/manifest.ts';
import { decide, type ProxyConfig } from './lib/proxy/decide.ts';
import { passwordsFromEnv } from './lib/proxy/gate.ts';

let cached: ProxyConfig | undefined;
const getConfig = (): ProxyConfig => {
  if (cached) return cached;
  const routing = manifest();
  cached = {
    manifest: routing,
    passwords: passwordsFromEnv(process.env, routing.slugs),
    production: process.env.NODE_ENV === 'production',
    previewPublic: process.env.PREVIEW_PUBLIC?.toLowerCase() === 'true',
    dev: process.env.NODE_ENV === 'development',
  };
  return cached;
};

export async function proxy(request: NextRequest) {
  const decision = await decide(
    {
      method: request.method,
      url: request.url,
      authorization: request.headers.get('authorization'),
      // On Vercel, `host` is the custom domain the visitor used (https://vercel.com/docs/headers/request-headers).
      host: request.headers.get('host'),
    },
    getConfig(),
  );
  if (decision.action === 'respond') {
    // Next.js requires absolute redirect targets from the proxy; decide() returns paths.
    if (decision.headers.Location) decision.headers.Location = new URL(decision.headers.Location, request.url).toString();
    return new NextResponse(request.method === 'HEAD' ? null : (decision.body ?? null), {
      status: decision.status,
      headers: decision.headers,
    });
  }
  // nextUrl.clone() keeps the rewrite on the origin Next.js sees. Self-hosted `next start -H <ip>` treats it as an
  // external URL (localhost:port) and fails to proxy it; Vercel and plain `next start` serve it internally.
  const target = request.nextUrl.clone();
  if (decision.rewrite) {
    target.pathname = decision.rewrite;
    target.search = '';
  }
  let forwarded: { request: { headers: Headers } } | undefined;
  if (decision.requestHeaders) {
    const headers = new Headers(request.headers);
    for (const [key, value] of Object.entries(decision.requestHeaders)) {
      if (value) headers.set(key, value);
      else headers.delete(key);
    }
    forwarded = { request: { headers } };
  }
  const response = decision.rewrite ? NextResponse.rewrite(target, forwarded) : NextResponse.next(forwarded);
  for (const [key, value] of Object.entries(decision.headers)) response.headers.set(key, value);
  return response;
}

export const config = {
  // Everything except hashed framework assets (no partner content in them; next.config.ts adds the static headers).
  // /_next/image is included: optimised photos pass the gate like any other content.
  matcher: ['/((?!_next/static).*)'],
};
