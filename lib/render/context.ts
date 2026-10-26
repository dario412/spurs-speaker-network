// Per-site render context: merged wording, formats and FAQ, lookups,
// page switches, and the demo flag. Every component receives this, so sites differ only by data.
import { FAQ as BASE_FAQ, FORMATS as BASE_FORMATS, VOCAB } from '../content/defaults.ts';
import { pagesFor } from '../content/publish.ts';
import type { FaqEntry, Format, FormatKey, NavLabels, PageKey, Person, Site, Vocab } from '../content/types.ts';
import { canonicalOrigin, canonicalUrl, type SiteDomain } from '../domains.ts';
import { publicOrigin } from '../origin.ts';
import { isSiteIndexable } from '../seo/indexing.ts';
import { decodeDeep } from './text.ts';

export const PEPTALK = 'https://www.getapeptalk.com';

/** Fills {name} and {name|fallback} placeholders in FAQ copy (see FAQ in src/copy/defaults.mjs). */
export const fillPlaceholders = (text: string, values: Record<string, string | undefined>): string =>
  text.replace(/\{(\w+)(?:\|([^}]*))?\}/g, (match, name: string, fallback?: string) => values[name] ?? fallback ?? match);

export interface SiteContext {
  /** The published site with every string decoded to plain text (theme CSS uses the stored values instead). */
  site: Site;
  /** Prefix for links within the site: `/<slug>` in the hub folder, `''` on the site's own domain. */
  base: string;
  /** The site's home link: `base`, or `/` on the site's own domain. */
  home: string;
  /** The canonical absolute URL of a link path built from `base` (`${base}/legends`), whichever copy is rendering. */
  url(path: string): string;
  /** This copy is the canonical one: the domain once it is live, else the hub folder. Only it may be indexed. */
  canonical: boolean;
  pages: Record<PageKey, boolean>;
  /** The site's wording; `aboutTitle` is always set (the default "About <platform>" is filled in here). */
  v: Vocab & { aboutTitle: string };
  nl: NavLabels;
  FORMATS: Record<FormatKey, Format>;
  bySlug: Record<string, Person>;
  hasSquad: boolean;
  /** Look-only demo page: no links, forms, toggles or behaviour script. */
  demo: boolean;
  eraLabel(key: string): string;
  roleLabel(key: string): string;
  /** FAQ entries ready to render: all of them, or only the profile ones (with the person's name) when person is given. */
  faq(person?: Person): { q: string; a: string }[];
  /**
   * Search engines may index this copy of the site: site.json `indexable` (after the deployment guards in
   * lib/seo/indexing.ts), and this is the canonical copy.
   */
  indexable: boolean;
  /** The site is launched (site.json `indexable`, after the deployment guards), whichever copy is rendering. */
  launched: boolean;
  /** Origin of the site's canonical URLs (its live domain, else the hub's public origin). */
  origin: string;
}

export interface ContextOptions {
  demo?: boolean;
  /** The hub's public origin (lib/origin.ts). */
  origin?: string;
  /** registry.json → domains entry for this site, if it has one. */
  domain?: SiteDomain | null;
  /** Render the copy served on the site's own domain (links without the slug prefix). */
  onDomain?: boolean;
}

export function siteContext(
  stored: Site,
  { demo = false, origin = publicOrigin(), domain = null, onDomain = false }: ContextOptions = {},
): SiteContext {
  const site = decodeDeep(stored) as Site;
  const faqEntries: FaqEntry[] = decodeDeep(BASE_FAQ).map(entry => {
    const override = site.faqOverrides?.[entry.key];
    return typeof override === 'string' ? { ...entry, a: override } : { ...entry, ...override };
  });
  const formats = decodeDeep(BASE_FORMATS);
  const vocab = decodeDeep(VOCAB);
  const base = onDomain && domain ? '' : `/${site.slug}`;
  const canonical = Boolean(onDomain && domain) === Boolean(domain?.live);
  return {
    site,
    base,
    home: base || '/',
    url: path => canonicalUrl(site.slug, path === '/' && !base ? '' : path.slice(base.length), domain, origin),
    canonical,
    pages: pagesFor(site),
    v: {
      ...vocab,
      ...site.vocab,
      // The shared default is null: the about page is "About <platform>" unless the site sets its own heading.
      aboutTitle: site.vocab?.aboutTitle ?? `About ${site.platform}`,
      navLabels: { ...vocab.navLabels, ...site.vocab?.navLabels },
    } as Vocab & { aboutTitle: string },
    nl: { ...vocab.navLabels, ...site.vocab?.navLabels },
    FORMATS: Object.fromEntries(Object.entries(formats).map(([k, f]) => [k, { ...f, ...site.formats?.[k as FormatKey] }])) as Record<
      FormatKey,
      Format
    >,
    bySlug: Object.fromEntries(site.people.map(person => [person.slug, person])),
    hasSquad: site.people.some(person => person.role === 'squad'),
    demo,
    eraLabel: key => site.eras.find(era => era.key === key)?.label ?? key,
    roleLabel: key => site.roles.find(role => role.key === key)?.label ?? key,
    faq(person) {
      const values = { org: site.orgName, first: person?.first };
      return faqEntries
        .filter(entry => !person || entry.profile)
        .map(({ q, a }) => ({ q: fillPlaceholders(q, values), a: fillPlaceholders(a, values) }));
    },
    indexable: isSiteIndexable(stored) && canonical,
    launched: isSiteIndexable(stored),
    origin: canonicalOrigin(domain, origin),
  };
}

/** The official label shown on the hero, form and landing tiles. */
export const officialLabel = ({ site, v }: Pick<SiteContext, 'site' | 'v'>): string =>
  v.officialLabel ?? `Official ${site.orgName} platform`;
