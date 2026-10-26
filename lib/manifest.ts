// Build-time routing manifest: the few content facts the proxy and metadata need on every request, computed once in
// next.config.ts from the content provider and inlined as APPEARANCES_MANIFEST. Revalidation (POST /api/revalidate)
// refreshes the content of existing pages; anything recorded here (a new site or person, a new image host) needs a
// deploy, so hosts that may appear later go in IMAGE_HOSTS_EXTRA up front (docs/content-contract.md → Image ids and hosts).
import { readdirSync } from 'node:fs';
import { parseOrigins } from './content/image-ids.ts';
import type { ContentProvider } from './content/provider.ts';
import { imageHosts } from './content/publish.ts';
import { type Domains, domainsFor, hubHost } from './domains.ts';
import { galleryPaths } from './gallery.ts';
import { allPaths, landingPath } from './render/routes.ts';
import { indexableSlugs, isHubIndexable } from './seo/indexing.ts';
import { envGtmId, siteTracking } from './tracking.ts';

type Env = Record<string, string | undefined>;

export interface Manifest {
  /** registry.json → rootSite: where `/` on the hub redirects; null when `/` serves the landing page (lib/render/routes.ts → landingPath). */
  rootSite: string | null;
  redirects: Record<string, string>;
  /** Published site slugs. */
  slugs: string[];
  /** img-src hosts: Getty, every published site's mark hosts, and IMAGE_HOSTS_EXTRA. */
  imageHosts: string[];
  /**
   * Origins allowed in images.remotePatterns for the optimizer: every published content image's origin (images.json,
   * or the people provider's images) plus IMAGE_HOSTS_EXTRA.
   */
  photoOrigins: string[];
  /** Open Graph card names present in public/og (without .jpg). */
  ogCards: string[];
  /**
   * Every page path that exists: the public pages (lib/render/routes.ts) and the component gallery (lib/gallery.ts). The
   * proxy sends any other page-shaped path to the 404 page.
   */
  pages: string[];
  /** Slugs of indexable (launched) sites, after the deployment guards in lib/seo/indexing.ts. */
  indexable: string[];
  /** The hub pages may be indexed. */
  hubIndexable: boolean;
  /** registry.json → domains, for published sites only (lib/domains.ts). */
  domains: Domains;
  /** The hub's host (HUB_HOST, else PUBLIC_ORIGIN's host, else appearances.getapeptalk.com). */
  hubHost: string;
  /** Slugs of sites that load tags (site.json → tracking, or the TRACKING_GTM_ID fallback): their CSP allows Google's hosts. */
  tracking: string[];
}

/**
 * IMAGE_HOSTS_EXTRA: comma-separated https origins for images that may appear after the build (the R2 bucket's public
 * URL or custom domain), allowed by next/image and the CSP. Throws on anything that isn't an https origin.
 */
export const extraImageHosts = (env: Env = process.env): string[] => parseOrigins(env.IMAGE_HOSTS_EXTRA, 'IMAGE_HOSTS_EXTRA');

export async function buildManifest(provider: ContentProvider, ogDir: string, env: Env = process.env): Promise<Manifest> {
  const [registry, sites] = await Promise.all([provider.getRegistry(), provider.listSites()]);
  const fallbackGtmId = envGtmId(env);
  const extra = extraImageHosts(env);
  const photoOrigins = new Set([
    ...sites.flatMap(site =>
      Object.values(site.images)
        .filter(url => URL.canParse(url))
        .map(url => new URL(url).origin),
    ),
    ...extra,
  ]);
  return {
    rootSite: registry.rootSite ?? null,
    redirects: registry.redirects ?? {},
    slugs: sites.map(site => site.slug),
    imageHosts: [...new Set([...imageHosts(sites), ...extra])],
    photoOrigins: [...photoOrigins].sort(),
    ogCards: readdirSync(ogDir)
      .filter(name => /^[a-z0-9-]+\.jpg$/.test(name))
      .map(name => name.slice(0, -'.jpg'.length))
      .sort(),
    pages: [...allPaths(sites, landingPath(registry.rootSite)), ...galleryPaths(sites)],
    indexable: indexableSlugs(sites, env),
    hubIndexable: isHubIndexable(registry, env),
    domains: domainsFor(
      registry.domains,
      sites.map(site => site.slug),
    ),
    hubHost: hubHost(env),
    tracking: sites.filter(site => siteTracking(site, fallbackGtmId)).map(site => site.slug),
  };
}

/** The manifest inlined at build time. */
export function manifest(): Manifest {
  const raw = process.env.APPEARANCES_MANIFEST;
  if (!raw) throw new Error('APPEARANCES_MANIFEST is missing: it is set by next.config.ts at build time');
  return JSON.parse(raw) as Manifest;
}

/** The inlined manifest's domains, or none when there is no manifest (unit tests, scripts). */
export function manifestDomains(): Domains {
  const raw = process.env.APPEARANCES_MANIFEST;
  if (!raw) return {};
  return (JSON.parse(raw) as Partial<Manifest>).domains ?? {};
}

/** `/og/<name>.jpg` when the card exists, else the generic PepTalk card. */
export const ogCard = (name: string, cards: string[] = manifest().ogCards): string =>
  cards.includes(name) ? `/og/${name}.jpg` : '/og/appearances.jpg';
