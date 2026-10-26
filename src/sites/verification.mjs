// Verification checklists for every built page and visible profile (src/sites/<slug>/verification.json).
// Shared by the validator, the admin and `npm run validate`. Nothing here renders, and missing checks never block.
//
// Staleness: each record stores a fingerprint of the content it was checked against. When that content changes, the
// ticks stay but count as unverified ("changed since verification") until someone re-confirms them.
// Fingerprints hash content fields, not rendered HTML: HTML changes with every template refactor and would mark
// every page stale on unrelated deploys (see docs/content-model.md#verificationjson for what each one covers).
import { createHash } from 'node:crypto';
// The app's own page switches (lib/content/publish.ts), so "built" means what `next build` builds.
import { pagesFor } from '../../lib/content/publish.ts';

const GENERIC = [
  ['copy', 'Copy reviewed', 'Every heading and paragraph read in context; wording suits this organisation.'],
  ['links', 'Links and CTAs work', 'Every button and link goes to the right place (check in preview).'],
  ['mobile', 'Mobile reviewed', 'Checked at phone width: nothing clipped, overlapping or unreadable.'],
];

/** Checklist items per kind of entry. Keys are stored in verification.json, so never rename one; add new keys. */
export const CHECKLISTS = {
  profile: [
    ['photos', 'Correct person in every photo', 'Hero, card and all three gallery images show this person, identifiably.'],
    ['facts', 'Facts and stats checked', 'Dates, clubs, honours and the four stats match a reliable source; nothing contested.'],
    ['availability', 'Current role and availability checked', 'The "limited" flag and role reflect what they do today.'],
    ['original', 'Bio is original', 'No copied text and no quotes, real or invented.'],
    ['sensitive', 'No sensitive topics', 'Nothing medical, legal or about their personal life.'],
    ['consent', 'Consent from the person or agent', 'Written consent to appear and to the formats offered.'],
    ['formats', 'Formats and talks are appropriate', 'Talk topics, audiences and formats are ones they would actually do.'],
  ],
  home: [
    ['copy', 'Wording reviewed', 'Hero, sections and footer wording read in context.'],
    ['hero', 'Hero and inset people correct', 'Right people, and the name cards do not cover faces.'],
    ['featured', 'Featured people current', 'Everyone featured is still right to feature this season.'],
    ['brand', 'Brand colours and marks match guidelines', 'Colours, crest and wordmark as the organisation supplies them.'],
    ['mobile', 'Mobile reviewed', 'Checked at phone width: nothing clipped, overlapping or unreadable.'],
  ],
  legends: GENERIC,
  waysToBook: GENERIC,
  hospitality: [
    ...GENERIC,
    ['claims', 'Venue and hospitality claims approved', 'The organisation has approved what is said about its venue and hospitality.'],
  ],
  about: [...GENERIC, ['faq', 'FAQ answers approved', 'Every FAQ answer approved by PepTalk and the organisation.']],
  checkAvailability: GENERIC,
};

/** Site pages in nav order: key, label, path under /<slug>. */
export const PAGES = [
  ['home', 'Home', ''],
  ['legends', 'Legends index', '/legends'],
  ['waysToBook', 'Ways to book', '/ways-to-book'],
  ['hospitality', 'Hospitality', '/hospitality'],
  ['about', 'About', '/about'],
  ['checkAvailability', 'Check availability', '/check-availability'],
];
const PAGE_KEYS = new Set(PAGES.map(([key]) => key));

export const emptyVerification = () => ({ pages: {}, people: {} });
export const normaliseVerification = v => ({ pages: { ...v?.pages }, people: { ...v?.people } });
export const hasVerification = v => ['pages', 'people'].some(group => Object.keys(v?.[group] ?? {}).length > 0);

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const visible = items => (items ?? []).filter(item => item.active !== false);

/** Pages the app builds for this site, with the same switches as the app (pagesFor in lib/content/publish.ts). */
export function builtPages(site) {
  const pages = pagesFor(site);
  return PAGES.filter(([key]) => pages[key] ?? true);
}

// Site-wide fields every page shows (header, footer, wording, theme). Page-specific content is added per page below.
const SHARED = ['orgName', 'short', 'platform', 'platformShort', 'tagline', 'entity', 'motto', 'copyright', 'marks', 'navMark'];
const SHARED_MORE = [
  ...['crestOn', 'crestOnLight', 'crestFallback', 'theme', 'style', 'vocab', 'roles', 'pages', 'stadium', 'waysTitle'],
  'lang',
  'eventSpaces',
];
const pick = (object, keys) => Object.fromEntries(keys.filter(key => object?.[key] !== undefined).map(key => [key, object[key]]));
const card = (site, person) => ({
  ...pick(person, ['slug', 'name', 'short', 'role', 'roleLabel', 'era', 'limited', 'card']),
  cardUrl: site.images?.[person.card] ?? null,
});

/** The content each page's fingerprint covers. */
function pageContent(site, key) {
  const shared = { ...pick(site, [...SHARED, ...SHARED_MORE]), eventSpacesImage: site.images?.[site.eventSpaces?.image] ?? null };
  const people = visible(site.people);
  const extra = {
    home: () => ({
      heroTitle: site.heroTitle,
      home: site.home,
      homeLayout: site.homeLayout,
      demoHome: site.demoHome,
      eras: site.eras,
      images: ['hero', 'inset'].map(spot => site.images?.[site.home?.[spot]?.image] ?? null),
      featured: (site.featured ?? [])
        .map(slug => people.find(person => person.slug === slug))
        .filter(Boolean)
        .map(p => card(site, p)),
    }),
    legends: () => ({ eras: site.eras, people: people.map(person => card(site, person)) }),
    waysToBook: () => ({ formats: site.formats }),
    hospitality: () => ({ formats: site.formats?.hospitality, image: site.images?.[site.home?.hospitalityImage] ?? null }),
    about: () => ({ faqOverrides: site.faqOverrides }),
    checkAvailability: () => ({ formats: site.formats }),
  }[key];
  return { shared, page: extra?.() ?? null };
}

export const pageFingerprint = (site, key) => hash(pageContent(site, key));
/** A person's entry plus the files their image ids point at (a swapped photo changes what "correct person" means). */
export const personFingerprint = (site, person) =>
  hash({ person, images: [person.hero, person.card, ...(person.gallery ?? [])].map(id => site.images?.[id] ?? null) });

/** Status of one record against its checklist and current fingerprint. */
export function recordStatus(record, checklist, fingerprint) {
  const keys = new Set(checklist.map(([key]) => key));
  const checked = Object.keys(record?.items ?? {}).filter(key => keys.has(key)).length;
  const stale = checked > 0 && record.fingerprint !== fingerprint;
  const done = stale ? 0 : checked;
  const total = checklist.length;
  const state = stale ? 'changed' : done === total ? 'verified' : done > 0 ? 'progress' : 'none';
  return { done, checked, total, stale, state };
}

/**
 * Every entry that counts (built pages, visible people) with its status and current fingerprint.
 * @returns {{ group: 'pages'|'people', key: string, label: string, path: string, checklist: [string,string,string][],
 *   fingerprint: string, record: object|undefined, done: number, checked: number, total: number, stale: boolean, state: string }[]}
 */
export function verificationEntries(site) {
  const v = normaliseVerification(site.verification);
  const entry = (group, key, label, path, checklist, fingerprint) => ({
    group,
    key,
    label,
    path: `/${site.slug}${path}`,
    checklist,
    fingerprint,
    record: v[group][key],
    ...recordStatus(v[group][key], checklist, fingerprint),
  });
  return [
    ...builtPages(site).map(([key, label, path]) => entry('pages', key, label, path, CHECKLISTS[key], pageFingerprint(site, key))),
    ...visible(site.people).map(person =>
      entry('people', person.slug, person.name, `/legends/${person.slug}`, CHECKLISTS.profile, personFingerprint(site, person)),
    ),
  ];
}

/**
 * Per entry `{ done, total, stale }` keyed `group:key`, plus site totals: `verified` entries of `total`, `stale` count.
 */
export function verificationStatus(site) {
  const entries = verificationEntries(site);
  return {
    entries: Object.fromEntries(
      entries.map(e => [`${e.group}:${e.key}`, { done: e.done, total: e.total, stale: e.stale, state: e.state }]),
    ),
    total: entries.length,
    verified: entries.filter(e => e.state === 'verified').length,
    stale: entries.filter(e => e.stale).length,
  };
}

/** `spurs: 3/58 pages and profiles verified (2 changed)` for `npm run validate`. */
export function verificationSummary(site) {
  const { total, verified, stale } = verificationStatus(site);
  return `${site.slug}: ${verified}/${total} pages and profiles verified${stale ? ` (${stale} changed)` : ''}`;
}

/** Drops records for people who no longer exist, so deleting someone never fails validation. */
export function pruneVerification(site) {
  const v = normaliseVerification(site.verification);
  const people = new Set((site.people ?? []).map(person => person.slug));
  for (const slug of Object.keys(v.people)) if (!people.has(slug)) delete v.people[slug];
  return { ...site, verification: v };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Shape errors in verification.json (problems). Missing or stale checks are warnings, never errors. */
export function verificationProblems(site) {
  const problems = [];
  const at = (path, message) => problems.push(`${site.slug ?? '?'}: verification.${path} ${message}`);
  const v = site.verification;
  if (v === undefined) return problems;
  if (!isObject(v)) {
    at('json', 'must be an object with "pages" and "people"');
    return problems;
  }
  for (const key of Object.keys(v))
    if (key === 'stories') at(key, 'is no longer supported (stories were removed); delete it');
    else if (!['pages', 'people'].includes(key)) at(key, 'is not a verification key (pages, people)');
  const people = new Set((site.people ?? []).map(person => person.slug));
  const groups = {
    pages: [key => PAGE_KEYS.has(key), key => CHECKLISTS[key], `is not a page (${[...PAGE_KEYS].join(', ')})`],
    people: [key => people.has(key), () => CHECKLISTS.profile, 'is not a person in people.json'],
  };
  for (const [group, [known, checklist, unknown]] of Object.entries(groups)) {
    const records = v[group] ?? {};
    if (!isObject(records)) {
      at(group, 'must be an object');
      continue;
    }
    for (const [key, record] of Object.entries(records)) {
      const path = `${group}.${key}`;
      if (!known(key)) {
        at(path, unknown);
        continue;
      }
      if (!isObject(record)) {
        at(path, 'must be an object with items and fingerprint');
        continue;
      }
      for (const field of Object.keys(record))
        if (!['items', 'fingerprint'].includes(field)) at(`${path}.${field}`, 'is not a field (items, fingerprint)');
      if (typeof record.fingerprint !== 'string' || !record.fingerprint)
        at(`${path}.fingerprint`, 'is required (the content hash at check time)');
      if (!isObject(record.items ?? {})) at(`${path}.items`, 'must be an object');
      const items = new Set(checklist(key).map(([item]) => item));
      for (const [item, tick] of Object.entries(isObject(record.items) ? record.items : {})) {
        if (!items.has(item)) at(`${path}.items.${item}`, `is not a checklist item (${[...items].join(', ')})`);
        else if (!isObject(tick) || !DATE.test(String(tick.checkedAt))) at(`${path}.items.${item}`, 'needs a YYYY-MM-DD checkedAt');
        else
          for (const field of Object.keys(tick))
            if (!['checkedAt', 'note'].includes(field) || (field === 'note' && typeof tick.note !== 'string'))
              at(`${path}.items.${item}.${field}`, 'is not valid (checkedAt, optional note text)');
      }
    }
  }
  return problems;
}
