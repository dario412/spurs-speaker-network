// Provider selection and composition (no Next.js imports, so next.config.ts, scripts and plain Node tests can use it).
//   CONTENT_PROVIDER=json|cms        (default json)
//   PEOPLE_PROVIDER=json|airtable    (default json: people come from the content provider)
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { airtableEnv, loadAirtableConfig } from './airtable/config.ts';
import { createAirtablePeopleProvider } from './airtable-provider.ts';
import { createCmsProvider } from './cms-provider.ts';
import { ContentError } from './errors.ts';
import { createJsonProvider, type JsonProviderOptions } from './json-provider.ts';
import type { ContentProvider, PeopleProvider, PeopleResult } from './provider.ts';
import { isActive, personImageIds, pickImages, publishable, publishedSites, siteImageIds } from './publish.ts';
import type { RawSite } from './types.ts';

type Env = Record<string, string | undefined>;

/** Licence approvals only for images the merged site still uses (the rest would be orphans the validator rejects). */
function keepLicences(licences: unknown, images: RawSite['images']): unknown {
  if (!licences || typeof licences !== 'object') return licences;
  const stored = licences as { images?: Record<string, unknown> };
  if (!stored.images) return licences;
  return { ...stored, images: Object.fromEntries(Object.entries(stored.images).filter(([id]) => Object.hasOwn(images, id))) };
}

/** Verification checks only for people the merged site still has (checks for others would be orphans). */
function keepVerification(verification: unknown, people: RawSite['people']): unknown {
  if (!verification || typeof verification !== 'object') return verification;
  const stored = verification as { people?: Record<string, unknown> };
  if (!stored.people) return verification;
  const slugs = new Set(people.map(person => person.slug));
  return { ...stored, people: Object.fromEntries(Object.entries(stored.people).filter(([slug]) => slugs.has(slug))) };
}

/**
 * Replaces each managed site's people with the people provider's, then re-applies the publishing switches. The site's
 * own image references (home slots, role tiles) keep resolving: images are the site's entries it still uses plus the
 * people provider's.
 */
export function withPeople(content: ContentProvider, people: PeopleProvider): ContentProvider {
  const merge = async (raw: RawSite | null): Promise<RawSite | null> => {
    if (!raw) return null;
    const result = await people.peopleFor(raw);
    if (!result) return raw;
    const images = { ...pickImages(raw.images, siteImageIds(raw)), ...result.images };
    const used = pickImages(images, [...siteImageIds(raw), ...result.people.flatMap(personImageIds)]);
    return {
      ...raw,
      people: result.people,
      images: used,
      licences: keepLicences(raw.licences, used),
      verification: keepVerification(raw.verification, result.people),
    };
  };
  const all = async () => (await Promise.all((await content.listRawSites()).map(merge))).filter((s): s is RawSite => s !== null);
  return {
    ...content,
    getRawSite: async slug => merge(await content.getRawSite(slug)),
    listRawSites: all,
    listSites: async () => {
      // Inactive sites are never published, so their people are never fetched.
      const active = (await content.listRawSites()).filter(isActive);
      const merged = (await Promise.all(active.map(merge))).filter((s): s is RawSite => s !== null);
      return publishedSites(await content.getRegistry(), merged);
    },
    getSite: async slug => {
      const raw = await content.getRawSite(slug);
      if (!raw || !isActive(raw)) return null;
      const merged = await merge(raw);
      return merged ? publishable(merged) : null;
    },
  };
}

/**
 * One people-provider read per site per build. `next build` renders pages in several worker processes, and each would
 * otherwise call the source itself (for Airtable: every worker paging through the table, quickly over its 5 requests
 * per second). next.config.ts reads every site once while building the routing manifest and records each result in
 * its own file under `dir`, written to a temporary name and renamed into place (atomic); the workers, which inherit
 * APPEARANCES_BUILD_SNAPSHOT, read them. Only set during `next build`: at runtime every read goes to the source.
 */
export function withBuildSnapshot(people: PeopleProvider, dir: string): PeopleProvider {
  return {
    async peopleFor(site) {
      const file = join(dir, `${site.slug}.json`);
      if (existsSync(file)) return (JSON.parse(readFileSync(file, 'utf8')) as { result: PeopleResult | null }).result;
      const result = await people.peopleFor(site);
      mkdirSync(dir, { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify({ result }));
      renameSync(temporary, file);
      return result;
    },
  };
}

export interface SelectOptions {
  /** Options for the JSON provider (next.config.ts passes `cache: false`). */
  json?: JsonProviderOptions;
  /** fetch for remote providers (tests inject a mock; never the network in tests). */
  fetch?: typeof fetch;
}

export function selectProvider(env: Env = process.env, options: SelectOptions = {}): ContentProvider {
  const kind = env.CONTENT_PROVIDER || 'json';
  const peopleKind = env.PEOPLE_PROVIDER || 'json';
  if (!['json', 'cms'].includes(kind))
    throw new ContentError('config', `Unknown CONTENT_PROVIDER "${kind}" (json or cms)`, { provider: 'select' });
  if (!['json', 'airtable'].includes(peopleKind))
    throw new ContentError('config', `Unknown PEOPLE_PROVIDER "${peopleKind}" (json or airtable)`, { provider: 'select' });
  const content = kind === 'cms' ? createCmsProvider() : createJsonProvider(options.json);
  if (peopleKind !== 'airtable') return content;
  const { token, config } = airtableEnv(env);
  const people = createAirtablePeopleProvider(loadAirtableConfig(config), { token, fetch: options.fetch });
  const snapshot = env.APPEARANCES_BUILD_SNAPSHOT;
  return withPeople(content, snapshot ? withBuildSnapshot(people, snapshot) : people);
}
