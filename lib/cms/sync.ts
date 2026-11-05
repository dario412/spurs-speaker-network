// Airtable → CMS speaker sync for the Spurs site, as in the Credible Creators CMS (a "Sync now" button and a cron
// endpoint): reads the "BM | Tottenham Hotspurs FC" table of PepTalk's base, maps each record to a Person, checks it
// against the content rules (scripts/validate-content.mjs), and saves the speakers through the same validated save as
// the editors. Fields are read by field ID, so renaming a column in Airtable changes nothing.
//
// Airtable owns the speakers, as in Credible's: the site's speakers become exactly the valid records of the table
// (AIRTABLE_SYNC_MODE=merge instead keeps speakers that have no record). Each value comes from the Spurs table first,
// then the speaker's current entry on the site (so curated photos and copy stay until Airtable has its own), then the
// linked PepTalk expert record ("Expert (PepTalk)": profile photo, slug, title, bios, topics). Records marked Unlisted
// are saved hidden (active: false). Records that still fail the content rules are skipped and reported.
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
const EXPERTS_TABLE = 'tbl5kt6S9s9EF35Bt';
/** Field IDs in PepTalk's Experts table (the linked expert record). */
const E = {
  image: 'fldSEe4mIxjyt5MsO',
  slug: 'fldR5crnvyROkmZsi',
  title: 'fldJUPQPQvrgEEMfy',
  eyebrow: 'fldoanv4rqOCwP3iV',
  bullet: 'fldcQPkQd7LieX47v',
  shortBio: 'fld2VRW8Evv6F4oWI',
  longBio: 'fldZFdQuNBHJAKfpK',
  why: 'fld9NCAHaufP7XcJU',
  topics: 'fld7yRk3uUJVlYj4l',
  types: 'fldA7uCYG3kTmeqze',
} as const;
const TYPES_TABLE = 'tblApa6LBQXx1gbFF';
/** PepTalk speaker types that mean a footballer (a Spurs record without "Spurs roles" then counts as an ex-player). */
const FOOTBALL_TYPES = /football|soccer/i;
const LANGUAGE_NAME = 'fldzpsijKspQUiTY6';

/** Field IDs in the Spurs table. */
const F = {
  name: 'fldULiCA3ImdE2nXv',
  expert: 'fldGsYcL6XBSrZhbq',
  headshot: 'fldnTYtyI1qWUAStg',
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

/** Records by id, 20 per request (the linked experts; the Experts table is large). */
async function fetchByIds(table: string, ids: string[]): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const formula = `OR(${ids
      .slice(i, i + 20)
      .map(id => `RECORD_ID()='${id.replace(/[^A-Za-z0-9]/g, '')}'`)
      .join(',')})`;
    const query = new URLSearchParams({ returnFieldsByFieldId: 'true', filterByFormula: formula });
    for (const field of Object.values(E)) query.append('fields[]', field);
    const response = await fetch(`https://api.airtable.com/v0/${SYNC_BASE}/${table}?${query}`, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Airtable answered ${response.status} for ${table}`);
    records.push(...((await response.json()) as { records: AirtableRecord[] }).records);
  }
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

/** The site role, or null when Airtable doesn't say and the linked expert isn't a footballer (shown only once set). */
function roleFor(fields: Fields, expertTypes: string[] = []): Person['role'] | null {
  const roles = list(fields, F.roles).map(role => role.toLowerCase());
  if (!roles.length && !text(fields, F.team) && !expertTypes.some(type => FOOTBALL_TYPES.test(type))) return null;
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
  /** Hidden until "Spurs roles" is set in Airtable. */
  needsRole?: boolean;
}

/** The speaker's slug: the Spurs table's, else the linked expert's (a slug or a profile URL ending in one). */
export function slugFor(spurs: Fields, expert: Fields | undefined): string {
  const own = text(spurs, F.slug).toLowerCase();
  if (own) return own;
  const value = expert ? text(expert, E.slug) : '';
  const last =
    value
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .split('/')
      .pop() ?? '';
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(last.toLowerCase()) ? last.toLowerCase() : '';
}

/** One record → a Person: the Spurs table, then the existing speaker with that slug, then the linked expert record. */
function mapRecord(
  record: AirtableRecord,
  existing: Person | undefined,
  expert: Fields | undefined,
  lookups: { topics: Map<string, string>; languages: Map<string, string>; types: Map<string, string> },
  site: RawSite,
): Mapped | { problem: string } {
  const f = record.fields;
  const x = expert ?? {};
  const expertTypes = list(x, E.types)
    .map(id => lookups.types.get(id))
    .filter((name): name is string => Boolean(name));
  const slug = slugFor(f, expert);
  if (!slug) return { problem: 'no Slug (in this table or on the linked PepTalk expert)' };
  const images: Record<string, string> = {};
  const image = (value: string | null, fallback: string | null | undefined): string | undefined => {
    if (!value) return fallback ?? undefined;
    const id = imageIdFor(value);
    images[id] = value;
    return id;
  };
  const expertImage = url(x, E.image) ?? url(f, F.headshot);
  const hero = image(url(f, F.hero), existing?.hero) ?? image(expertImage, undefined);
  const card = image(url(f, F.card), existing?.card ?? hero);
  const galleryUrls = F.gallery.map(id => url(f, id));
  const gallery: string[] | undefined = galleryUrls.some(Boolean)
    ? galleryUrls.map((value, i) => image(value, existing?.gallery?.[i]) ?? (hero as string))
    : existing?.gallery?.map(id => id ?? (hero as string));
  if (!hero || !card) return { problem: 'no image (add an image URL here or on the linked PepTalk expert)' };
  const formats = new Set<FormatKey>();
  for (const choice of list(f, F.formats)) for (const key of FORMAT_MAP[choice.toLowerCase()] ?? []) formats.add(key);
  if (text(f, F.virtual).toLowerCase() === 'yes') formats.add('virtual');
  const offered = (site.formatKeys ?? ORDER).filter(key => formats.has(key));
  const inferred = roleFor(f, expertTypes);
  // No Spurs role and not a footballer: synced hidden, so nobody is presented as something they are not.
  const role = inferred ?? existing?.role ?? 'player';
  const roleName = (site.roles ?? []).find(item => item.key === role);
  const expertBio = paragraphs(text(x, E.longBio));
  const expertTalks = list(x, E.topics)
    .map(id => lookups.topics.get(id))
    .filter((name): name is string => Boolean(name));
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
    role,
    roleLabel: text(f, F.roleLabel) || existing?.roleLabel || roleName?.singular || roleName?.label || '',
    era: existing?.era ?? site.home.activeEra,
    limited: f[F.limited] === true,
    active: text(f, F.publishing) !== 'Unlisted' && (inferred !== null || existing !== undefined),
    hero,
    card,
    gallery: (gallery ?? [hero, hero, hero]).slice(0, 3),
    pos: text(f, F.pos) || existing?.pos || text(x, E.title) || '',
    short: text(f, F.short) || existing?.short || text(x, E.eyebrow) || '',
    honour: text(f, F.honour) || existing?.honour || text(x, E.bullet) || '',
    line: text(f, F.line) || existing?.line || text(x, E.bullet) || text(x, E.eyebrow) || '',
    stats: stats.length === 4 ? stats : (existing?.stats ?? []),
    bio: paragraphs(text(f, F.bio)).length
      ? paragraphs(text(f, F.bio))
      : existing?.bio?.length
        ? existing.bio
        : expertBio.length
          ? expertBio
          : paragraphs(text(x, E.shortBio)),
    why: text(f, F.why) || existing?.why || text(x, E.why) || text(x, E.shortBio) || '',
    timeline: timeline.length ? timeline : (existing?.timeline ?? []),
    talks: list(f, F.topics)
      .map(id => lookups.topics.get(id))
      .filter((name): name is string => Boolean(name)),
    audiences: list(f, F.audiences).length ? list(f, F.audiences) : (existing?.audiences ?? []),
    industries: list(f, F.industries).length ? list(f, F.industries) : (existing?.industries ?? []),
    formats: offered.length ? offered : existing?.formats?.length ? existing.formats : ['keynote', 'dinner', 'appearance'],
    langs:
      list(f, F.languages)
        .map(id => lookups.languages.get(id) ?? id)
        .join(', ') ||
      existing?.langs ||
      'English',
  };
  const travels = text(f, F.travelsFrom);
  if (travels) person.travelsFrom = travels;
  if (!person.talks.length) person.talks = existing?.talks?.length ? existing.talks : expertTalks;
  return { person, images, featured: f[F.featured] === true, needsRole: inferred === null && existing === undefined };
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
  /** Dry runs: the speakers the site would have, in order. */
  people?: { slug: string; name: string; role: string; active: boolean; hero: string; featured: boolean }[];
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
    const [records, topics, languages, types] = await Promise.all([
      fetchAll(SYNC_TABLE),
      fetchAll(TOPICS_TABLE),
      fetchAll(LANGUAGES_TABLE),
      fetchAll(TYPES_TABLE),
    ]);
    const lookups = {
      topics: new Map(topics.map(record => [record.id, text(record.fields, TOPIC_NAME)])),
      languages: new Map(languages.map(record => [record.id, text(record.fields, LANGUAGE_NAME)])),
      // The Types table's primary field: the first text value.
      types: new Map(types.map(record => [record.id, String(Object.values(record.fields).find(value => typeof value === 'string') ?? '')])),
    };
    const saved = { paths: [] as string[] };
    const content = await cmsContent(startedBy ?? 'airtable-sync', saved);
    const snap = content.snapshot();
    const site = snap.find(SYNC_SITE) as RawSite | null;
    if (!site) throw new Error(`site "${SYNC_SITE}" is not in the registry`);
    const bySlug = new Map(site.people.map(person => [person.slug, person]));
    const expertIds = [...new Set(records.flatMap(record => list(record.fields, F.expert)))];
    const experts = new Map((await fetchByIds(EXPERTS_TABLE, expertIds)).map(record => [record.id, record.fields]));
    const skipped: { name: string; problem: string }[] = [];
    const valid: Mapped[] = [];
    const seen = new Set<string>();
    for (const record of records) {
      const name = text(record.fields, F.name) || record.id;
      const expert = experts.get(list(record.fields, F.expert)[0] ?? '');
      const mapped = mapRecord(record, bySlug.get(slugFor(record.fields, expert)), expert, lookups, site);
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
    const replace = process.env.AIRTABLE_SYNC_MODE !== 'merge';
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
    const live = people.filter(person => person.active !== false);
    const keptFeatured = site.featured.filter(slug => live.some(person => person.slug === slug));
    // Ticked in Airtable, else the current picks that are still live, else the first four live speakers.
    const featured = flagged.length ? flagged : keptFeatured.length ? keptFeatured : live.slice(0, 4).map(person => person.slug);
    const images = Object.assign({}, site.images, ...valid.map(item => item.images));
    const created = valid.filter(item => !bySlug.has(item.person.slug)).length;
    const roleless = valid.filter(item => item.needsRole).map(item => item.person.name);
    const unlisted = valid.filter(item => !item.needsRole && item.person.active === false).map(item => item.person.name);
    const notes = `${roleless.length ? ` Hidden until "Spurs roles" is set: ${roleless.join(', ')}.` : ''}${unlisted.length ? ` Unlisted in Airtable: ${unlisted.join(', ')}.` : ''}`;
    const removed = site.people.length - kept.length - (valid.length - created);
    const next = { ...site, people, images, featured: featured.length ? featured : site.featured };
    if (dryRun) {
      const problems = validateSite(next as never);
      const changed = valid
        .filter(item => JSON.stringify(item.person) !== JSON.stringify(bySlug.get(item.person.slug)))
        .map(item => item.person.name);
      const summary = {
        message: `Preview only, nothing saved: ${valid.length} of ${records.length} records would sync (${people.filter(person => person.active !== false).length} shown on the site)${skipped.length ? `, ${skipped.length} skipped` : ''}${replace ? '' : ' (merge mode)'}${problems.length ? `; the result would fail the content rules: ${problems.slice(0, 2).join('; ')}` : ''}.${notes}`,
        created,
        updated: valid.length - created,
        removed: replace ? removed : 0,
        skipped,
      };
      await finish(problems.length === 0, summary);
      return {
        ok: problems.length === 0,
        message: summary.message,
        tags: [],
        rebuild: false,
        people: people.map(person => ({
          slug: person.slug,
          name: person.name,
          role: person.role,
          active: person.active !== false,
          hero: (person.hero && images[person.hero]) || String(person.hero),
          featured: next.featured.includes(person.slug),
        })),
      };
    }
    const result = await content.saveSite(snap, next, { registry: undefined, message: `content(${SYNC_SITE}): Airtable sync` });
    if (result.problems) throw new Error(`the synced site failed the content rules: ${result.problems.slice(0, 3).join('; ')}`);
    const after = (await cmsContent(startedBy ?? 'airtable-sync', { paths: [] })).snapshot();
    const rebuild = buildShape(snap) !== buildShape(after);
    const summary = {
      message: `${valid.length} of ${records.length} records synced${skipped.length ? `, ${skipped.length} skipped` : ''}${replace ? '' : ' (merge mode)'}.${notes}`,
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
