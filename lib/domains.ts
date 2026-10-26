// Per-site domains (docs/domains.md): registry.json → domains: { <slug>: { primary, aliases, live } }.
// Pure functions shared by the validator, the build manifest, the proxy and the pages, so a host means the same thing
// everywhere. Pages are prerendered, so a site with a domain gets a second prerendered copy of every page (the
// "domain mount", route segment `<slug>--domain`) whose links have no slug prefix; the proxy rewrites the site's host to
// it. Slugs never contain `--`, so a mount segment can never be mistaken for a site.
type Env = Record<string, string | undefined>;

export interface SiteDomain {
  /** The canonical host (no scheme, port or path). */
  primary: string;
  /** Extra hosts that answer 301 to `primary`, keeping path and query. */
  aliases: string[];
  /** `true` once DNS and TLS work: hub folder URLs 301 to the domain, and canonical URLs use it. */
  live: boolean;
}

export type Domains = Record<string, SiteDomain>;

export const DEFAULT_HUB_HOST = 'appearances.getapeptalk.com';

/** Route segment of a site's domain mount. */
export const MOUNT_SUFFIX = '--domain';
export const mountSegment = (slug: string): string => `${slug}${MOUNT_SUFFIX}`;

/** A lowercase DNS name with at least two labels and an alphabetic TLD (punycode `xn--` labels allowed). */
export const HOSTNAME = /^(?=.{1,253}$)(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
export const isHostname = (value: unknown): value is string => typeof value === 'string' && HOSTNAME.test(value);

/** `Host` header -> bare lowercase hostname: no port, no trailing dot. Empty for a missing header. */
export function normaliseHost(value: string | null | undefined): string {
  const host = (value ?? '').trim().toLowerCase();
  const bare = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.replace(/:\d*$/, '');
  return bare.replace(/\.$/, '');
}

/** The hub's host: HUB_HOST, else the host of PUBLIC_ORIGIN, else appearances.getapeptalk.com. */
export function hubHost(env: Env = process.env): string {
  const explicit = normaliseHost(env.HUB_HOST);
  if (isHostname(explicit) || explicit === 'localhost') return explicit;
  if (env.PUBLIC_ORIGIN && URL.canParse(env.PUBLIC_ORIGIN.trim())) {
    const host = new URL(env.PUBLIC_ORIGIN.trim()).hostname;
    if (isHostname(host)) return host;
  }
  return DEFAULT_HUB_HOST;
}

/**
 * Problems with registry.json → domains, given every slug in `order`. Hostnames are valid lowercase names, each host
 * belongs to one site (primaries and aliases together), no site uses the hub's host, and every slug exists.
 */
export function domainProblems(domains: unknown, slugs: string[], hub: string = DEFAULT_HUB_HOST): string[] {
  if (domains === undefined) return [];
  if (domains === null || typeof domains !== 'object' || Array.isArray(domains))
    return ['registry: domains must be an object of { "<slug>": { primary, aliases, live } }'];
  const problems: string[] = [];
  const owner = new Map<string, string>();
  for (const [slug, entry] of Object.entries(domains as Record<string, unknown>)) {
    const at = `registry: domains.${slug}`;
    if (!slugs.includes(slug)) problems.push(`${at} is not a site in order`);
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${at} must be { primary, aliases, live }`);
      continue;
    }
    const { primary, aliases = [], live, ...rest } = entry as Record<string, unknown>;
    for (const key of Object.keys(rest)) problems.push(`${at}.${key} is not a domain setting (primary, aliases, live)`);
    if (typeof live !== 'boolean') problems.push(`${at}.live must be true or false`);
    if (!Array.isArray(aliases)) problems.push(`${at}.aliases must be a list of hostnames`);
    const hosts = [primary, ...(Array.isArray(aliases) ? aliases : [])];
    for (const [i, host] of hosts.entries()) {
      const field = i === 0 ? `${at}.primary` : `${at}.aliases`;
      if (!isHostname(host)) {
        problems.push(`${field} "${String(host)}" must be a lowercase hostname (no scheme, port, path or trailing dot)`);
        continue;
      }
      if (host === hub) problems.push(`${field} "${host}" is the hub's host`);
      const taken = owner.get(host);
      if (taken !== undefined) problems.push(`${field} "${host}" is already used by ${taken === slug ? 'this site' : `"${taken}"`}`);
      else owner.set(host, slug);
    }
  }
  return problems;
}

/** Domains of the given (published) sites only, so an inactive site's host answers like an unknown host. */
export const domainsFor = (domains: Domains | undefined, slugs: string[]): Domains =>
  Object.fromEntries(Object.entries(domains ?? {}).filter(([slug]) => slugs.includes(slug)));

export interface HostRoute {
  slug: string;
  domain: SiteDomain;
  /** An alias: answer 301 to the primary. */
  alias: boolean;
}

/** The site a host belongs to (primary or alias), or null for the hub and unknown hosts. */
export function routeForHost(host: string, domains: Domains): HostRoute | null {
  for (const [slug, domain] of Object.entries(domains)) {
    if (domain.primary === host) return { slug, domain, alias: false };
    if (domain.aliases.includes(host)) return { slug, domain, alias: true };
  }
  return null;
}

/** Where a site's pages are served from in this copy: the hub folder (`/<slug>`) or its own domain (root). */
export interface Mount {
  slug: string;
  /** The site's domain when this copy is the domain mount. */
  domain: SiteDomain | null;
}

/** A `[site]` route segment -> the site and mount (`spurs` -> folder; `spurs--domain` -> domain), or null. */
export function parseMount(segment: string, domains: Domains): Mount | null {
  if (!segment.endsWith(MOUNT_SUFFIX)) return { slug: segment, domain: null };
  const slug = segment.slice(0, -MOUNT_SUFFIX.length);
  const domain = domains[slug];
  return domain ? { slug, domain } : null;
}

/** Every `[site]` segment to prerender: each slug, plus a domain mount for each site with a domain. */
export const mountSegments = (slugs: string[], domains: Domains): string[] => [
  ...slugs,
  ...slugs.filter(slug => Object.hasOwn(domains, slug)).map(mountSegment),
];

/** The origin of a site's canonical URLs: its domain once live, else the hub. */
export const canonicalOrigin = (domain: SiteDomain | null | undefined, hubOrigin: string): string =>
  domain?.live ? `https://${domain.primary}` : hubOrigin;

/**
 * The canonical absolute URL of a page of a site, from its site-relative path (`''` for home, `/legends`): on the
 * domain once live (`https://spurslegends.com/legends`), else the hub folder (`https://<hub>/spurs/legends`).
 */
export function canonicalUrl(slug: string, sub: string, domain: SiteDomain | null | undefined, hubOrigin: string): string {
  const path = domain?.live ? sub || '/' : `/${slug}${sub}`;
  return new URL(path, `${canonicalOrigin(domain, hubOrigin)}/`).toString();
}
