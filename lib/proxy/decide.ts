// The proxy's decision for one request, as a pure function of (method, url, host, headers, config) so it is
// unit-testable without Next.js. proxy.ts turns the decision into a NextResponse. In order:
// method check, fail-closed production check, the revalidation webhook (POST /api/revalidate, on any host, outside the
// gate), alias hosts (301 to the primary), /health, then by host:
// - a site's own domain (registry.json → domains): that site only, its pages at the root, rewritten to the site's
//   domain mount (`/<slug>--domain/…`, prerendered with links that have no slug prefix); shared assets as they are;
//   `/all`, other sites and anything else 404; the gate opens with the master or that site's password
// - the hub (HUB_HOST) and any other host (Vercel deployment and preview URLs, localhost): `/` is the PepTalk landing
//   page and `/all` answers 301 to it, unless registry.json → rootSite makes `/` redirect to that site (the landing page
//   then stays at `/all`); renamed slugs and cards, the gate; the landing page opens with the master password only, and a
//   site password sends its holder to their own site; on the hub host itself a live site's folder answers 301 to its
//   domain; the component gallery (`/_gallery`, lib/gallery.ts) needs the master password, and is a 404 without one in
//   production
// Then the response headers: security headers and CSP, X-Robots-Tag unless the path may be indexed, and Cache-Control.
// Only the proxy reads Host, and only to route: pages are prerendered and never see the request (docs/domains.md).
import { MOUNT_SUFFIX, mountSegment, normaliseHost, routeForHost, type SiteDomain } from '../domains.ts';
import { ENQUIRY_PATH, SITE_HEADER } from '../enquiry/fields.ts';
import { GALLERY_ROUTE_SEGMENT, galleryRoute, isGalleryPath } from '../gallery.ts';
import type { Manifest } from '../manifest.ts';
import { LANDING_FOLDER, LANDING_HOME, landingPath } from '../render/routes.ts';
import { REVALIDATE_PATH } from '../revalidate/handler.ts';
import { buildCsp } from './csp.ts';
import { gateConfigured, hasAccess, hasMasterAccess, hasSiteAccess, type Passwords, sitePasswordOwner } from './gate.ts';

/** The CMS's paths (lib/cms/): the admin app, its media and the Airtable cron endpoint. */
export const CMS_MEDIA_PREFIX = '/api/media/';
export const isCmsPath = (pathname: string): boolean =>
  pathname === '/admin' ||
  pathname.startsWith('/admin/') ||
  pathname.startsWith(CMS_MEDIA_PREFIX) ||
  pathname === '/api/cron/sync-airtable';

export interface ProxyConfig {
  manifest: Pick<
    Manifest,
    'rootSite' | 'redirects' | 'slugs' | 'imageHosts' | 'pages' | 'indexable' | 'hubIndexable' | 'domains' | 'hubHost' | 'tracking'
  >;
  passwords: Passwords;
  /** NODE_ENV === 'production' (true on every Vercel deployment, previews included). */
  production: boolean;
  /** PREVIEW_PUBLIC=true: run without a master password in production. */
  previewPublic: boolean;
  dev: boolean;
}

export type Decision =
  | { action: 'respond'; status: number; headers: Record<string, string>; body?: string }
  | {
      action: 'next';
      headers: Record<string, string>;
      rewrite?: string;
      /** Request headers for the route handler (the enquiry endpoint): set, or removed when empty. Never from the client. */
      requestHeaders?: Record<string, string>;
    };

/** Headers on every response (next.config.ts also sets them on /_next/static, which the proxy skips). */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  // Cross-site requests carry only the origin (never paths or query strings), so getapeptalk.com sees referrals.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
};

export const NOINDEX = 'noindex, nofollow';

/**
 * A URL that matches no app route (four segments; the deepest page has three). Unknown page paths are rewritten here so
 * Next.js serves app/global-not-found.tsx, server-rendered with a 404. (In Next.js 16.4, notFound() thrown while a page
 * renders on request answers 404 but leaves the HTML body to the client, which no-JS clients and crawlers would see as
 * an empty page.) The routes still call notFound() as a second line of defence.
 */
export const NOT_FOUND_REWRITE = '/_appearances/not/found/page';

/** Paths shaped like app pages (no file extension), which must be either a known page or a server-rendered 404. */
const PAGE_SHAPED = /^\/(?!_next\/)[^./]+(?:\/[^./]+)*$/;

export const isOgCard = (pathname: string): boolean => /^\/og\/[a-z0-9-]+\.jpg$/.test(pathname);

/** Files every indexable page needs a crawler (or a visitor without a password) to fetch. */
const RENDER_ASSET =
  /^\/(?:styles\.css|tracking\.js|robots\.txt|sitemap\.xml|llms\.txt|_next\/image|fonts\/[a-z0-9-]+\.woff2|peptalk\/[a-z0-9-]+\.png)$/;

/**
 * Paths that are public because their site (or the hub) is indexable, i.e. launched: no password, no noindex header.
 * Everything a launched site renders with (shared CSS, fonts, optimised images, robots, sitemaps) is public too, once
 * anything is launched. A site that isn't indexable stays behind the gate, so one partner's launch never exposes another.
 */
export function publicPath(pathname: string, manifest: ProxyConfig['manifest']): boolean {
  const segment = pathname.split('/')[1] ?? '';
  if (manifest.indexable.includes(segment)) return true;
  // Both landing URLs (lib/render/routes.ts → landingPath): whichever one isn't in use redirects before the gate.
  if (
    manifest.hubIndexable &&
    ([LANDING_HOME, LANDING_FOLDER, '/terms', '/privacy', '/accessibility', '/landing.css'].includes(pathname) ||
      pathname.startsWith('/all/'))
  )
    return true;
  return (manifest.indexable.length > 0 || manifest.hubIndexable) && RENDER_ASSET.test(pathname);
}

/** Which slug a card name (`spurs`, `spurs-legends`) belongs to. Longest matching prefix wins (`man-utd` over `man`). */
export function cardOwner(name: string, candidates: string[]): string | undefined {
  const owns = (slug: string) => name === slug || name.startsWith(`${slug}-`);
  return candidates.filter(owns).sort((a, b) => b.length - a.length)[0];
}

/** Old Open Graph card URL (`/og/<old>.jpg`, `/og/<old>-<page>.jpg`) -> new card URL, or null. */
export function renamedCard(pathname: string, redirects: Record<string, string>, liveSlugs: string[]): string | null {
  if (!isOgCard(pathname)) return null;
  const name = pathname.slice('/og/'.length, -'.jpg'.length);
  const owner = cardOwner(name, [...Object.keys(redirects), ...liveSlugs]);
  if (!owner || !Object.hasOwn(redirects, owner)) return null;
  return `/og/${redirects[owner]}${name.slice(owner.length)}.jpg`;
}

/** Paths a site's own domain serves as they are: shared, partner-neutral assets (never another site's files). */
const DOMAIN_SHARED = /^\/(?:styles\.css|tracking\.js|_next\/image|fonts\/[a-z0-9-]+\.woff2|peptalk\/[a-z0-9-]+\.png)$/;

/** On a site's domain: the site's own cards and the generic PepTalk card, never another site's. */
export function ownCard(pathname: string, slug: string, slugs: string[]): boolean {
  if (!isOgCard(pathname)) return false;
  const name = pathname.slice('/og/'.length, -'.jpg'.length);
  return name === 'appearances' || cardOwner(name, slugs) === slug;
}

/**
 * Cache-Control for what the proxy lets through. Responses that needed a password are `private`, so no shared cache
 * can hand them to someone without one. The shared stylesheet and the tracking script are requested with a content hash
 * (`?v=`) and fonts never change under the same name, so all three are immutable; the generated theme stylesheets are
 * not (below); pages revalidate on every visit (Vercel's CDN serves the prerendered HTML, invalidated on deploy or
 * revalidation). Anything else keeps the header Next.js sets.
 */
export function cacheControl(pathname: string, search: string, gated: boolean): string | null {
  const scope = gated ? 'private' : 'public';
  const versioned = new URLSearchParams(search).has('v');
  if ((pathname === '/styles.css' || pathname === '/tracking.js') && versioned) return `${scope}, max-age=31536000, immutable`;
  // The theme stylesheets are generated from content, which revalidation can change: after a revalidation the page may
  // regenerate (and name the new hash) before the stylesheet route does, so an immutable copy could pin the old CSS
  // under the new hash. They are small; browsers revalidate them with the ETag on each visit.
  if (pathname === '/landing.css' || /^\/[a-z0-9-]+\/site\.css$/.test(pathname)) return `${scope}, no-cache`;
  if (/^\/fonts\/[a-z0-9-]+\.woff2$/.test(pathname)) return `${scope}, max-age=31536000, immutable`;
  if (isOgCard(pathname) || /^\/peptalk\//.test(pathname)) return `${scope}, max-age=86400, stale-while-revalidate=604800`;
  if (
    /^\/(?:robots\.txt|sitemap\.xml|llms\.txt)$/.test(pathname) ||
    /^\/[a-z0-9-]+\/(?:robots\.txt|sitemap\.xml|llms\.txt)$/.test(pathname)
  )
    return `${scope}, max-age=3600`;
  if (pathname.endsWith('.css')) return `${scope}, no-cache`;
  if (pathname === '/' || PAGE_SHAPED.test(pathname)) return gated ? 'private, no-cache' : 'public, max-age=0, must-revalidate';
  return null;
}

export async function decide(
  request: { method: string; url: string; authorization: string | null; host?: string | null },
  config: ProxyConfig,
): Promise<Decision> {
  const url = new URL(request.url);
  const { pathname, search } = url;
  const { rootSite, redirects, slugs, domains } = config.manifest;
  const host = normaliseHost(request.host ?? url.host);
  const route = routeForHost(host, domains);
  const segment = pathname.split('/')[1] ?? '';
  const owner = route ? route.slug : slugs.includes(segment) ? segment : null;
  const csp = buildCsp({
    imageHosts: config.manifest.imageHosts,
    dev: config.dev,
    tracking: owner !== null && config.manifest.tracking.includes(owner),
  });
  const base = { ...SECURITY_HEADERS, 'Content-Security-Policy': csp, 'X-Robots-Tag': NOINDEX };
  const respond = (status: number, headers: Record<string, string> = {}, body?: string): Decision => ({
    action: 'respond',
    status,
    headers: { ...base, ...headers },
    body,
  });
  const text = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };
  const unauthorized = () =>
    respond(
      401,
      { ...text, 'WWW-Authenticate': 'Basic realm="PepTalk Appearances preview", charset="UTF-8"' },
      'Preview access requires a password.',
    );
  const redirect = (status: 301 | 302, location: string) =>
    respond(status, { Location: location, 'Cache-Control': status === 301 ? 'public, max-age=3600' : 'no-store' });

  // The CMS (/admin, lib/cms/web.ts) has its own sign-in, so it is outside the preview gate on every host: never cached,
  // never indexed, GET and POST only. Its uploads (/api/media/<id>) are public like any site photo, and the Airtable
  // cron endpoint authenticates with CRON_SECRET.
  if (isCmsPath(pathname)) {
    if (!['GET', 'HEAD', 'POST'].includes(request.method)) return respond(405, { Allow: 'GET, HEAD, POST' });
    if (pathname.startsWith(CMS_MEDIA_PREFIX)) return { action: 'next', headers: { ...SECURITY_HEADERS, 'Content-Security-Policy': csp } };
    const cmsCsp = buildCsp({ imageHosts: config.manifest.imageHosts, dev: config.dev, cms: true });
    return { action: 'next', headers: { ...base, 'Content-Security-Policy': cmsCsp, 'Cache-Control': 'no-store' } };
  }
  // The two POST routes: the enquiry endpoint (behind the gate, below) and the revalidation webhook, which
  // authenticates with REVALIDATE_SECRET instead of the preview password.
  const enquiry = pathname === ENQUIRY_PATH;
  const revalidate = pathname === REVALIDATE_PATH;
  const post = enquiry || revalidate;
  if (post ? request.method !== 'POST' : !['GET', 'HEAD'].includes(request.method))
    return respond(405, { Allow: post ? 'POST' : 'GET, HEAD' });
  // Fail closed: production needs the master password unless publishing is a deliberate choice.
  if (config.production && !config.passwords.master && !config.previewPublic) {
    return pathname === '/health'
      ? respond(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, JSON.stringify({ status: 'misconfigured' }))
      : respond(503, text, 'Preview misconfigured: set PREVIEW_PASSWORD, or PREVIEW_PUBLIC=true to publish deliberately.');
  }
  // The webhook is host-independent: it answers on the hub, preview URLs and every site domain (aliases included, since a
  // 301 would turn the POST into a GET), outside the gate, never cached. It names cache tags, never returns content.
  if (revalidate) return { action: 'next', headers: { ...base, 'Cache-Control': 'no-store' } };
  if (route?.alias) return redirect(301, `https://${route.domain.primary}${pathname}${search}`);
  if (pathname === '/health') return { action: 'next', headers: base };
  if (route) return siteHost(route.slug, route.domain.live);

  // ---- The hub, and any host that is not a site's domain ----
  // Only on the hub host: Vercel preview and deployment URLs keep serving the folders, so a live site can still be
  // reviewed before a deploy is promoted.
  const live = (slug: string): SiteDomain | null => (host === config.manifest.hubHost && domains[slug]?.live ? domains[slug] : null);
  const toDomain = (domain: SiteDomain, rest: string) => `https://${domain.primary}${rest || '/'}${search}`;
  /** A site's home: its domain once live (on the hub host), else its folder; the query string is kept. */
  const siteHome = (slug: string) => {
    const domain = live(slug);
    return domain ? toDomain(domain, '') : `/${slug}${search}`;
  };
  // The landing page lives at `/`, unless a root site takes `/` (then at `/all`). The other URL redirects.
  const landing = landingPath(rootSite);
  if (rootSite && pathname === '/') return redirect(302, siteHome(rootSite));
  if (!rootSite && (pathname === LANDING_FOLDER || pathname === `${LANDING_FOLDER}/`)) return redirect(301, `/${search}`);
  const card = renamedCard(pathname, redirects, slugs);
  if (card) return redirect(301, card);
  const rest = pathname.slice(segment.length + 1);
  if (Object.hasOwn(redirects, segment)) {
    const target = redirects[segment];
    const domain = live(target);
    return redirect(301, domain ? toDomain(domain, rest) : `/${target}${rest}${search}`);
  }
  // One canonical URL per page: once a site's domain is live, its hub folder moves there (path and query kept).
  const folderDomain = slugs.includes(segment) ? live(segment) : null;
  if (folderDomain) return redirect(301, toDomain(folderDomain, rest));
  // The component gallery (lib/gallery.ts) is a developer tool: only the master password opens it, and with no master
  // password in production (PREVIEW_PUBLIC=true) it doesn't exist, so turning the gate off never publishes it. Never
  // public, never indexed, never in a shared cache; served from its internal route.
  if (isGalleryPath(pathname)) {
    const notFound: Decision = { action: 'next', headers: { ...base, 'Cache-Control': 'no-cache' }, rewrite: NOT_FOUND_REWRITE };
    if (config.production && !config.passwords.master) return notFound;
    if (gateConfigured(config.passwords) && !(await hasMasterAccess(request.authorization, config.passwords))) return unauthorized();
    const clean = pathname.replace(/\/+$/, '');
    if (!config.manifest.pages.includes(clean)) return notFound;
    return { action: 'next', headers: { ...base, 'Cache-Control': 'private, no-cache' }, rewrite: galleryRoute(clean) };
  }
  // Open Graph cards stay public so link previews work for public sites; launched (indexable) sites are public;
  // everything else passes the gate.
  const open = publicPath(pathname, config.manifest) || (enquiry && config.manifest.indexable.length > 0);
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  // The landing page names every partner, so only the master password opens it. A site password can't, but it tells
  // us whose site the visitor came for: send them there rather than prompting again. (With no Authorization header
  // there is nothing to tell from, so the visitor gets the usual 401 prompt; the browser retries with what they type.)
  if (clean === landing && !open && gateConfigured(config.passwords) && !(await hasMasterAccess(request.authorization, config.passwords))) {
    const own = await sitePasswordOwner(request.authorization, config.passwords, slugs);
    return own ? redirect(302, siteHome(own)) : unauthorized();
  }
  if (!isOgCard(pathname) && !open && !(await hasAccess(request.authorization, pathname, config.passwords))) return unauthorized();
  // The enquiry handler checks access again for the site named in the form; a client can't claim a domain.
  if (enquiry) return { action: 'next', headers: base, requestHeaders: { [SITE_HEADER]: '' } };
  // Domain mounts exist only behind their own host, and the gallery's internal route only behind `/_gallery`.
  const unknownPage =
    segment.endsWith(MOUNT_SUFFIX) ||
    segment === GALLERY_ROUTE_SEGMENT ||
    (PAGE_SHAPED.test(clean) && !config.manifest.pages.includes(clean));
  const headers: Record<string, string> = { ...SECURITY_HEADERS, 'Content-Security-Policy': csp };
  if (!open || unknownPage) headers['X-Robots-Tag'] = NOINDEX;
  const cache = unknownPage ? 'no-cache' : cacheControl(clean, search, gateConfigured(config.passwords) && !open && !isOgCard(pathname));
  if (cache) headers['Cache-Control'] = cache;
  if (unknownPage) return { action: 'next', headers, rewrite: NOT_FOUND_REWRITE };
  // The landing route is app/(landing) at `/`; with a root site taking `/`, its URL `/all` is served from there.
  return { action: 'next', headers, ...(clean === LANDING_FOLDER && landing === LANDING_FOLDER && { rewrite: LANDING_HOME }) };

  /** A site's own domain: that site's pages at the root, its own cards and shared assets, nothing else. */
  async function siteHost(slug: string, domainLive: boolean): Promise<Decision> {
    const open = config.manifest.indexable.includes(slug);
    const shared = DOMAIN_SHARED.test(pathname) || ownCard(pathname, slug, slugs);
    const ownCardPath = shared && isOgCard(pathname);
    if (!ownCardPath && !open && !(await hasSiteAccess(request.authorization, slug, config.passwords))) return unauthorized();
    if (enquiry) return { action: 'next', headers: base, requestHeaders: { [SITE_HEADER]: slug } };
    const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const sub = clean === '/' ? '' : clean;
    // The same page's hub-folder path: the manifest lists pages that way, and the cache rules are written for it.
    const equivalent = `/${slug}${sub}`;
    const unknownPage = !shared && PAGE_SHAPED.test(equivalent) && !config.manifest.pages.includes(equivalent);
    const headers: Record<string, string> = { ...SECURITY_HEADERS, 'Content-Security-Policy': csp };
    // Indexable only on the canonical host: before the domain is live, the hub folder is canonical.
    if (!open || !domainLive || unknownPage) headers['X-Robots-Tag'] = NOINDEX;
    const cache = unknownPage
      ? 'no-cache'
      : cacheControl(shared ? clean : equivalent, search, gateConfigured(config.passwords) && !open && !ownCardPath);
    if (cache) headers['Cache-Control'] = cache;
    if (unknownPage) return { action: 'next', headers, rewrite: NOT_FOUND_REWRITE };
    return { action: 'next', headers, ...(!shared && { rewrite: `/${mountSegment(slug)}${sub}` }) };
  }
}
