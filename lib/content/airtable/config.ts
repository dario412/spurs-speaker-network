// Airtable people sync: configuration. Which base and table, which records belong to which site, which records are
// publishable, and a field map keyed by Airtable field IDs (never names: names get renamed, IDs are stable; see
// https://support.airtable.com/docs/finding-airtable-ids). The token is never part of the config: it comes from
// AIRTABLE_TOKEN only. Example: config/airtable.example.json; guide: docs/airtable-cms.md.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContentError } from '../errors.ts';
import { parseOrigins } from '../image-ids.ts';
import type { Person } from '../types.ts';

type Env = Record<string, string | undefined>;

/**
 * How a cell is read. `name` is the field's display name, used only to read CSV exports (which carry names, not IDs);
 * the API is always queried by `id`.
 */
export type FieldType =
  /** Single line or long text, used as is (lookups are joined with ", "). */
  | 'text'
  /** Single select; `map` translates option names ("Former player" -> "player"). */
  | 'select'
  /** Checkbox. The API leaves unchecked boxes out, which reads as false. */
  | 'checkbox'
  | 'number'
  /** Long text, one entry per line. */
  | 'lines'
  /** Long text, paragraphs separated by a blank line. */
  | 'paragraphs'
  /** Long text, one `left | right` pair per line (stats, timeline). */
  | 'pairs'
  /** Multiple select (or comma-separated text). */
  | 'list'
  /** URL field holding one https URL (an R2 link). */
  | 'url'
  /** Long text holding https URLs, one per line. */
  | 'urls'
  /** Attachments, rewritten to their mirrored R2 URL with `urlTemplate` (Airtable's own URLs expire after 2 hours). */
  | 'attachment';

export interface FieldRef {
  id: string;
  type: FieldType;
  name?: string;
  map?: Record<string, string>;
  /** For `attachment`: the mirror's URL, with `{id}` (attachment id) and `{filename}` placeholders. */
  urlTemplate?: string;
}

/** Person fields the sync can fill. `images` covers hero, card and gallery. */
export type PersonField = Exclude<keyof Person, 'hero' | 'card' | 'gallery'>;

export const REQUIRED_FIELDS = [
  ...['slug', 'name', 'role', 'roleLabel', 'era', 'pos', 'short', 'honour', 'line', 'stats', 'bio', 'why', 'timeline'],
  ...['talks', 'audiences', 'industries', 'formats', 'langs'],
] as const satisfies readonly PersonField[];
export const OPTIONAL_FIELDS = ['first', 'active', 'limited', 'travelsFrom', 'sameAs'] as const satisfies readonly PersonField[];

export interface AirtableConfig {
  baseId: string;
  tableId: string;
  /** Optional view id (viw…): only its records, in its order unless `order` is mapped. */
  view?: string;
  /** Which records belong to which site: `values` maps a site slug to the value its records carry in `field`. */
  sites: { field: FieldRef; values: Record<string, string> };
  /** Publishing gate (all set conditions must hold); records that fail it are left out, never published. */
  publish: {
    status?: { field: FieldRef; values: string[] };
    consent?: FieldRef;
    archived?: FieldRef;
  };
  fields: Partial<Record<PersonField, FieldRef>>;
  images: {
    /** https origins allowed for photos (the R2 public bucket or custom domain). Anything else is rejected. */
    hosts: string[];
    hero: FieldRef;
    card: FieldRef;
    /** Exactly three images per person. */
    gallery: FieldRef;
  };
  /** Display order (a number field); people without one go last. Ties and the rest sort by slug. */
  order?: FieldRef;
  failClosed: {
    /** The sync fails when more than this share of a site's records are invalid (default 0.1). */
    maxInvalidRatio: number;
    /** The sync fails when a site ends up with fewer people than this (default 1). */
    minPeople: number;
  };
  /** Pagination guard: at 100 records a page (default 50 pages). */
  maxPages: number;
}

const ID = { base: /^app[A-Za-z0-9]{14}$/, table: /^tbl[A-Za-z0-9]{14}$/, view: /^viw[A-Za-z0-9]{14}$/, field: /^fld[A-Za-z0-9]{14}$/ };
const TYPES = new Set<FieldType>([
  'text',
  'select',
  'checkbox',
  'number',
  'lines',
  'paragraphs',
  'pairs',
  'list',
  'url',
  'urls',
  'attachment',
]);

function configError(problems: string[]): ContentError {
  return new ContentError('config', `Airtable config is invalid: ${problems.join('; ')}`, { provider: 'airtable', details: problems });
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Validates a parsed config (config/airtable.example.json shape) and fills defaults. Throws ContentError('config'). */
export function loadAirtableConfig(raw: unknown): AirtableConfig {
  const problems: string[] = [];
  const need = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };
  if (!isObject(raw)) throw configError(['the config must be a JSON object']);
  const field = (value: unknown, path: string): FieldRef | undefined => {
    if (!isObject(value)) {
      problems.push(`${path} must be { "id": "fld…", "type": … }`);
      return undefined;
    }
    need(typeof value.id === 'string' && ID.field.test(value.id), `${path}.id must be a field ID (fld + 14 characters)`);
    need(TYPES.has(value.type as FieldType), `${path}.type must be one of ${[...TYPES].join(', ')}`);
    if (value.type === 'attachment')
      need(
        typeof value.urlTemplate === 'string' && value.urlTemplate.startsWith('https://') && value.urlTemplate.includes('{'),
        `${path}.urlTemplate is required for attachments: Airtable attachment URLs expire, so map the mirrored R2 URL`,
      );
    if (value.map !== undefined)
      need(isObject(value.map) && Object.values(value.map).every(v => typeof v === 'string'), `${path}.map must map strings to strings`);
    return value as unknown as FieldRef;
  };

  need(typeof raw.baseId === 'string' && ID.base.test(raw.baseId), 'baseId must be a base ID (app + 14 characters)');
  need(typeof raw.tableId === 'string' && ID.table.test(raw.tableId), 'tableId must be a table ID (tbl + 14 characters)');
  need(raw.view === undefined || raw.view === null || (typeof raw.view === 'string' && ID.view.test(raw.view)), 'view must be a view ID');

  const sites = isObject(raw.sites) ? raw.sites : {};
  field(sites.field, 'sites.field');
  need(
    isObject(sites.values) && Object.keys(sites.values).length > 0 && Object.values(sites.values).every(v => typeof v === 'string' && v),
    'sites.values must map site slugs to the value their records carry',
  );
  for (const slug of Object.keys(isObject(sites.values) ? sites.values : {}))
    need(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), `sites.values: "${slug}" is not a site slug`);
  // One Airtable value per site: a value shared by two slugs would publish one partner's people on another's site.
  const owners = new Map<unknown, string>();
  for (const [slug, value] of Object.entries(isObject(sites.values) ? sites.values : {})) {
    const owner = owners.get(value);
    need(owner === undefined, `sites.values: "${slug}" and "${owner}" share the value ${JSON.stringify(value)}; each site needs its own`);
    owners.set(value, slug);
  }

  const publish = isObject(raw.publish) ? raw.publish : {};
  need(
    publish.status !== undefined || publish.consent !== undefined,
    'publish needs at least a status or a consent condition (publishing fails closed)',
  );
  if (publish.status !== undefined) {
    const status = isObject(publish.status) ? publish.status : {};
    field(status.field, 'publish.status.field');
    need(Array.isArray(status.values) && status.values.length > 0, 'publish.status.values must list the published option names');
  }
  if (publish.consent !== undefined) field(publish.consent, 'publish.consent');
  if (publish.archived !== undefined) field(publish.archived, 'publish.archived');

  const fields = isObject(raw.fields) ? raw.fields : {};
  for (const key of REQUIRED_FIELDS) {
    if (fields[key] === undefined) problems.push(`fields.${key} is required`);
    else field(fields[key], `fields.${key}`);
  }
  for (const key of OPTIONAL_FIELDS) if (fields[key] !== undefined) field(fields[key], `fields.${key}`);
  for (const key of Object.keys(fields))
    need(([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as string[]).includes(key), `fields.${key} is not a person field`);

  const images = isObject(raw.images) ? raw.images : {};
  let hosts: string[] = [];
  try {
    hosts = parseOrigins(Array.isArray(images.hosts) ? images.hosts.join(',') : '', 'images.hosts');
  } catch (error) {
    problems.push((error as Error).message);
  }
  need(hosts.length > 0, 'images.hosts must list the https origin(s) your R2 images are served from');
  for (const key of ['hero', 'card', 'gallery']) field(images[key], `images.${key}`);
  if (raw.order !== undefined) field(raw.order, 'order');

  const fail = isObject(raw.failClosed) ? raw.failClosed : {};
  const ratio = fail.maxInvalidRatio ?? 0.1;
  const minPeople = fail.minPeople ?? 1;
  need(typeof ratio === 'number' && ratio >= 0 && ratio < 1, 'failClosed.maxInvalidRatio must be a number from 0 to below 1');
  need(Number.isInteger(minPeople) && (minPeople as number) >= 1, 'failClosed.minPeople must be a whole number of at least 1');
  const maxPages = raw.maxPages ?? 50;
  need(Number.isInteger(maxPages) && (maxPages as number) >= 1, 'maxPages must be a whole number of at least 1');

  if (problems.length) throw configError(problems);
  return {
    baseId: raw.baseId as string,
    tableId: raw.tableId as string,
    ...(typeof raw.view === 'string' ? { view: raw.view } : {}),
    sites: sites as AirtableConfig['sites'],
    publish: publish as AirtableConfig['publish'],
    fields: fields as AirtableConfig['fields'],
    images: { ...(images as unknown as AirtableConfig['images']), hosts },
    ...(raw.order !== undefined ? { order: raw.order as FieldRef } : {}),
    failClosed: { maxInvalidRatio: ratio as number, minPeople: minPeople as number },
    maxPages: maxPages as number,
  };
}

/** Every field ID the sync reads (the API's `fields[]`, so responses carry nothing else). */
export function fieldIds(config: AirtableConfig): string[] {
  const refs = [
    config.sites.field,
    config.publish.status?.field,
    config.publish.consent,
    config.publish.archived,
    ...Object.values(config.fields),
    config.images.hero,
    config.images.card,
    config.images.gallery,
    config.order,
  ];
  return [...new Set(refs.filter((ref): ref is FieldRef => ref !== undefined).map(ref => ref.id))].sort();
}

/**
 * The token and the parsed config from the environment:
 *   AIRTABLE_TOKEN        personal access token (scope data.records:read, access to the base only)
 *   AIRTABLE_CONFIG       the config as inline JSON (preferred on Vercel), or
 *   AIRTABLE_CONFIG_FILE  a path to it (default config/airtable.json)
 */
export function airtableEnv(env: Env, cwd = process.cwd()): { token: string; config: unknown } {
  const token = env.AIRTABLE_TOKEN ?? '';
  if (!token)
    throw new ContentError('config', 'PEOPLE_PROVIDER=airtable needs AIRTABLE_TOKEN (a personal access token)', { provider: 'airtable' });
  if (env.AIRTABLE_CONFIG) {
    try {
      return { token, config: JSON.parse(env.AIRTABLE_CONFIG) };
    } catch {
      throw new ContentError('config', 'AIRTABLE_CONFIG is not valid JSON', { provider: 'airtable' });
    }
  }
  const path = env.AIRTABLE_CONFIG_FILE || join(/*turbopackIgnore: true*/ cwd, 'config', 'airtable.json');
  if (!existsSync(path))
    throw new ContentError('config', 'PEOPLE_PROVIDER=airtable needs AIRTABLE_CONFIG (inline JSON) or AIRTABLE_CONFIG_FILE', {
      provider: 'airtable',
    });
  try {
    return { token, config: JSON.parse(readFileSync(path, 'utf8')) };
  } catch {
    throw new ContentError('config', `${env.AIRTABLE_CONFIG_FILE ? 'AIRTABLE_CONFIG_FILE' : 'config/airtable.json'} is not valid JSON`, {
      provider: 'airtable',
    });
  }
}
