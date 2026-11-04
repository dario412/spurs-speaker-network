// Cache tags for on-demand revalidation (POST /api/revalidate). The cached content layer (cached.ts) tags every read,
// so revalidating a tag regenerates exactly the prerendered pages that used it:
//   all                      everything
//   registry                 site order, root site, redirects
//   sites                    the site lists (hub, sitemaps, llms.txt)
//   legal / legal:<kind>     Terms and Privacy
//   site:<slug>              every page of one site (its one data entry, which the site lists are composed from)
//   person:<slug>:<person>   also on the site's entry, so the same as site:<slug>; lets a CMS name the changed record
import type { LegalKind } from './types.ts';

export const TAG_ALL = 'all';
export const TAG_REGISTRY = 'registry';
export const TAG_SITES = 'sites';
export const TAG_LEGAL = 'legal';

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
export const SLUG_RE = new RegExp(`^${SLUG}$`);
const TAG_RE = new RegExp(`^(?:all|registry|sites|legal|legal:(?:terms|privacy|accessibility)|site:${SLUG}|person:${SLUG}:${SLUG})$`);

export const siteTag = (slug: string): string => `site:${slug}`;
export const personTag = (site: string, person: string): string => `person:${site}:${person}`;
export const legalTag = (kind: LegalKind): string => `legal:${kind}`;

/** A tag the content layer can assign (Next.js caps tags at 256 characters; ours are far shorter). */
export const isContentTag = (tag: unknown): tag is string => typeof tag === 'string' && tag.length <= 256 && TAG_RE.test(tag);
