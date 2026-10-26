// Next.js config. The routing manifest (root site, redirects, slugs, domains, image hosts, Open Graph cards, indexing,
// tracking) is computed here at build time from the content provider and inlined for the proxy and metadata (see
// lib/manifest.ts).
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants.js';
import { createJsonProvider } from './lib/content/json-provider.ts';
import { selectProvider } from './lib/content/select.ts';
import { buildManifest } from './lib/manifest.ts';
import { NOINDEX, SECURITY_HEADERS } from './lib/proxy/decide.ts';

/** One value per build; stored in the environment so build workers that load this config again agree on it. */
function cacheScope(): string {
  process.env.APPEARANCES_CACHE_SCOPE ||= process.env.VERCEL_DEPLOYMENT_ID || randomUUID();
  return process.env.APPEARANCES_CACHE_SCOPE;
}

export default async function config(phase: string): Promise<NextConfig> {
  const distDir = process.env.NEXT_DIST_DIR || '.next';
  // During `next build`, remote people (Airtable) are read once here and shared with the page workers through
  // per-site snapshot files, instead of once per worker (lib/content/select.ts → withBuildSnapshot). In the OS temp
  // directory, not .next/cache, which Vercel keeps between builds.
  if (phase === PHASE_PRODUCTION_BUILD) process.env.APPEARANCES_BUILD_SNAPSHOT ||= join(tmpdir(), `appearances-people-${cacheScope()}`);
  // Build and dev read the selected providers (CONTENT_PROVIDER / PEOPLE_PROVIDER), so routes, image hosts and the CSP
  // match the published content. Any other phase (a self-hosted `next start` loading this file at boot) never calls a
  // remote source: the manifest is already inlined in the build, and a server must not fail to start because Airtable
  // or the CMS is down. There the optimizer allows the JSON content's hosts plus IMAGE_HOSTS_EXTRA.
  const remote = phase === PHASE_PRODUCTION_BUILD || phase === PHASE_DEVELOPMENT_SERVER;
  const provider = remote ? selectProvider(process.env, { json: { cache: false } }) : createJsonProvider({ cache: false });
  const manifest = await buildManifest(provider, join(process.cwd(), 'public', 'og'));
  return {
    reactStrictMode: true,
    // Tests build into their own directory so they never clobber (or reuse a stale) .next.
    distDir,
    poweredByHeader: false,
    // Keep <title> and meta tags in <head> for every client, never streamed into <body>.
    htmlLimitedBots: /.*/,
    env: {
      APPEARANCES_MANIFEST: JSON.stringify(manifest),
      // Scopes the content cache (lib/content/index.ts) to this build: cached entries outlive deployments.
      APPEARANCES_CACHE_SCOPE: cacheScope(),
    },
    // The JSON provider reads these at build time (and at runtime in `next dev`); file tracing can't see dynamic fs
    // paths, so include them explicitly.
    outputFileTracingIncludes: {
      '/**': [
        './src/sites/**/*.json',
        './src/copy/legal/*.md',
        './public/styles.css',
        './public/tracking.js',
        './public/gallery.css',
        './config/airtable.json',
      ],
    },
    experimental: {
      // Several root layouts (one per site, plus the hub) share one 404 page: app/global-not-found.tsx.
      globalNotFound: true,
      // Integrity hashes on the framework's script tags (build-time; pages are static).
      sri: { algorithm: 'sha256' },
    },
    images: {
      // Content photos (lib/render/images.ts). Getty comps are at most 612 px wide (a few 1024), and the optimizer
      // never upscales, so 256/384/640 cover every slot; more widths would only lengthen the srcset in every page.
      // WebP only: AVIF encodes much slower for a small gain at these sizes.
      remotePatterns: manifest.photoOrigins.map(origin => {
        const url = new URL(origin);
        return { protocol: url.protocol.replace(':', '') as 'https', hostname: url.hostname, pathname: '/**' };
      }),
      deviceSizes: [384, 640],
      imageSizes: [256],
      formats: ['image/webp'],
      qualities: [75],
      // Source URLs are content-addressed (Getty ids, signed query); cache the resized copies for 31 days.
      minimumCacheTTL: 2678400,
    },
    // The proxy sets these on everything it handles; this also covers /_next/static, which it skips.
    async headers() {
      return [
        { source: '/:path*', headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })) },
        { source: '/_next/static/:path*', headers: [{ key: 'X-Robots-Tag', value: NOINDEX }] },
      ];
    },
  };
}
