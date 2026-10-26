// The seam between content storage and the site. Components only talk to a ContentProvider.
//
// Selection (see lib/content/index.ts):
//   CONTENT_PROVIDER=json (default) | cms     where sites, registry and legal text come from
//   PEOPLE_PROVIDER=json  (default) | airtable where people and their images come from (lib/content/airtable/)
// Every method either resolves with contract-shaped data (schema/*.schema.json), resolves null for an unknown or
// switched-off slug, or rejects with a ContentError (lib/content/errors.ts). test/contract/provider-conformance.ts
// checks all of that for any implementation.
import type { Images, LegalDoc, LegalKind, Person, RawSite, Registry, Site } from './types.ts';

export interface ContentProvider {
  /** registry.json: site order, root site, old-slug redirects. */
  getRegistry(): Promise<Registry>;
  /** Published sites (active only, hidden people removed), in registry order. */
  listSites(): Promise<Site[]>;
  /** One published site, or null when it doesn't exist or is inactive. */
  getSite(slug: string): Promise<Site | null>;
  /** A site exactly as stored (inactive people, licences, verification): for admin and validation only. Null if unknown. */
  getRawSite(slug: string): Promise<RawSite | null>;
  /** Every stored site in registry order, inactive ones included: for admin and validation only. */
  listRawSites(): Promise<RawSite[]>;
  /** A legal document shared by every site. */
  getLegal(kind: LegalKind): Promise<LegalDoc>;
}

/** People and the images they reference, for one site. */
export interface PeopleResult {
  people: Person[];
  images: Images;
}

/** Where people come from when they don't come from the content provider (the Airtable sync implements this). */
export interface PeopleProvider {
  /**
   * Every person for the site, hidden ones included (publishing switches are applied afterwards), plus the images they
   * reference; or null when this provider doesn't manage the site (it keeps the content provider's people).
   */
  peopleFor(site: RawSite): Promise<PeopleResult | null>;
}
