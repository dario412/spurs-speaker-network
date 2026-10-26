// HTTP plumbing for the admin: security headers, auth, same-origin + CSRF checks, body parsing, logging.
import { createHash, timingSafeEqual } from 'node:crypto';

/** One JSON log line per event. Never pass request bodies or secrets in `extra`. */
export const log = (event, extra = {}) => console.log(JSON.stringify({ service: 'appearances-admin', event, ...extra }));

const digest = value => createHash('sha256').update(String(value)).digest();
/** Constant-time string comparison; hashing first makes the lengths equal. */
export const same = (supplied, secret) => Boolean(secret) && timingSafeEqual(digest(supplied ?? ''), digest(secret));

export const MAX_BODY = 1024 * 1024;

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|::1|\[::1\])$/i;
export const isLoopback = host => LOOPBACK.test(String(host));

export function cspFor(imageHosts) {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' ${imageHosts.join(' ')}`,
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function baseHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  // Nothing leaks to Getty or partner CDNs (cross-origin requests get no referrer). Not `no-referrer`: under that
  // policy Chrome sends `Origin: null` on same-origin form posts, which the same-origin check must then refuse.
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.setHeader('Cache-Control', 'no-store');
}

/** HTTP Basic with any username; with no password configured the admin relies on a loopback bind. */
export function authorised(request, password) {
  if (!password) return true;
  const [scheme, encoded] = (request.headers.authorization || '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  return same(decoded.slice(decoded.indexOf(':') + 1), password);
}

/**
 * Without a password the only protection is the loopback bind, and DNS rebinding can point an attacker's hostname
 * at 127.0.0.1. Requiring a loopback Host header closes that: the browser sends the attacker's name, not ours.
 */
export function hostAllowed(request, password) {
  const host = String(request.headers.host || '');
  // The Host header ends up in preview URLs, so it must always be a plain host[:port].
  if (!WELL_FORMED_HOST.test(host)) return false;
  return Boolean(password) || isLoopback(host.replace(/:\d{1,5}$/, ''));
}

const WELL_FORMED_HOST = /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(?::\d{1,5})?$/;

/**
 * Browsers send Origin on every form POST; it must name this host. When it is absent or `null` (privacy modes,
 * some referrer policies) the browser-set Sec-Fetch-Site must say same-origin. A request with neither is refused.
 */
export function sameOrigin(request) {
  const origin = request.headers.origin;
  if (origin && origin !== 'null') return URL.canParse(origin) && new URL(origin).host === request.headers.host;
  return request.headers['sec-fetch-site'] === 'same-origin';
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Reads an application/x-www-form-urlencoded body, refusing anything over `limit` bytes. */
export async function readForm(request, limit = MAX_BODY) {
  const type = String(request.headers['content-type'] || '')
    .split(';')[0]
    .trim();
  if (type !== 'application/x-www-form-urlencoded') throw new HttpError(415, 'Forms must be sent as application/x-www-form-urlencoded.');
  if (Number(request.headers['content-length'] || 0) > limit) throw new HttpError(413, 'Request body too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request body too large.');
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

/** Runs async functions one at a time, so two saves never interleave their load → validate → write steps. */
export function serial() {
  let tail = Promise.resolve();
  return fn => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => {});
    return run;
  };
}

export const MAX_UPLOAD = 15 * 1024 * 1024;

/** Reads the whole body, refusing anything over `limit` bytes (checked against Content-Length and while streaming). */
async function readBody(request, limit) {
  if (Number(request.headers['content-length'] || 0) > limit)
    throw new HttpError(413, `Upload too large (the limit is ${Math.round(limit / 1024 / 1024)} MB).`);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, `Upload too large (the limit is ${Math.round(limit / 1024 / 1024)} MB).`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * A minimal multipart/form-data parser for the site-pack upload: text fields plus files, bounded in size and in
 * part count. Only what the upload form sends is understood (no nested multipart, no transfer encodings).
 * @returns {Promise<{ form: URLSearchParams, files: Record<string, { filename: string, data: Buffer }> }>}
 */
export async function readMultipart(request, { limit = MAX_UPLOAD, maxParts = 10 } = {}) {
  const type = String(request.headers['content-type'] || '');
  const boundary = type.match(/^multipart\/form-data;.*\bboundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!boundary) throw new HttpError(415, 'Uploads must be sent as multipart/form-data.');
  const body = await readBody(request, limit);
  const delimiter = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  const form = new URLSearchParams();
  const files = {};
  let at = body.indexOf(delimiter);
  if (at === -1) throw new HttpError(400, 'Malformed upload (no multipart boundary found).');
  for (let parts = 0; ; parts++) {
    at += delimiter.length;
    if (body.subarray(at, at + 2).toString() === '--') break;
    if (parts >= maxParts) throw new HttpError(400, 'Malformed upload (too many parts).');
    at += 2; // CRLF after the boundary
    const headerEnd = body.indexOf('\r\n\r\n', at);
    const next = body.indexOf(delimiter, at);
    if (headerEnd === -1 || next === -1 || headerEnd > next) throw new HttpError(400, 'Malformed upload (bad part headers).');
    const headers = body.subarray(at, headerEnd).toString('utf8');
    const data = body.subarray(headerEnd + 4, next - 2); // the part ends with CRLF before the next boundary
    const disposition = headers.match(/content-disposition:\s*form-data;([^\r\n]*)/i)?.[1] ?? '';
    const name = disposition.match(/\bname="([^"]*)"/)?.[1];
    const filename = disposition.match(/\bfilename="([^"]*)"/)?.[1];
    if (!name) throw new HttpError(400, 'Malformed upload (a part has no name).');
    if (filename !== undefined) files[name] = { filename, data: Buffer.from(data) };
    else form.append(name, data.toString('utf8'));
    at = next;
  }
  return { form, files };
}
