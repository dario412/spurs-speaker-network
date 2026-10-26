// POST /api/revalidate: a CMS or Airtable webhook asks for content to be refreshed without a deploy. Pure (Web
// Request/Response, injected revalidate function, clock, limiter and logger), so it is unit-tested without Next.js;
// app/api/revalidate/route.ts wires it to next/cache. Outside the preview password gate (lib/proxy/decide.ts),
// authenticated by REVALIDATE_SECRET instead.
//
// Request: header `x-revalidate-secret: <secret>` (or `Authorization: Bearer <secret>`), JSON body, one of:
//   { "tags": ["site:spurs", "person:spurs:dele-alli", "all"] }
//   { "site": "spurs" }                      -> site:spurs
//   { "site": "spurs", "person": "dele-alli" } -> person:spurs:dele-alli
// plus optional "immediate": true to expire at once instead of serving stale while regenerating. That also gives up the
// last-good-page fallback: if the source is down, visitors get a 500 until it recovers (docs/content-contract.md).

import { isContentTag, personTag, SLUG_RE, siteTag } from '../content/tags.ts';
import { matches } from '../proxy/gate.ts';

export const REVALIDATE_PATH = '/api/revalidate';
export const SECRET_HEADER = 'x-revalidate-secret';
export const MAX_BODY_BYTES = 8 * 1024;
export const MAX_TAGS = 50;

/** stale-while-revalidate (Next's recommended 'max' profile) or immediate expiry ({ expire: 0 }). */
export type RevalidateMode = 'max' | 'expire';

export interface RateLimiter {
  /** True when the caller may proceed; counts the attempt either way. */
  take(key: string, now: number): boolean;
}

/** Fixed window per client: `limit` calls per `windowMs`. In memory, per instance: light, best effort. */
export function createRateLimiter({ limit, windowMs, maxKeys = 1000 }: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    take(key, now) {
      const current = windows.get(key);
      if (!current || now - current.start >= windowMs) {
        if (windows.size >= maxKeys) for (const [old, entry] of windows) if (now - entry.start >= windowMs) windows.delete(old);
        if (windows.size >= maxKeys) windows.clear();
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      current.count += 1;
      return current.count <= limit;
    },
  };
}

export interface RevalidateDeps {
  secret: string | undefined;
  revalidate: (tag: string, mode: RevalidateMode) => void;
  limiter: RateLimiter;
  /** Receives one structured entry per call. Never given the secret or the request headers. */
  log: (entry: Record<string, unknown>) => void;
  now?: () => number;
}

type Body = { tags: string[]; immediate: boolean };

const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

/** The caller, for rate limiting only (Vercel sets x-forwarded-for); never logged. */
const clientKey = (request: Request): string =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';

function suppliedSecret(request: Request): string | null {
  const header = request.headers.get(SECRET_HEADER);
  if (header) return header;
  const bearer = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '');
  return bearer ? bearer[1] : null;
}

/** Validates the body and turns it into tags. Returns an error message instead of throwing. */
export function parseBody(value: unknown): Body | string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'body must be a JSON object';
  const body = value as Record<string, unknown>;
  const unknown = Object.keys(body).filter(key => !['tags', 'site', 'person', 'immediate'].includes(key));
  if (unknown.length) return `unknown field(s): ${unknown.join(', ')}`;
  if (body.immediate !== undefined && typeof body.immediate !== 'boolean') return '"immediate" must be true or false';
  const immediate = body.immediate === true;
  if (body.tags !== undefined) {
    if (body.site !== undefined || body.person !== undefined) return 'send either "tags" or "site" (with optional "person"), not both';
    if (!Array.isArray(body.tags) || body.tags.length === 0) return '"tags" must be a non-empty array';
    if (body.tags.length > MAX_TAGS) return `at most ${MAX_TAGS} tags per call`;
    const bad = body.tags.filter(tag => !isContentTag(tag));
    if (bad.length)
      return `unknown tag(s): ${bad.map(tag => JSON.stringify(tag)).join(', ')} (all, registry, sites, legal, legal:<kind>, site:<slug>, person:<slug>:<person>)`;
    return { tags: [...new Set(body.tags as string[])], immediate };
  }
  if (typeof body.site !== 'string' || !SLUG_RE.test(body.site)) return '"site" must be a site slug (or send "tags")';
  if (body.person === undefined) return { tags: [siteTag(body.site)], immediate };
  if (typeof body.person !== 'string' || !SLUG_RE.test(body.person)) return '"person" must be a person slug';
  return { tags: [personTag(body.site, body.person)], immediate };
}

export async function handleRevalidate(request: Request, deps: RevalidateDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const started = now();
  const done = (status: number, outcome: string, body: Record<string, unknown>, extra: Record<string, unknown> = {}, headers = {}) => {
    deps.log({ event: 'revalidate', outcome, status, ms: now() - started, ...extra });
    return json(status, body, headers);
  };

  if (!deps.limiter.take(clientKey(request), started))
    return done(429, 'rate_limited', { error: 'rate_limited' }, {}, { 'Retry-After': '60' });
  if (!deps.secret) return done(503, 'not_configured', { error: 'not_configured', message: 'REVALIDATE_SECRET is not set' });
  const supplied = suppliedSecret(request);
  if (supplied === null || !(await matches(supplied, deps.secret))) return done(401, 'unauthorized', { error: 'unauthorized' });

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return done(413, 'invalid_body', { error: 'body_too_large' });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return done(413, 'invalid_body', { error: 'body_too_large' });
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return done(400, 'invalid_body', { error: 'invalid_body', message: 'body must be JSON' }, { reason: 'not JSON' });
  }
  const body = parseBody(value);
  if (typeof body === 'string') return done(400, 'invalid_body', { error: 'invalid_body', message: body }, { reason: body });

  const mode: RevalidateMode = body.immediate ? 'expire' : 'max';
  try {
    for (const tag of body.tags) deps.revalidate(tag, mode);
  } catch (error) {
    return done(500, 'error', { error: 'revalidate_failed' }, { tags: body.tags, reason: (error as Error).message });
  }
  return done(200, 'ok', { revalidated: true, tags: body.tags, mode, now: now() }, { tags: body.tags, mode });
}
