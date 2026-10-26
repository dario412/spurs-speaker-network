// In-memory preview of the stored content under /preview/…, rendered with the Next.js app's own components
// (next-render/), so it shows what `next build` will produce, before anything is saved or built.
//
// Pages are written for the site root (`/spurs/legends`, `/styles.css`). Rather than run a second server, root-relative
// URLs in attributes and CSS are prefixed with /preview (or a pending site pack's prefix). Every app URL is an
// attribute (href/src/action) or a CSS url(), so the rewrite is small and complete; a test asserts no unprefixed
// root-relative link survives.
import { readFile } from 'node:fs/promises';
import { isActive } from '../sites/index.mjs';
import { isKey } from './content.mjs';
import { landingCss, published, renderPage, siteCss } from './next-render/index.mjs';

export const PREFIX = '/preview';
const PUBLIC = new URL('../../public/', import.meta.url);
const STATIC = /^\/(styles\.css|fonts\/[a-z0-9-]+\.woff2|peptalk\/[a-z0-9-]+\.png|og\/[a-z0-9-]+\.jpg)$/;
const HUB_LEGAL = new Set(['terms', 'privacy']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const typeOf = path => TYPES[path.match(/\.[a-z0-9]+$/)?.[0]] ?? 'application/octet-stream';

export const rewriteHtml = (html, prefix = PREFIX) => html.replace(/(\s(?:href|src|action)=")\/(?!\/)/g, `$1${prefix}/`);
export const rewriteCss = (css, prefix = PREFIX) => css.replace(/url\((['"]?)\/(?!\/)/g, `url($1${prefix}/`);

export function previewCsp(imageHosts) {
  return `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' ${imageHosts.join(' ')}; font-src 'self'; connect-src 'self'; form-action 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`;
}

/** Published sites as the app sees them. */
const publishedSites = snap => Promise.all(snap.sites.filter(site => !site.broken && isActive(site)).map(published));

/**
 * @param {string} path the request path after the prefix (e.g. "/spurs/legends")
 * @param {{ registry: object, sites: object[], find: (slug: string) => object|null }} snap current stored content
 * @param {string} [prefix] the URL prefix the preview is mounted at (/preview, or a pending site pack's preview)
 * @returns {Promise<{ status: number, type?: string, body?: string|Buffer, redirect?: string }>}
 */
export async function renderPreview(path, snap, prefix = PREFIX) {
  // `/` is the landing page unless a root site takes it (then the landing page is at /all), as in the app.
  const root = snap.registry.rootSite;
  if (path === '' || path === '/') {
    if (root) return { status: 302, redirect: `${prefix}/${root}` };
    return page(
      await renderPage('/', await publishedSites(snap), { hubIndexable: snap.registry.indexable === true, landing: '/' }),
      prefix,
    );
  }
  if (!root && (path === '/all' || path === '/all/')) return { status: 302, redirect: `${prefix}/` };
  if (STATIC.test(path)) {
    try {
      const data = await readFile(new URL(path.slice(1), PUBLIC));
      return { status: 200, type: typeOf(path), body: path === '/styles.css' ? rewriteCss(data.toString('utf8'), prefix) : data };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { status: 404, type: 'text/plain; charset=utf-8', body: 'Not found' };
    }
  }
  const hubIndexable = snap.registry.indexable === true;
  if (path === '/landing.css')
    return { status: 200, type: typeOf(path), body: rewriteCss(await landingCss(await publishedSites(snap)), prefix) };

  // Same shape rule as the app's routes: lowercase slug segments only, so nothing else can be addressed.
  const segments = path.replace(/\/+$/, '').split('/').slice(1);
  const css = segments.length === 2 && segments[1] === 'site.css';
  if (segments.length > 3 || !isKey(segments[0]) || !(css || segments.every(isKey))) return page(await renderPage('/404', []), prefix);
  const [slug] = segments;
  if (segments.length === 1 && (slug === 'all' || HUB_LEGAL.has(slug)))
    return page(await renderPage(`/${slug}`, await publishedSites(snap), { hubIndexable, landing: root ? '/all' : '/' }), prefix);

  // Inactive sites render too: preview shows what the site would look like once activated. Hidden people are still
  // left out, exactly as the app does.
  const stored = snap.find(slug);
  if (!stored) return page(await renderPage('/404', []), prefix);
  const site = await published(stored);
  if (css) return { status: 200, type: typeOf(path), body: rewriteCss(await siteCss(site), prefix) };
  return page(await renderPage(`/${segments.join('/')}`, [site], { hubIndexable }), prefix);
}

const page = ({ status, html }, prefix) => ({ status, type: TYPES['.html'], body: rewriteHtml(html, prefix) });
