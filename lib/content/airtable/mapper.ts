// Airtable records -> Person[] plus the images they use, for one site. Pure (no network, no clock), so the live sync,
// the offline dry run (scripts/airtable-dry-run.mjs) and the tests share it. Each record is mapped by field ID, checked
// against the contract (schema/person.schema.json) and the site's content rules (scripts/validate-content.mjs), and
// either kept or skipped with its problems listed. Nothing is dropped silently: records outside the publishing gate are
// reported as excluded, invalid ones as errors, and assertHealthy() fails the sync when too many are invalid.
import { validateSite } from '../../../scripts/validate-content.mjs';
import { schemaFor } from '../contract/emit.ts';
import { formatErrors, validateSchema } from '../contract/validate.ts';
import { ContentError } from '../errors.ts';
import { imageIdFor } from '../image-ids.ts';
import { pickImages, siteImageIds } from '../publish.ts';
import type { Images, Pair, Person, RawSite } from '../types.ts';
import { type AirtableConfig, type FieldRef, OPTIONAL_FIELDS, type PersonField, REQUIRED_FIELDS } from './config.ts';

/** A record as the API returns it with `returnFieldsByFieldId: true` (CSV rows are converted to this shape). */
export interface AirtableRecord {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
}

export interface SkippedRecord {
  record: string;
  slug?: string;
  problems: string[];
}

export interface ExcludedRecord {
  record: string;
  slug?: string;
  reason: string;
}

export interface MapResult {
  site: string;
  people: Person[];
  images: Images;
  /** Records that belong to the site and passed the publishing gate but could not be published (skipped). */
  errors: SkippedRecord[];
  /** Records of this site left out by the publishing gate (not published, no consent, archived). */
  excluded: ExcludedRecord[];
}

type Value = string | number | boolean | string[] | Pair[] | undefined;

const STRING_FIELDS = new Set<PersonField>([
  ...['slug', 'name', 'first', 'role', 'roleLabel', 'era', 'pos', 'short', 'honour', 'line', 'why', 'langs', 'travelsFrom'],
] as PersonField[]);
const BOOLEAN_FIELDS = new Set<PersonField>(['active', 'limited']);
const PAIR_FIELDS = new Set<PersonField>(['stats', 'timeline']);

const trimmed = (items: string[]): string[] => items.map(item => item.trim()).filter(Boolean);

function asText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(asText).filter((part): part is string => part !== undefined);
    return parts.length ? parts.join(', ') : undefined;
  }
  if (value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string')
    return asText((value as { name: string }).name);
  return undefined;
}

const asList = (value: unknown, split: RegExp): string[] =>
  Array.isArray(value) ? trimmed(value.map(item => asText(item) ?? '')) : typeof value === 'string' ? trimmed(value.split(split)) : [];

const mapped = (ref: FieldRef, value: string): string => ref.map?.[value] ?? value;

/** Reads one cell by its configured type. Returns a problem string instead of throwing. */
function readCell(record: AirtableRecord, ref: FieldRef): { value: Value } | { problem: string } {
  const cell = record.fields[ref.id];
  switch (ref.type) {
    case 'text':
    case 'url':
      return { value: asText(cell) };
    case 'select': {
      const text = asText(cell);
      return { value: text === undefined ? undefined : mapped(ref, text) };
    }
    case 'checkbox':
      return { value: cell === true };
    case 'number':
      return typeof cell === 'number' || cell === undefined ? { value: cell as number | undefined } : { problem: 'is not a number' };
    case 'lines':
      return { value: asList(cell, /\r?\n/) };
    case 'paragraphs':
      return { value: typeof cell === 'string' ? trimmed(cell.split(/\r?\n[ \t]*\r?\n/)) : asList(cell, /\r?\n/) };
    case 'list':
      return { value: asList(cell, /,/).map(item => mapped(ref, item)) };
    case 'urls':
      return { value: asList(cell, /\s+/) };
    case 'pairs': {
      const pairs: Pair[] = [];
      for (const line of asList(cell, /\r?\n/)) {
        const at = line.indexOf('|');
        if (at < 0) return { problem: `line "${line}" needs "left | right"` };
        pairs.push([line.slice(0, at).trim(), line.slice(at + 1).trim()]);
      }
      return { value: pairs };
    }
    case 'attachment': {
      if (cell === undefined) return { value: [] };
      if (typeof cell === 'string')
        return { problem: 'attachments cannot be read from a CSV export (no attachment ids); use the JSON export or a URL field' };
      if (!Array.isArray(cell)) return { problem: 'is not an attachment list' };
      const urls: string[] = [];
      for (const item of cell as { id?: unknown; filename?: unknown }[]) {
        if (typeof item?.id !== 'string' || typeof item.filename !== 'string')
          return { problem: 'has an attachment without id or filename' };
        urls.push(
          (ref.urlTemplate ?? '')
            .replaceAll('{id}', encodeURIComponent(item.id))
            .replaceAll('{filename}', encodeURIComponent(item.filename)),
        );
      }
      return { value: urls };
    }
  }
}

const empty = (value: Value): boolean => value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
const label = (key: string, ref: FieldRef): string => `${key} (${ref.name ? `"${ref.name}", ` : ''}${ref.id})`;

/** True when the record belongs to the site (`sites.values[slug]` equals the cell, or is one of its items). */
export function belongsTo(record: AirtableRecord, config: AirtableConfig, site: string): boolean {
  const wanted = config.sites.values[site];
  if (wanted === undefined) return false;
  const cell = record.fields[config.sites.field.id];
  const values = Array.isArray(cell) ? cell.map(item => asText(item)) : typeof cell === 'string' ? [cell.trim()] : [];
  return values.includes(wanted);
}

/** Why the publishing gate leaves the record out, or null when it may be published. Fails closed on missing values. */
export function publishBlock(record: AirtableRecord, config: AirtableConfig): string | null {
  const { status, consent, archived } = config.publish;
  if (status) {
    const value = asText(record.fields[status.field.id]);
    if (value === undefined || !status.values.includes(value))
      return `not published (status ${value === undefined ? 'empty' : `"${value}"`})`;
  }
  if (consent && record.fields[consent.id] !== true) return 'no consent recorded';
  if (archived && record.fields[archived.id] === true) return 'archived';
  return null;
}

let personSchema: ReturnType<typeof schemaFor> | undefined;

/** Maps one record. Returns the person and its images, or the problems that stop it being published. */
export function mapRecord(
  record: AirtableRecord,
  config: AirtableConfig,
  site: RawSite,
): { person: Person; images: Images } | { problems: string[] } {
  const problems: string[] = [];
  // Fields already reported, so the schema check below doesn't repeat them.
  const reported = new Set<string>();
  const person: Record<string, unknown> = {};
  for (const key of [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as PersonField[]) {
    const ref = config.fields[key];
    if (!ref) continue;
    const read = readCell(record, ref);
    if ('problem' in read) {
      problems.push(`${label(key, ref)} ${read.problem}`);
      reported.add(key);
      continue;
    }
    let value = read.value;
    if (BOOLEAN_FIELDS.has(key)) {
      person[key] = value === true;
      continue;
    }
    if (empty(value)) {
      if ((REQUIRED_FIELDS as readonly string[]).includes(key)) {
        problems.push(`${label(key, ref)} is empty`);
        reported.add(key);
      }
      continue;
    }
    if (STRING_FIELDS.has(key) && Array.isArray(value)) value = value.join(', ');
    else if (!STRING_FIELDS.has(key) && !PAIR_FIELDS.has(key) && typeof value === 'string') value = [value];
    person[key] = value;
  }
  person.limited ??= false;
  if (person.first === undefined && typeof person.name === 'string') person.first = person.name.split(/\s+/)[0];

  const images: Images = {};
  const photo = (key: 'hero' | 'card' | 'gallery'): string[] => {
    const ref = config.images[key];
    const read = readCell(record, ref);
    if ('problem' in read) {
      problems.push(`${label(key, ref)} ${read.problem}`);
      return [];
    }
    const urls = Array.isArray(read.value) ? (read.value as string[]) : typeof read.value === 'string' ? [read.value] : [];
    const ids: string[] = [];
    for (const url of urls) {
      const parsed = URL.canParse(url) ? new URL(url) : null;
      if (parsed?.protocol !== 'https:') problems.push(`${label(key, ref)} "${url}" is not an https URL`);
      else if (!config.images.hosts.includes(parsed.origin))
        problems.push(`${label(key, ref)} ${parsed.origin} is not an allowed image host (images.hosts)`);
      else {
        const id = imageIdFor(url);
        images[id] = url;
        ids.push(id);
      }
    }
    return ids;
  };
  const [hero] = photo('hero');
  const [card] = photo('card');
  const gallery = photo('gallery');
  if (hero === undefined) problems.push(`${label('hero', config.images.hero)} has no usable image`);
  if (card === undefined) problems.push(`${label('card', config.images.card)} has no usable image`);
  if (gallery.length !== 3) problems.push(`${label('gallery', config.images.gallery)} needs exactly 3 images (has ${gallery.length})`);
  // Image problems are reported above; a stand-in id lets the checks below still report every other field.
  const pending = 'pending-image';

  // Key order as in people.json, so mapped people diff cleanly against the JSON files.
  const ordered = {
    slug: person.slug,
    name: person.name,
    first: person.first,
    ...(person.active !== undefined && { active: person.active }),
    role: person.role,
    roleLabel: person.roleLabel,
    era: person.era,
    limited: person.limited,
    hero: hero ?? pending,
    card: card ?? pending,
    gallery: gallery.length === 3 ? gallery : [pending, pending, pending],
    pos: person.pos,
    short: person.short,
    honour: person.honour,
    line: person.line,
    stats: person.stats,
    bio: person.bio,
    why: person.why,
    timeline: person.timeline,
    talks: person.talks,
    audiences: person.audiences,
    industries: person.industries,
    formats: person.formats,
    langs: person.langs,
    ...(person.travelsFrom !== undefined && { travelsFrom: person.travelsFrom }),
    ...(person.sameAs !== undefined && { sameAs: person.sameAs }),
  } as Person;

  personSchema ??= schemaFor('person');
  const shape = formatErrors(validateSchema(personSchema, ordered))
    .map(problem => problem.replace(/^\//, ''))
    .filter(problem => !reported.has(problem.split(/[/ ]/)[0]));
  if (problems.length || shape.length) return { problems: [...problems, ...shape] };

  // The site's own content rules (role and era exist, formats, review notes, sameAs), applied to this person alone.
  const probe = {
    ...site,
    people: [ordered],
    images: { ...pickImages(site.images, siteImageIds(site)), ...images },
    featured: [ordered.slug],
    demoProfiles: [],
    licences: { images: {}, marks: {} },
    verification: { pages: {}, people: {} },
  };
  const prefix = `${site.slug}: people[0] (${ordered.slug})`;
  const rules = validateSite(probe)
    .filter(problem => problem.startsWith(prefix))
    .map(problem => problem.slice(prefix.length).replace(/^\./, '').trim());
  return rules.length ? { problems: rules } : { person: ordered, images };
}

const orderOf = (record: AirtableRecord, config: AirtableConfig): number => {
  const value = config.order ? record.fields[config.order.id] : undefined;
  return typeof value === 'number' ? value : Number.POSITIVE_INFINITY;
};
const slugOf = (record: AirtableRecord, config: AirtableConfig): string | undefined =>
  config.fields.slug ? asText(record.fields[config.fields.slug.id]) : undefined;

/**
 * Maps every record that belongs to `site`. Deterministic: records are sorted by the order field, then slug, then
 * record id, whatever order the source returned them in. A slug used twice keeps the first and skips the rest.
 */
export function mapRecords(records: AirtableRecord[], config: AirtableConfig, site: RawSite): MapResult {
  const result: MapResult = { site: site.slug, people: [], images: {}, errors: [], excluded: [] };
  const mine = records
    .filter(record => belongsTo(record, config, site.slug))
    .sort(
      (a, b) =>
        orderOf(a, config) - orderOf(b, config) ||
        (slugOf(a, config) ?? '').localeCompare(slugOf(b, config) ?? '') ||
        a.id.localeCompare(b.id),
    );
  const owners = new Map<string, string>();
  for (const record of mine) {
    const slug = slugOf(record, config);
    const blocked = publishBlock(record, config);
    if (blocked) {
      result.excluded.push({ record: record.id, slug, reason: blocked });
      continue;
    }
    const mappedRecord = mapRecord(record, config, site);
    if ('problems' in mappedRecord) {
      result.errors.push({ record: record.id, slug, problems: mappedRecord.problems });
      continue;
    }
    const owner = owners.get(mappedRecord.person.slug);
    if (owner) {
      result.errors.push({ record: record.id, slug, problems: [`slug "${mappedRecord.person.slug}" is already used by ${owner}`] });
      continue;
    }
    owners.set(mappedRecord.person.slug, record.id);
    result.people.push(mappedRecord.person);
    Object.assign(result.images, mappedRecord.images);
  }
  return result;
}

/** `rec… (slug): problem; problem` lines for logs and the dry run. */
export const describeSkipped = (errors: SkippedRecord[]): string[] =>
  errors.map(error => `${error.record}${error.slug ? ` (${error.slug})` : ''}: ${error.problems.join('; ')}`);

/** Fails closed: throws when too many records were skipped, or too few people remain. */
export function assertHealthy(result: MapResult, config: AirtableConfig): void {
  const total = result.people.length + result.errors.length;
  const ratio = total ? result.errors.length / total : 0;
  if (ratio > config.failClosed.maxInvalidRatio)
    throw new ContentError(
      'invalid_content',
      `Airtable sync for ${result.site}: ${result.errors.length} of ${total} records are invalid (more than ${Math.round(config.failClosed.maxInvalidRatio * 100)}%)`,
      { provider: 'airtable', details: describeSkipped(result.errors) },
    );
  if (result.people.length < config.failClosed.minPeople)
    throw new ContentError(
      'invalid_content',
      `Airtable sync for ${result.site}: ${result.people.length} publishable people (at least ${config.failClosed.minPeople} required)`,
      { provider: 'airtable', details: describeSkipped(result.errors) },
    );
}

/** Whole-site rules (featured people, demo profiles) for the site with the synced people. Empty when it is fine. */
export function siteProblems(site: RawSite, result: Pick<MapResult, 'people' | 'images'>): string[] {
  const merged = {
    ...site,
    people: result.people,
    images: { ...pickImages(site.images, siteImageIds(site)), ...result.images },
    licences: { images: {}, marks: {} },
    verification: { pages: {}, people: {} },
  };
  return validateSite(merged);
}
