// Asset URLs and hints for the document <head>: versioned stylesheet URLs (a content hash in `?v=`, so they can be
// cached for a year and still change on deploy), the font files each page renders above the fold (preloaded), and
// the partner mark hosts (preconnected). Pages are prerendered, so this runs at build time.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Site } from '../content/types.ts';
import { landingStylesheet, siteStylesheet } from './theme.ts';

const hash = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 12);

const hashes = new Map<string, string>();
/** `/<file>?v=<hash>` for a file in public/ (re-read on every call in `next dev`, so edits show without a restart). */
function publicHref(file: string): string {
  const read = () => hash(readFileSync(join(/*turbopackIgnore: true*/ process.cwd(), 'public', file), 'utf8'));
  if (process.env.NODE_ENV === 'development') return `/${file}?v=${read()}`;
  if (!hashes.has(file)) hashes.set(file, read());
  return `/${file}?v=${hashes.get(file)}`;
}

/** /styles.css?v=<hash> */
export const stylesHref = (): string => publicHref('styles.css');

/** /gallery.css?v=<hash>: the component gallery's own styles (lib/gallery.ts), loaded only by its pages. */
export const galleryStylesHref = (): string => publicHref('gallery.css');

/** /tracking.js?v=<hash>: the tracking slot's loader, only on pages of a site with tags (components/document.tsx). */
export const trackingScriptHref = (): string => publicHref('tracking.js');

/** `<base>/site.css?v=<hash>`: `/<slug>/site.css` in the hub folder, `/site.css` on the site's own domain. */
export const siteStylesheetHref = (site: Site, base = `/${site.slug}`): string => `${base}/site.css?v=${hash(siteStylesheet(site))}`;
export const landingStylesheetHref = (sites: Site[]): string => `/landing.css?v=${hash(landingStylesheet(sites))}`;

/** Font files in public/fonts that render above the fold: the body face, plus the display face the theme names. */
export function siteFonts(site: Pick<Site, 'theme'>): string[] {
  return ['/fonts/outfit-latin.woff2', ...(/Barlow Condensed/.test(site.theme.display) ? ['/fonts/barlow-condensed-800.woff2'] : [])];
}

/** The PepTalk landing, hub legal and 404 pages (body.landing): Sofia for text, Recoleta for headings. */
const SOFIA_MEDIUM = '/fonts/sofia-pro-500.woff2';
export const LANDING_FONTS = [SOFIA_MEDIUM, '/fonts/recoleta-alt-400.woff2'];

/** The redesigned hub uses the parent brand’s Medium display weight. */
export const HUB_LANDING_FONTS = [SOFIA_MEDIUM, '/fonts/recoleta-alt-500.woff2'];

/** Origins of the marks shown in the header and utility bar (hotlinked partner files), for preconnect hints. */
export function markOrigins(site: Pick<Site, 'marks' | 'navMark'>): string[] {
  const urls = [site.navMark === 'wordmark' ? site.marks.wordmark : null, site.marks.crest];
  return [...new Set(urls.filter((url): url is string => Boolean(url && URL.canParse(url))).map(url => new URL(url).origin))];
}
