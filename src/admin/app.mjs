// The admin HTTP app: host/auth/same-origin/CSRF gates, routing, POST/redirect/GET with flash messages, preview.
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { SITES_DIR } from '../sites/index.mjs';
import { PUBLIC_DIR } from '../sites/store.mjs';
import { createContent, isKey } from './content.mjs';
import { saveLicences, showLicences } from './handlers/licences.mjs';
import { discardPack, downloadPack, entryOr404, importPack, showPack, uploadPack } from './handlers/packs.mjs';
import {
  confirmDeletePerson,
  createPerson,
  editPerson,
  listPeople,
  removePerson,
  savePerson,
  setPersonActive,
} from './handlers/people.mjs';
import { saveRaw, saveRegistryRaw, showRaw, showRegistry } from './handlers/raw.mjs';
import { createSite, editSite, makeLandingRoot, makeRoot, move, saveSiteSettings, setActive, showDashboard } from './handlers/sites.mjs';
import { saveChecklist, showChecklist, showVerification } from './handlers/verification.mjs';
import {
  authorised,
  baseHeaders,
  cspFor,
  HttpError,
  hostAllowed,
  log,
  readForm,
  readMultipart,
  same,
  sameOrigin,
  serial,
} from './http.mjs';
import { pendingPacks } from './pending.mjs';
import { PREFIX, previewCsp, renderPreview } from './preview.mjs';
import { fsStorage } from './storage/fs.mjs';
import { errorPage, layout } from './views/layout.mjs';

const ROUTES = [
  ['POST', '/packs', uploadPack],
  ['GET', '/packs/:id', showPack],
  ['POST', '/packs/:id/import', importPack],
  ['POST', '/packs/:id/discard', discardPack],
  ['GET', '/sites/:slug/pack', downloadPack],
  ['GET', '/', showDashboard],
  ['POST', '/sites', createSite],
  ['GET', '/registry', showRegistry],
  ['POST', '/registry', saveRegistryRaw],
  ['GET', '/sites/:slug', editSite],
  ['POST', '/sites/:slug', saveSiteSettings],
  ['POST', '/sites/:slug/active', setActive],
  ['POST', '/sites/:slug/root', makeRoot],
  ['POST', '/root/landing', makeLandingRoot],
  ['POST', '/sites/:slug/move', move],
  ['GET', '/sites/:slug/licences', showLicences],
  ['POST', '/sites/:slug/licences', saveLicences],
  ['GET', '/sites/:slug/verification', showVerification],
  ['GET', '/sites/:slug/verification/:group/:key', showChecklist],
  ['POST', '/sites/:slug/verification/:group/:key', saveChecklist],
  ['GET', '/sites/:slug/raw/:file', showRaw],
  ['POST', '/sites/:slug/raw/:file', saveRaw],
  ['GET', '/sites/:slug/people', listPeople],
  ['POST', '/sites/:slug/people', createPerson],
  ['GET', '/sites/:slug/people/:key', editPerson],
  ['POST', '/sites/:slug/people/:key', savePerson],
  ['POST', '/sites/:slug/people/:key/active', setPersonActive],
  ['GET', '/sites/:slug/people/:key/delete', confirmDeletePerson],
  ['POST', '/sites/:slug/people/:key/delete', removePerson],
].map(([method, pattern, handler]) => [method, new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler]);

const ASSETS = {
  '/assets/admin.css': [new URL('./public/admin.css', import.meta.url), 'text/css; charset=utf-8'],
  '/assets/admin.js': [new URL('./public/admin.js', import.meta.url), 'text/javascript; charset=utf-8'],
  '/assets/favicon.png': [new URL('../../public/peptalk/favicon.png', import.meta.url), 'image/png'],
};

/** Finds the route; every URL parameter must be a plain slug, so `..`, `%2f` and friends never reach a handler. */
function match(method, pathname) {
  let allowed = false;
  for (const [routeMethod, pattern, handler] of ROUTES) {
    const found = pattern.exec(pathname);
    if (!found) continue;
    const params = { ...found.groups };
    if (!Object.values(params).every(isKey)) throw new HttpError(404, 'Not found.');
    if (routeMethod === (method === 'HEAD' ? 'GET' : method)) return { handler, params };
    allowed = true;
  }
  throw new HttpError(allowed ? 405 : 404, allowed ? 'Method not allowed.' : 'Not found.');
}

const toDir = dir => (dir instanceof URL ? dir : pathToFileURL(String(dir).endsWith('/') ? dir : `${dir}/`));

/** A pending pack's in-memory preview and og cards: `/packs/<id>/preview/…`, `/packs/<id>/og/<card>.jpg`. */
const PACK_ASSET = /^\/packs\/([a-f0-9]{24})\/(preview|og)(\/.*)?$/;

/**
 * @param {{ dir?: URL|string, publicDir?: URL|string, password?: string, storage?: object }} options `dir` is the
 *   src/sites/ directory; `publicDir` is public/ (og cards imported from site packs are written to public/og/).
 * @returns {import('node:http').Server}
 */
export function createAdmin({ dir = SITES_DIR, publicDir = PUBLIC_DIR, password = '', storage } = {}) {
  const sitesDir = toDir(dir);
  const publicUrl = toDir(publicDir);
  const store = storage ?? fsStorage({ dir: sitesDir, publicDir: publicUrl });
  const content = createContent({ dir: sitesDir, publicDir: publicUrl, storage: store });
  const pending = pendingPacks();
  // One token per process: the admin has a single trusted operator, so per-session tokens would add nothing.
  const csrf = randomBytes(32).toString('base64url');
  const flashes = new Map();
  const queue = serial();

  const remember = flash => {
    const id = randomBytes(8).toString('hex');
    flashes.set(id, flash);
    if (flashes.size > 50) flashes.delete(flashes.keys().next().value);
    return id;
  };

  const send = (request, response, status, type, body, headers = {}) =>
    response
      .writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body ?? ''), ...headers })
      .end(request.method === 'HEAD' ? undefined : body);

  const sendPage = (request, response, status, { title, crumbs, body }, flash) => {
    response.setHeader('Content-Security-Policy', cspFor(content.imageHosts()));
    send(request, response, status, 'text/html; charset=utf-8', layout({ title, crumbs, body, flash, storage: store.describe() }));
  };

  async function handle(request, response) {
    baseHeaders(response);
    if (!hostAllowed(request, password)) return send(request, response, 403, 'text/plain; charset=utf-8', 'Unknown host.');
    if (!authorised(request, password)) {
      if (request.headers.authorization) {
        // Log and slow down wrong passwords; the admin may run on a trusted network with ADMIN_HOST.
        log('auth.failed', { ip: request.socket.remoteAddress });
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return send(request, response, 401, 'text/plain; charset=utf-8', 'Admin access requires a password.', {
        'WWW-Authenticate': 'Basic realm="PepTalk Appearances admin", charset="UTF-8"',
      });
    }
    if (!URL.canParse(request.url, 'http://localhost')) throw new HttpError(400, 'Invalid request URL.');
    const url = new URL(request.url, 'http://localhost');
    const { pathname } = url;
    const reading = request.method === 'GET' || request.method === 'HEAD';

    if (reading && Object.hasOwn(ASSETS, pathname)) {
      const [file, type] = ASSETS[pathname];
      return send(request, response, 200, type, await readFile(file));
    }
    if (pathname === PREFIX || pathname.startsWith(`${PREFIX}/`)) {
      if (!reading) throw new HttpError(405, 'Preview is read-only.');
      const snap = content.snapshot();
      const result = await renderPreview(pathname.slice(PREFIX.length), snap);
      if (result.redirect) return send(request, response, 302, 'text/plain; charset=utf-8', '', { Location: result.redirect });
      response.setHeader('Content-Security-Policy', previewCsp(content.imageHosts(snap)));
      return send(request, response, result.status, result.type, result.body);
    }

    const asset = reading && PACK_ASSET.exec(pathname);
    if (asset) {
      const { pack } = entryOr404({ pending }, asset[1]);
      if (asset[2] === 'og') {
        const card = pack.og[(asset[3] ?? '').slice(1)];
        if (!card) throw new HttpError(404, 'Not found.');
        return send(request, response, 200, 'image/jpeg', card);
      }
      // The pack's site rendered in memory, exactly as the build would, before anything is written.
      const site = pack.site;
      const snap = {
        registry: { order: [site.slug], rootSite: site.slug, redirects: {} },
        sites: [site],
        find: slug => (slug === site.slug ? site : null),
      };
      const prefix = `/packs/${asset[1]}/preview`;
      const result = await renderPreview(asset[3] ?? '', snap, prefix);
      if (result.redirect) return send(request, response, 302, 'text/plain; charset=utf-8', '', { Location: result.redirect });
      response.setHeader('Content-Security-Policy', previewCsp(content.imageHosts(snap)));
      return send(request, response, result.status, result.type, result.body);
    }

    const { handler, params } = match(request.method, pathname);
    if (reading) {
      const flash = flashes.get(url.searchParams.get('flash'));
      flashes.delete(url.searchParams.get('flash'));
      const result = await handler({ content, csrf, params, url, pending });
      if (result.download) {
        const { filename, type, data } = result.download;
        return send(request, response, 200, type, data, { 'Content-Disposition': `attachment; filename="${filename}"` });
      }
      return sendPage(request, response, 200, result, flash);
    }
    // State changes: same-origin first (cheap, before reading the body), then the CSRF token from the form.
    // The site-pack upload is the only multipart route and the only one allowed a large body (15 MB, not 1 MB);
    // its token is checked as soon as the body is split into parts, before the zip is opened.
    if (!sameOrigin(request)) throw new HttpError(403, 'Cross-origin request refused.');
    const { form, files } = pathname === '/packs' ? await readMultipart(request) : { form: await readForm(request), files: {} };
    if (!same(form.get('_csrf') ?? '', csrf)) throw new HttpError(403, 'Missing or invalid form token. Reload the page and try again.');
    const result = await queue(() => handler({ content, csrf, params, url, form, files, pending }));
    if (result.redirect) {
      if (['ok', 'warn'].includes(result.flash?.kind)) log('content.saved', { path: pathname, storage: store.name });
      const join = result.redirect.includes('?') ? '&' : '?';
      const location = result.flash ? `${result.redirect}${join}flash=${remember(result.flash)}` : result.redirect;
      return send(request, response, 303, 'text/plain; charset=utf-8', '', { Location: location });
    }
    if (result.status === 422) log('content.refused', { path: pathname });
    return sendPage(request, response, result.status ?? 200, result);
  }

  return createServer((request, response) => {
    handle(request, response).catch(error => {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500)
        log('request.failed', { method: request.method, path: request.url?.split('?')[0], kind: error.name, message: error.message });
      if (response.headersSent) return response.end();
      const message = status === 500 ? 'The request failed. The admin log has the details.' : error.message;
      if (status === 405) response.setHeader('Allow', error.allow ?? 'GET, HEAD, POST');
      if (status === 401 || status === 403 || status === 413 || status === 415)
        return send(request, response, status, 'text/plain; charset=utf-8', message);
      try {
        sendPage(request, response, status, { title: status === 404 ? 'Not found' : 'Error', body: errorPage(status, message) });
      } catch {
        // The page shell reads content for the CSP; if that is what failed, fall back to plain text.
        send(request, response, status, 'text/plain; charset=utf-8', message);
      }
    });
  });
}
