// POST /api/enquiry (app/api/enquiry/route.ts): the enquiry form's endpoint, as a function of the request and its
// dependencies so it is unit-testable without Next.js. In order: size and type limits, a per-instance rate limit,
// the site (and, on a site's own domain, that it is the domain's site), a same-origin check, the site's password gate,
// the honeypot, a minimum time to submit, the form's own rules (lib/enquiry/fields.ts), then forwarding.
// - ENQUIRY_WEBHOOK_URL set: the enquiry is forwarded as normalised JSON, with ENQUIRY_WEBHOOK_SECRET in the
//   X-Enquiry-Secret header when set. Nothing is stored.
// - not set: the enquiry is checked and discarded (nothing sent or stored), and the visitor sees the concept
//   confirmation, exactly as the form behaves without the endpoint.
// It never logs personal data: one line per request with the event, the site slug and the outcome.
// Answers JSON to the behaviour script (Accept: application/json) and 303 to the form's thank-you or error state
// (`#enquiry-sent`, `#enquiry-error`, `#enquiry-failed`) to a browser without JavaScript (POST/redirect/GET).
import { createHash } from 'node:crypto';
import type { Site } from '../content/types.ts';
import type { SiteDomain } from '../domains.ts';
import { hasAccess, passwordsFromEnv } from '../proxy/gate.ts';
import { siteContext } from '../render/context.ts';
import { isSiteIndexable } from '../seo/indexing.ts';
import { webhookUrl } from './config.ts';
import { checkEnquiry, HONEYPOT_FIELD, SITE_FIELD, SITE_HEADER, STARTED_FIELD } from './fields.ts';

type Env = Record<string, string | undefined>;

export const SECRET_HEADER = 'X-Enquiry-Secret';
/** The form is under 2 KB; anything far bigger is not a person filling it in. */
export const MAX_BYTES = 16 * 1024;
/** A person needs a few seconds to fill in the form (counted from when the behaviour script readied it). */
export const MIN_FILL_MS = 3000;
export const FORWARD_TIMEOUT_MS = 8000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type Outcome =
  | 'forwarded'
  | 'discarded'
  | 'honeypot'
  | 'too-fast'
  | 'invalid'
  | 'unknown-site'
  | 'forbidden'
  | 'unauthorized'
  | 'rate-limited'
  | 'too-large'
  | 'unsupported'
  | 'forward-failed';

export interface LogLine {
  service: 'appearances';
  event: 'enquiry.submitted';
  site: string | null;
  outcome: Outcome;
  status: number;
}

export interface RateLimiter {
  /** Records one request for the key; false when the key is over its limit in the current window. */
  allow(key: string, now: number): boolean;
}

/**
 * A fixed-window limit per client, in this instance's memory: a light brake on a script hammering the form, not a
 * guarantee (each Vercel function instance counts on its own). Use a Vercel Firewall rate-limit rule for a hard limit.
 */
export function createRateLimiter({ limit = 10, windowMs = 10 * 60 * 1000, maxKeys = 5000 } = {}): RateLimiter {
  const windows = new Map<string, { count: number; resets: number }>();
  return {
    allow(key, now) {
      if (windows.size >= maxKeys) for (const [k, w] of windows) if (w.resets <= now) windows.delete(k);
      if (windows.size >= maxKeys) windows.clear();
      const current = windows.get(key);
      if (!current || current.resets <= now) {
        windows.set(key, { count: 1, resets: now + windowMs });
        return true;
      }
      current.count += 1;
      return current.count <= limit;
    },
  };
}

export interface EnquiryDeps {
  env: Env;
  fetch: typeof fetch;
  now: () => number;
  limiter: RateLimiter;
  log: (line: LogLine) => void;
  /** A published site and its domain (registry.json → domains), or null. */
  loadSite: (slug: string) => Promise<{ site: Site; domain: SiteDomain | null } | null>;
  /** The hub's public origin, for canonical URLs in the payload. */
  hubOrigin: string;
}

/** The JSON sent to ENQUIRY_WEBHOOK_URL (version 1; documented in docs/vercel.md). */
export interface EnquiryPayload {
  type: 'enquiry';
  version: 1;
  site: { slug: string; platform: string; orgName: string; url: string };
  personOfInterest: { slug: string; name: string; url: string } | null;
  fields: {
    name: string;
    email: string;
    company: string;
    eventDate: string | null;
    who: string;
    where: string;
    format: string;
    audienceSize: string;
    brief: string | null;
  };
  submittedAt: string;
  pageUrl: string;
}

async function readLimited(request: Request, max: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** The client address Vercel sets (it overwrites X-Forwarded-For, so clients can't spoof it), hashed for the limiter. */
function clientKey(request: Request): string {
  const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  return createHash('sha256').update(ip).digest('base64url').slice(0, 22);
}

export async function handleEnquiry(request: Request, deps: EnquiryDeps): Promise<Response> {
  const json = (request.headers.get('accept') ?? '').includes('application/json');
  const hostSite = request.headers.get(SITE_HEADER) || null;
  let slug: string | null = null;
  let base: string | null = null;

  const finish = (status: number, outcome: Outcome, body: Record<string, unknown> = {}): Response => {
    deps.log({ service: 'appearances', event: 'enquiry.submitted', site: slug, outcome, status });
    const headers = { 'Cache-Control': 'no-store' };
    if (json) return Response.json({ ok: status < 300, ...body }, { status, headers });
    // A person without JavaScript goes back to the form's thank-you or error state; refusals (403, 401, 413, 415) don't.
    if (base !== null && [200, 400, 429, 502].includes(status)) {
      const state = status < 300 ? 'sent' : outcome === 'forward-failed' || outcome === 'rate-limited' ? 'failed' : 'error';
      return new Response(null, { status: 303, headers: { ...headers, Location: `${base}/check-availability#enquiry-${state}` } });
    }
    return new Response(status < 300 ? 'Enquiry received.' : 'The enquiry could not be accepted.', {
      status,
      headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  };

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) return finish(413, 'too-large', { error: 'too-large' });
  if (!(request.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded'))
    return finish(415, 'unsupported', { error: 'unsupported' });
  if (!deps.limiter.allow(clientKey(request), deps.now())) return finish(429, 'rate-limited', { error: 'rate-limited' });
  const body = await readLimited(request, MAX_BYTES);
  if (body === null) return finish(413, 'too-large', { error: 'too-large' });
  const form = new URLSearchParams(body);

  const requested = form.get(SITE_FIELD) ?? '';
  const loaded = SLUG.test(requested) ? await deps.loadSite(requested) : null;
  // On a site's own domain, only that site's form may post (the proxy names the domain's site).
  if (!loaded || (hostSite !== null && hostSite !== requested)) return finish(400, 'unknown-site', { error: 'invalid' });
  const { site, domain } = loaded;
  slug = site.slug;
  base = hostSite ? '' : `/${slug}`;

  // Same-origin only: a page on another site can't post enquiries through a visitor's browser.
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin !== null && (!URL.canParse(origin) || new URL(origin).host !== host)) return finish(403, 'forbidden', { error: 'forbidden' });

  // The proxy lets any valid password reach the endpoint on the hub; the site's own gate applies here.
  if (!isSiteIndexable(site, deps.env)) {
    const passwords = passwordsFromEnv(deps.env, [site.slug]);
    if (!(await hasAccess(request.headers.get('authorization'), `/${site.slug}`, passwords)))
      return finish(401, 'unauthorized', { error: 'unauthorized' });
  }

  // Bots that fill every field get a normal-looking success, and nothing is sent.
  if ((form.get(HONEYPOT_FIELD) ?? '') !== '') return finish(200, 'honeypot', { forwarded: false });
  const started = form.get(STARTED_FIELD);
  if (started) {
    if (!/^\d{10,16}$/.test(started)) return finish(400, 'invalid', { error: 'invalid' });
    if (deps.now() - Number(started) < MIN_FILL_MS) return finish(400, 'too-fast', { error: 'too-fast' });
  }

  const ctx = siteContext(site, { origin: deps.hubOrigin, domain });
  const checked = checkEnquiry(form, ctx);
  if (!checked.ok) return finish(400, 'invalid', { error: 'invalid', fields: [...new Set(checked.errors.map(error => error.field))] });

  const url = webhookUrl(deps.env);
  if (!url) return finish(200, 'discarded', { forwarded: false });

  const { fields } = checked;
  const person = fields.legend ? ctx.bySlug[fields.legend] : null;
  const referer = request.headers.get('referer');
  const sameOrigin = referer && URL.canParse(referer) && new URL(referer).host === host;
  const payload: EnquiryPayload = {
    type: 'enquiry',
    version: 1,
    site: { slug: site.slug, platform: ctx.site.platform, orgName: ctx.site.orgName, url: ctx.url(ctx.home) },
    personOfInterest: person ? { slug: person.slug, name: person.name, url: ctx.url(`${ctx.base}/legends/${person.slug}`) } : null,
    fields: {
      name: fields.name,
      email: fields.email,
      company: fields.company,
      eventDate: fields.date || null,
      who: fields.who,
      where: fields.where,
      format: fields.format,
      audienceSize: fields.size,
      brief: fields.brief || null,
    },
    submittedAt: new Date(deps.now()).toISOString(),
    pageUrl: sameOrigin ? referer.split('#')[0] : ctx.url(`${ctx.base}/check-availability`),
  };
  const secret = deps.env.ENQUIRY_WEBHOOK_SECRET;
  try {
    const response = await deps.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { [SECRET_HEADER]: secret } : {}) },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    if (!response.ok) return finish(502, 'forward-failed', { error: 'unavailable' });
  } catch {
    // The error can carry the webhook URL (which may hold a token), so nothing from it is logged; the outcome is.
    return finish(502, 'forward-failed', { error: 'unavailable' });
  }
  return finish(200, 'forwarded', { forwarded: true });
}
