// Preview password gate (HTTP Basic, any username), with constant-time comparison through Web Crypto.
// - PREVIEW_PASSWORD (master) opens everything, including the landing page (`/`, or `/all` when a root site is set),
//   which lists every platform and which only it opens, and the component gallery (/_gallery), likewise.
// - PREVIEW_PASSWORD_<SLUG> opens only that site (/<slug>/…, or every path on the site's own domain) plus shared
//   assets, so one partner never sees another's pitch.
// - Nothing configured: open (local development and tests).
type Env = Record<string, string | undefined>;

export interface Passwords {
  master: string;
  /** slug -> password, only for sites with a password set. */
  sites: Record<string, string>;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SITE_VAR = /^PREVIEW_PASSWORD_([A-Z0-9_]+)$/;

/** `man-utd` -> `PREVIEW_PASSWORD_MAN_UTD` (hyphens are not valid in shell variable names). */
export const passwordVar = (slug: string): string => `PREVIEW_PASSWORD_${slug.toUpperCase().replaceAll('-', '_')}`;

/** Reads the master password and every per-site password; `slugs` maps variable names back to their site. */
export function passwordsFromEnv(env: Env, slugs: string[]): Passwords {
  const byVar = new Map(slugs.map(slug => [passwordVar(slug), slug]));
  const sites: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    const slug = SITE_VAR.test(name) ? byVar.get(name) : undefined;
    if (slug && value) sites[slug] = value;
  }
  return { master: env.PREVIEW_PASSWORD || '', sites };
}

export const gateConfigured = ({ master, sites }: Passwords): boolean => Boolean(master) || Object.keys(sites).length > 0;

const encoder = new TextEncoder();
const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

/** Constant-time comparison of SHA-256 digests (fixed length, so timing doesn't depend on where they differ). */
export async function matches(supplied: string, secret: string): Promise<boolean> {
  if (!secret) return false;
  const [a, b] = await Promise.all([digest(supplied), digest(secret)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** The password from an `Authorization: Basic …` header (any username), or null. */
export function basicPassword(authorization: string | null): string | null {
  const [scheme, encoded] = (authorization ?? '').split(' ');
  if (scheme !== 'Basic' || !encoded) return null;
  let decoded: string;
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
  } catch {
    // Not valid base64: treated as no password (401), like a missing header.
    return null;
  }
  return decoded.slice(decoded.indexOf(':') + 1);
}

/**
 * Paths any valid password opens: shared assets, crawler files and the hub legal pages (they name no partner), and the
 * image optimizer (/_next/image only resizes the Getty and partner images the pages already show), and the enquiry
 * endpoint, which checks access again for the site named in the submission (lib/enquiry/handler.ts).
 */
export const isShared = (pathname: string): boolean =>
  [
    '/styles.css',
    '/tracking.js',
    '/robots.txt',
    '/sitemap.xml',
    '/llms.txt',
    '/terms',
    '/privacy',
    '/accessibility',
    '/_next/image',
    '/api/enquiry',
  ].includes(pathname) ||
  /^\/fonts\/[a-z0-9-]+\.woff2$/.test(pathname) ||
  /^\/peptalk\/[a-z0-9-]+\.png$/.test(pathname);

export async function hasAccess(authorization: string | null, pathname: string, passwords: Passwords): Promise<boolean> {
  if (!gateConfigured(passwords)) return true;
  const supplied = basicPassword(authorization);
  if (supplied === null) return false;
  if (await matches(supplied, passwords.master)) return true;
  const segment = pathname.split('/')[1] ?? '';
  if (SLUG.test(segment) && Object.hasOwn(passwords.sites, segment)) return matches(supplied, passwords.sites[segment]);
  if (isShared(pathname)) {
    const results = await Promise.all(Object.values(passwords.sites).map(secret => matches(supplied, secret)));
    return results.some(Boolean);
  }
  return false;
}

/** The master password only (the component gallery, lib/gallery.ts). Open when no password is configured at all. */
export async function hasMasterAccess(authorization: string | null, passwords: Passwords): Promise<boolean> {
  if (!gateConfigured(passwords)) return true;
  const supplied = basicPassword(authorization);
  return supplied !== null && matches(supplied, passwords.master);
}

/**
 * The gate on a site's own domain: every path there belongs to that site (or is a shared asset), so the master password
 * or that site's password opens it, and no other password does.
 */
export async function hasSiteAccess(authorization: string | null, slug: string, passwords: Passwords): Promise<boolean> {
  if (!gateConfigured(passwords)) return true;
  const supplied = basicPassword(authorization);
  if (supplied === null) return false;
  if (await matches(supplied, passwords.master)) return true;
  return Object.hasOwn(passwords.sites, slug) && matches(supplied, passwords.sites[slug]);
}

/**
 * The site whose password was supplied, when it isn't the master password: the first of `order` (registry order) whose
 * password matches, or null. Every configured site password is compared, so the time taken doesn't depend on which one
 * matched. Used to send a site-password holder who opens the landing page (master only) to their own site instead.
 */
export async function sitePasswordOwner(authorization: string | null, passwords: Passwords, order: string[]): Promise<string | null> {
  const supplied = basicPassword(authorization);
  if (supplied === null) return null;
  const candidates = order.filter(slug => Object.hasOwn(passwords.sites, slug));
  const results = await Promise.all(candidates.map(slug => matches(supplied, passwords.sites[slug])));
  return candidates[results.indexOf(true)] ?? null;
}
