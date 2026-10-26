// The hub's public origin for canonical, Open Graph, sitemap and JSON-LD URLs. Pages are prerendered at build time, so
// the origin is fixed per build, never taken from the request: PUBLIC_ORIGIN; else this Vercel project's production
// hostname (so preview deployments point canonicals at production, as they should); else the hub.
// A site with a live domain uses that domain instead (lib/domains.ts → canonicalUrl); this is the hub's origin.
// VERCEL_PROJECT_PRODUCTION_URL is "the shortest production custom domain", which can be a partner's domain once the
// project has several, so a partner host is never taken for the hub
// (https://vercel.com/docs/environment-variables/system-environment-variables).
import type { Domains } from './domains.ts';
import { manifestDomains } from './manifest.ts';

type Env = Record<string, string | undefined>;

export const HUB = 'https://appearances.getapeptalk.com';

/** An `http(s)://host[:port]` origin, or null when the value isn't one (a path, a typo, a bare hostname). */
export function parseOrigin(value: string | undefined): string | null {
  if (!value || !URL.canParse(value)) return null;
  const url = new URL(value);
  return /^https?:$/.test(url.protocol) && url.hostname ? url.origin : null;
}

export function publicOrigin(env: Env = process.env, domains: Domains = manifestDomains()): string {
  if (env.PUBLIC_ORIGIN) {
    const origin = parseOrigin(env.PUBLIC_ORIGIN.trim());
    // A malformed PUBLIC_ORIGIN used to reach `new URL()` in every page and fail them all; fall back loudly instead.
    if (origin) return origin;
    console.error(
      JSON.stringify({ service: 'appearances', event: 'origin.invalid', message: 'PUBLIC_ORIGIN is not an http(s) origin; ignored' }),
    );
  }
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL ? parseOrigin(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`) : null;
  const partner = Object.values(domains).some(({ primary, aliases }) => [primary, ...aliases].some(host => vercel === `https://${host}`));
  return vercel && !partner ? vercel : HUB;
}

/** Absolute URL for a site path (`/spurs/legends`) on the public origin. */
export const absoluteUrl = (path: string, origin: string = publicOrigin()): string => new URL(path, `${origin}/`).toString();
