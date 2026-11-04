// Airtable → CMS speaker sync for the Spurs site, as in the Credible Creators CMS (a "Sync now" button and a cron
// endpoint): reads the "BM | Tottenham Hotspurs FC" table of PepTalk's base, maps each record to a Person, checks it
// against the content rules (scripts/validate-content.mjs), and saves the speakers through the same validated save as
// the editors. Fields are read by field ID, so renaming a column in Airtable changes nothing.
//
// While the Airtable data is being completed the sync MERGES: records update the speaker with the same slug (keeping
// the speaker's photos when Airtable has none) or add a new one; speakers without a record stay as they are. With
// AIRTABLE_SYNC_MODE=replace it works like Credible's: the site's speakers become exactly the valid Airtable records.
// Records marked Unlisted are saved hidden (active: false). Records that fail the rules are skipped and reported.
import { randomUUID } from 'node:crypto';
import { validateSite } from '../../scripts/validate-content.mjs';
import { imageIdFor } from '../content/image-ids.ts';
import type { FormatKey, Person, RawSite } from '../content/types.ts';
import { sql } from './db.ts';
import { buildShape, cmsContent } from './editor.ts';
import { tagsFor } from './publish.ts';
import type { SyncRun } from './views.ts';

export const SYNC_SITE = 'spurs';
export const SYNC_BASE = 'appIlXKUGvaErhWeb';
export const SYNC_TABLE = 'tblo9zhapzhwKIc5e';
export const SYNC_TABLE_NAME = 'BM | Tottenham Hotspurs FC';
const TOPICS_TABLE = 'tblQ8eueE9hbD01Nc';
const TOPIC_NAME = 'flddI60LYcDeDAWf2';
const LANGUAGES_TABLE = 'tblhtREyyZCiPyZtD';
const LANGUAGE_NAME = 'fldzpsijKspQUiTY6';

/** Field IDs in the Spurs table. */
const F = {
  name: 'fldULiCA3ImdE2nXv',
  first: 'fldXhummNUki4ngLP',
  slug: 'fldF7T9szP3ufzdrv',
  status: 'fldC6MrGUlXNOQ4wj',
  team: 'fld3n86gctKl9XXqz',
  roles: 'fld8BPvxvxsU2KHzy',
  roleLabel: 'fld97HYTjp2jboAta',
  limited: 'fld6fxonbnaNIxZz7',
  hero: 'fldIZlznxqIONWiSI',
  card: 'fldgwDZG14E1qFRcs',
  gallery: ['fldvHwbxttMPvbWuS', 'fldp9EuRVt2SxVVmb', 'fldq8U44cftbEJF6O'],
  pos: 'fldiYVsmThwBRHY3U',
  short: 'fldw8Q6ejoJMKTi4Y',
  honour: 'fldhOw0vH9hvIGgPu',
  line: 'fldSBdWpoZcPLQHHD',
  stats: [
    ['fld8BaOdGNQEQkgNF', 'fldsN77xv88vqU82a'],
    ['fldGZKSNzrN8FIa7w', 'fldopj5GsaWO0zwqm'],
    ['fldOD667KxAbPj6FX', 'fldVWaqaCJsARCRXk'],
    ['fldWApXycMuv7CQgo', 'fldbtC93wZnhfGXDq'],
  ],
  bio: 'fldDwXxekXAgXtms7',
  why: 'flduOOtTvhdbYMAmE',
  topics: 'fldEaiz6TXex2Ctrm',
  audiences: 'fld6lYjr2sATY63SJ',
  industries: 'fld6T0IP0LTOk2Eiz',
  formats: 'fldJm9II2WRqurJ0n',
  languages: 'fld7f1ci9NT2WW2Lj',
  publishing: 'fldXN4OZnDHkGpWak',
  featured: 'fldQFWl8MqidKkL01',
  travelsFrom: 'fldO5K1DjuWwn9oDu',
  virtual: 'fld11LWUgofddY8Vn',
  career: [
    ['fldBeZAGk5aL5N71q', 'fldoRbJvBk0QV2PGm'],
    ['fldQQvpbBTRRf8I1J', 'fldl9iWzxy0FO9uKa'],
    ['fldDzS7TwlpyZXjIT', 'fldHA6xDC1OvoQUSZ'],
    ['fldH28ya7mX1eoO7p', 'fldI63doEC2f2N4oZ'],
  ],
} as const;

type Fields = Record<string, unknown>;
interface AirtableRecord {
  id: string;
  fields: Fields;
}

export const airtableSyncConfigured = (): boolean => Boolean(process.env.AIRTABLE_TOKEN);

async function fetchAll(table: string): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset = '';
  do {
    const query = new URLSearchParams({ pageSize: '100', returnFieldsByFieldId: 'true', ...(offset && { offset }) });
    const response = await fetch(`https://api.airtable.com/v0/${SYNC_BASE}/${table}?${query}`, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Airtable answered ${response.status} for ${table}`);
    const page = (await response.json()) as { records: AirtableRecord[]; offset?: string };
    records.push(...page.records);
    offset = page.offset ?? '';
  } while (offset);
  return records;
}

// ---- Cell readers ----
const text = (fields: Fields, id: string): string => {
  const value = fields[id];
  if (Array.isArray(value))
    return value
      .filter(item => typeof item === 'string')
      .join(', ')
      .trim();
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
};
const list = (fields: Fields, id: string): string[] => {
  const value = fields[id];
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)
    : [];
};
const url = (fields: Fields, id: string): string | null => {
  const value = text(fields, id);
  return /^https:\/\/\S+$/.test(value) ? value : null;
};
/** Airtable rich text is markdown: plain paragraphs, formatting marks removed. */
const paragraphs = (value: string): string[] =>
  value
    .split(/\n\s*\n/)
    .map(part =>
      part
        .replace(/\*\*|__|(?<!\w)[*_](?!\s)|(?<!\s)[*_](?!\w)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);

/** Airtable's format choices (old seven and new five) → the site's five formats. */
const FORMAT_MAP: Record<string, FormatKey[]> = {
  keynote: ['keynote', 'dinner'],
  'keynote & fireside chat': ['keynote'],
  'fireside chat': ['keynote'],
  'after-dinner': ['dinner'],
  'after-dinner speaking': ['dinner'],
  hospitality: ['appearance'],
  brand: ['appearance'],
  fan: ['appearance'],
  clinic: ['appearance'],
  appearance: ['appearance'],
  appearances: ['appearance'],
  workshop: ['workshop'],
  'leadership workshops': ['workshop'],
  virtual: ['virtual'],
  'virtual & video': ['virtual'],
};
const ORDER: FormatKey[] = ['keynote', 'dinner', 'appearance', 'workshop', 'virtual'];

function roleFor(fields: Fields): Person['role'] {
  const roles = list(fields, F.roles).map(role => role.toLowerCase());
  if (text(fields, F.team) === "Women's") return 'women';
  if (roles.includes('manager')) return 'manager';
  if (roles.includes('player')) return text(fields, F.status) === 'Current' ? 'squad' : 'player';
  if (roles.some(role => ['coach', 'support', 'media'].includes(role))) return 'staff';
  return 'player';
}

interface Mapped {
  person: Person;
  images: Record<string, string>;
  featured: boolean;
}

/** One record → a Person (merged over the existing speaker with that slug, whose photos and era are kept if needed). */
function mapRecord(
  record: AirtableRecord,
  existing: Person | undefined,
  lookups: { topics: Map<string, string>; languages: Map<string, string> },
  site: RawSite,
): Mapped | { problem: string } {
  const f = record.fields;
  const slug = text(f, F.slug).toLowerCase();
  if (!slug) return { problem: 'no Slug yet' };
  const images: Record<string, string> = {};
  const image = (value: string | null, fallback: string | null | undefined): string | undefined => {
    if (!value) return fallback ?? undefined;
    const id = imageIdFor(value);
    images[id] = value;
    return id;
  };
  const hero = image(url(f, F.hero), existing?.hero);
  const card = image(url(f, F.card), existing?.card ?? hero);
  const galleryUrls = F.gallery.map(id => url(f, id));
  const gallery: string[] | undefined = galleryUrls.some(Boolean)
    ? galleryUrls.map((value, i) => image(value, existing?.gallery?.[i]) ?? (hero as string))
    : existing?.gallery?.map(id => id ?? (hero as string));
  if (!hero || !card) return { problem: 'no hero or card image (add the image URLs in Airtable)' };
  const formats = new Set<FormatKey>();
  for (const choice of list(f, F.formats)) for (const key of FORMAT_MAP[choice.toLowerCase()] ?? []) formats.add(key);
  if (text(f, F.virtual).toLowerCase() === 'yes') formats.add('virtual');
  const offered = (site.formatKeys ?? ORDER).filter(key => formats.has(key));
  const stats = F.stats
    .map(([value, label]) => [text(f, value), text(f, label)] as [string, string])
    .filter(([value, label]) => value && label);
  const timeline = F.career
    .map(([year, entry]) => [text(f, year), text(f, entry)] as [string, string])
    .filter(([year, entry]) => year && entry);
  const person: Person = {
    ...(existing ?? ({} as Person)),
    slug,
    name: text(f, F.name),
    first: text(f, F.first) || text(f, F.name).split(' ')[0],
    role: roleFor(f),
    roleLabel: text(f, F.roleLabel) || existing?.roleLabel || '',
    era: existing?.era ?? site.home.activeEra,
    limited: f[F.limited] === true,
    active: text(f, F.publishing) !== 'Unlisted',
    hero,
    card,
    gallery: (gallery ?? [hero, hero, hero]).slice(0, 3),
    pos: text(f, F.pos) || existing?.pos || '',
    short: text(f, F.short) || existing?.short || '',
    honour: text(f, F.honour) || existing?.honour || '',
    line: text(f, F.line) || existing?.line || '',
    stats: stats.length ? stats : (existing?.stats ?? []),
    bio: paragraphs(text(f, F.bio)).length ? paragraphs(text(f, F.bio)) : (existing?.bio ?? []),
    why: text(f, F.why) || existing?.why || '',
    timeline: timeline.length ? timeline : (existing?.timeline ?? []),
    talks: list(f, F.topics)
      .map(id => lookups.topics.get(id))
      .filter((name): name is string => Boolean(name)),
    audiences: list(f, F.audiences),
    industries: list(f, F.industries),
    formats: offered.length ? offered : (existing?.formats ?? []),
    langs:
      list(f, F.languages)
        .map(id => lookups.languages.get(id) ?? id)
        .join(', ') ||
      existing?.langs ||
      'English',
  };
  const travels = text(f, F.travelsFrom);
  if (travels) person.travelsFrom = travels;
  if (!person.talks.length && existing?.talks) person.talks = existing.talks;
  return { person, images, featured: f[F.featured] === true };
}

/** The validator's problems for one speaker (checked inside the site, so roles, formats and images resolve). */
function problemsFor(site: RawSite, mapped: Mapped): string[] {
  const candidate = { ...site, people: [mapped.person], images: { ...site.images, ...mapped.images }, featured: [mapped.person.slug] };
  return validateSite(candidate as never).filter((problem: string) => problem.includes('people[0]'));
}

export interface SyncResult {
  ok: boolean;
  message: string;
  tags: string[];
  rebuild: boolean;
}

/** `dryRun` maps and checks everything but saves nothing (the "Preview sync" button). */
export async function runSpursSync({
  trigger,
  startedBy,
  dryRun = false,
}: {
  trigger: 'button' | 'cron' | 'preview';
  startedBy: string | null;
  dryRun?: boolean;
}): Promise<SyncResult> {
  const id = randomUUID();
  await sql().query('INSERT INTO cms_sync_runs (id, trigger, started_by) VALUES ($1, $2, $3)', [id, trigger, startedBy]);
  const finish = async (ok: boolean, summary: Record<string, unknown>) =>
    sql().query('UPDATE cms_sync_runs SET finished_at = now(), ok = $2, summary = $3 WHERE id = $1', [id, ok, JSON.stringify(summary)]);
  try {
    if (!airtableSyncConfigured()) throw new Error('AIRTABLE_TOKEN is not set');
    const [records, topics, languages] = await Promise.all([fetchAll(SYNC_TABLE), fetchAll(TOPICS_TABLE), fetchAll(LANGUAGES_TABLE)]);
    const lookups = {
      topics: new Map(topics.map(record => [record.id, text(record.fields, TOPIC_NAME)])),
      languages: new Map(languages.map(record => [record.id, text(record.fields, LANGUAGE_NAME)])),
    };
    const saved = { paths: [] as string[] };
    const content = await cmsContent(startedBy ?? 'airtable-sync', saved);
    const snap = content.snapshot();
    const site = snap.find(SYNC_SITE) as RawSite | null;
    if (!site) throw new Error(`site "${SYNC_SITE}" is not in the registry`);
    const bySlug = new Map(site.people.map(person => [person.slug, person]));
    const skipped: { name: string; problem: string }[] = [];
    const valid: Mapped[] = [];
    const seen = new Set<string>();
    for (const record of records) {
      const name = text(record.fields, F.name) || record.id;
      const mapped = mapRecord(record, bySlug.get(text(record.fields, F.slug).toLowerCase()), lookups, site);
      if ('problem' in mapped) {
        skipped.push({ name, problem: mapped.problem });
        continue;
      }
      if (seen.has(mapped.person.slug)) {
        skipped.push({ name, problem: `slug "${mapped.person.slug}" is used by another record` });
        continue;
      }
      const problems = problemsFor(site, mapped);
      if (problems.length) {
        skipped.push({
          name,
          problem: problems.map(problem => problem.replace(/^[a-z0-9-]+: people\[0\] \([^)]*\)\.?/, '').trim()).join('; '),
        });
        continue;
      }
      seen.add(mapped.person.slug);
      valid.push(mapped);
    }
    const replace = process.env.AIRTABLE_SYNC_MODE === 'replace';
    if (replace && valid.length === 0) throw new Error('no record passed the content rules, so nothing was replaced');
    const synced = new Map(valid.map(item => [item.person.slug, item.person]));
    const kept = replace ? [] : site.people.filter(person => !synced.has(person.slug));
    // Existing order first (updated in place), then new speakers in Airtable order.
    const people = [
      ...site.people.filter(person => synced.has(person.slug)).map(person => synced.get(person.slug) as Person),
      ...kept,
      ...valid.filter(item => !bySlug.has(item.person.slug)).map(item => item.person),
    ];
    if (replace)
      people.sort((a, b) => valid.findIndex(item => item.person.slug === a.slug) - valid.findIndex(item => item.person.slug === b.slug));
    const flagged = valid.filter(item => item.featured && item.person.active !== false).map(item => item.person.slug);
    const featured = flagged.length
      ? flagged
      : site.featured.filter(slug => people.some(person => person.slug === slug && person.active !== false));
    const images = Object.assign({}, site.images, ...valid.map(item => item.images));
    const created = valid.filter(item => !bySlug.has(item.person.slug)).length;
    const removed = site.people.length - kept.length - (valid.length - created);
    const next = { ...site, people, images, featured: featured.length ? featured : site.featured };
    if (dryRun) {
      const problems = validateSite(next as never);
      const changed = valid
        .filter(item => JSON.stringify(item.person) !== JSON.stringify(bySlug.get(item.person.slug)))
        .map(item => item.person.name);
      const summary = {
        message: `Preview only, nothing saved: ${valid.length} of ${records.length} records would sync${changed.length ? ` (would change ${changed.join(', ')})` : ''}${skipped.length ? `, ${skipped.length} skipped` : ''}${replace ? '' : ' (merge mode)'}${problems.length ? `; the result would fail the content rules: ${problems.slice(0, 2).join('; ')}` : ''}.`,
        created,
        updated: valid.length - created,
        removed: replace ? removed : 0,
        skipped,
      };
      await finish(problems.length === 0, summary);
      return { ok: problems.length === 0, message: summary.message, tags: [], rebuild: false };
    }
    const result = await content.saveSite(snap, next, { registry: undefined, message: `content(${SYNC_SITE}): Airtable sync` });
    if (result.problems) throw new Error(`the synced site failed the content rules: ${result.problems.slice(0, 3).join('; ')}`);
    const after = (await cmsContent(startedBy ?? 'airtable-sync', { paths: [] })).snapshot();
    const rebuild = buildShape(snap) !== buildShape(after);
    const summary = {
      message: `${valid.length} of ${records.length} records synced${skipped.length ? `, ${skipped.length} skipped` : ''}${replace ? '' : ' (merge mode)'}.`,
      created,
      updated: valid.length - created,
      removed: replace ? removed : 0,
      skipped,
    };
    await finish(true, summary);
    return {
      ok: true,
      message: `${summary.message}${rebuild ? ' New or removed speakers: the site is rebuilding.' : ''}`,
      tags: tagsFor(saved.paths),
      rebuild,
    };
  } catch (error) {
    const message = `Sync failed: ${(error as Error).message}`;
    await finish(false, { message });
    return { ok: false, message, tags: [], rebuild: false };
  }
}

export async function latestRuns(limit: number): Promise<SyncRun[]> {
  const rows = (await sql().query('SELECT * FROM cms_sync_runs ORDER BY started_at DESC LIMIT $1', [limit])) as {
    started_at: string;
    finished_at: string | null;
    ok: boolean | null;
    trigger: string;
    started_by: string | null;
    summary: SyncRun['summary'];
  }[];
  return rows.map(row => ({
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    ok: row.ok,
    trigger: row.trigger,
    startedBy: row.started_by,
    summary: row.summary ?? {},
  }));
}
