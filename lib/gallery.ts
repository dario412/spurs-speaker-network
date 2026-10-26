// The component gallery: `/_gallery` (the site switcher) and `/_gallery/<slug>` (every shared component in components/site/,
// in that site's branding), for developers working on the components (docs/onboarding.md → Component gallery). Pure
// helpers shared by the build manifest, the proxy and the routes. The gallery is prerendered like every page but never
// public:
// - master password only (lib/proxy/decide.ts): a per-site password never opens it, a launched site doesn't make it
//   public, and with no master password in production (PREVIEW_PUBLIC=true) it answers 404
// - on the hub and preview hosts only: a site's own domain answers 404
// - always `noindex` (robots meta and X-Robots-Tag), with no canonical URL
// - left out of sitemaps, llms.txt and the integration suite's page and link checks, which read
//   lib/render/routes.ts → allPaths(), never these paths
// - no tracking: its root layouts never render the tracking slot
//
// Routing: the pages live in app/gallery--internal/ and the proxy rewrites the public paths there, as it does for domain
// mounts; the internal path itself is a 404 (slugs can't contain `--`, so it never collides with a site). A folder
// named `%5Fgallery` (Next.js's escape for a URL segment starting with `_`) would avoid the rewrite, but Next.js 16.4
// doesn't prerender a dynamic segment below it: generateStaticParams runs, then the paths are dropped.
import type { Site } from './content/types.ts';

export const GALLERY_PATH = '/_gallery';

/** The internal route segment the proxy rewrites gallery paths to (app/gallery--internal/). */
export const GALLERY_ROUTE_SEGMENT = 'gallery--internal';

/** `/_gallery/<slug>`: one site's gallery. */
export const siteGalleryPath = (slug: string): string => `${GALLERY_PATH}/${slug}`;

/** `/_gallery` plus `/_gallery/<slug>` for every published site. */
export const galleryPaths = (sites: Pick<Site, 'slug'>[]): string[] => [GALLERY_PATH, ...sites.map(site => siteGalleryPath(site.slug))];

/** A gallery path (trailing slashes ignored): `/_gallery` or `/_gallery/<slug>`. */
export const isGalleryPath = (pathname: string): boolean => /^\/_gallery(?:\/[a-z0-9-]+)?\/*$/.test(pathname);

/** `/_gallery…` -> the internal route the proxy rewrites it to (`/gallery--internal…`). */
export const galleryRoute = (pathname: string): string =>
  `/${GALLERY_ROUTE_SEGMENT}${pathname.replace(/\/+$/, '').slice(GALLERY_PATH.length)}`;
