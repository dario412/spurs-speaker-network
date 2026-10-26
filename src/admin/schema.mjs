// What the admin knows about the content shape: shared by the views (to draw fields) and forms.mjs (to read them).
// The validator stays the authority on what is allowed; this only decides how each field is edited.
import { FORMATS, VOCAB } from '../copy/defaults.mjs';

/** Optional pages (mirrors PAGE_DEFAULTS in lib/content/publish.ts; test/admin.test.mjs asserts they stay in sync). */
export const PAGE_KEYS = ['waysToBook', 'hospitality', 'about'];
export const PAGE_LABELS = { waysToBook: 'Ways to book', hospitality: 'Hospitality', about: 'About' };

export const FORMAT_KEYS = Object.keys(FORMATS);

/** Content language (site.json `lang`): <html lang>, og:locale, structured data. The first entry is the default. */
export const LANGS = [
  ['en-GB', 'English (UK) · en-GB'],
  ['en-US', 'English (US) · en-US'],
];
/** schema.org type in structured data (site.json `orgType`). The first entry is the default. */
export const ORG_TYPES = [
  ['SportsTeam', 'Sports team (a club)'],
  ['SportsOrganization', 'Sports organisation (a league, tour or association)'],
];
export const formatLabel = key => FORMATS[key]?.title ?? key;

export const BASICS = [
  ['orgName', 'Organisation name'],
  ['short', 'Short name'],
  ['platform', 'Platform name'],
  ['platformShort', 'Platform short name'],
  ['tagline', 'Tagline'],
  ['entity', 'Entity sentence'],
  ['motto', 'Motto (optional)'],
  ['copyright', 'Copyright holder'],
  ['stadium', 'Venue'],
  ['waysTitle', 'Ways to book title'],
];

export const THEME_COLOURS = ['brand', 'ink', 'dark', 'bar'];
export const NEUTRALS = ['tint', 'line', 'muted', 'mutedDark', 'faint'];
export const HOME_IMAGES = [
  ['eraImage', 'Era image'],
  ['storyImage', 'Event story image'],
  ['hospitalityImage', 'Hospitality image'],
];

/** Style tokens: `null` options mean free text (a CSS length); arrays are the allowed values. */
export const STYLE_FIELDS = [
  ['buttonRadius', 'Button radius', null],
  ['cardRadius', 'Card radius', null],
  ['buttonCase', 'Button case', ['none', 'uppercase']],
  ['headingCase', 'Heading case', ['none', 'uppercase']],
  ['headingStyle', 'Heading style', ['normal', 'italic']],
];
export const LAYOUT_FLAGS = [
  ['waysAfterRoles', 'Ways to book after roles'],
  ['hideEras', 'Hide the eras section'],
];

export const PERSON_STRINGS = [
  ['name', 'Name'],
  ['first', 'First name', 'Used in “Check Thierry’s availability”'],
  ['roleLabel', 'Role label'],
  ['pos', 'Position line', 'Profile header'],
  ['short', 'Short line', 'Cards'],
  ['honour', 'Honour'],
  ['langs', 'Languages'],
  ['travelsFrom', 'Travels from (optional)', 'Defaults to the site’s travelsFrom wording'],
];
export const PERSON_TEXTS = [
  ['line', 'Card line'],
  ['why', 'Why book'],
];
export const PERSON_LISTS = [
  ['bio', 'Bio paragraphs'],
  ['talks', 'Talks'],
  ['audiences', 'Audiences'],
  ['industries', 'Industries'],
];
export const PERSON_PAIRS = [
  ['stats', 'Stats', 'Exactly four lines'],
  ['timeline', 'Timeline', 'Year | event'],
];

/** Every wording key a site may override: VOCAB plus the two keys that have no shared default. */
export const VOCAB_KEYS = [...Object.keys(VOCAB), 'officialSmall', 'currentNoun'];

/**
 * Wording values that are lists or objects are edited as JSON. Most are known from their default; a few defaults
 * are null (e.g. pastEvents), so any key stored as a non-string on some site is treated as JSON too.
 */
export function jsonVocabKeys(sites) {
  const keys = new Set(VOCAB_KEYS.filter(key => VOCAB[key] !== null && typeof VOCAB[key] === 'object'));
  for (const site of sites)
    for (const [key, value] of Object.entries(site.vocab ?? {})) if (value !== null && typeof value === 'object') keys.add(key);
  return keys;
}

export const vocabDefault = key => VOCAB[key];
