// Form → content. Each function applies a submitted form to a copy of the stored content and returns the candidate
// plus form-level errors (things the validator cannot see, such as unparseable JSON). Nothing here writes.
//
// Conventions that keep diffs minimal:
// - optional strings: empty removes the key (the renderer then uses its default), but a stored null stays null;
// - flags: a value equal to the renderer's default removes the key (`active: true` is never written);
// - existing key order is kept, new keys are appended.
import { isKey } from './content.mjs';
import { HOME_IMAGES, LANGS, LAYOUT_FLAGS, NEUTRALS, ORG_TYPES, PAGE_KEYS, STYLE_FIELDS, THEME_COLOURS, VOCAB_KEYS } from './schema.mjs';

export const text = (form, name) => (form.get(name) ?? '').trim();
export const lines = value =>
  value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
/** Image ids: an empty field means "no image" (allowed on shell sites; the validator reports it elsewhere). */
export const imageId = (form, name) => text(form, name) || null;

/** Empty removes the key, except that an explicit stored `null` stays (some files spell "none" that way). */
export function setOptional(target, key, value) {
  if (value !== '' && value !== undefined) target[key] = value;
  else if (target[key] !== null) delete target[key];
}

export function setFlag(target, key, on, defaultValue) {
  if (on === defaultValue) delete target[key];
  else target[key] = on;
}

/** Drops an object-valued key that ended up empty, unless the stored file already had it. */
const tidy = (target, key, had) => {
  if (!had && target[key] && Object.keys(target[key]).length === 0) delete target[key];
};

/** `value | caption` lines → [[value, caption]]. */
export function pairs(form, name, label, errors) {
  return lines(text(form, name)).map((line, i) => {
    const at = line.indexOf('|');
    if (at === -1) {
      errors.push(`${label} line ${i + 1} needs a "|" between the two parts`);
      return [line, ''];
    }
    return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  });
}

/** See colour() in views/html.mjs: the field that changed from `.was` wins, the text field first. */
export function pickColour(form, name) {
  const typed = text(form, name);
  const picked = text(form, `${name}.picker`);
  const was = text(form, `${name}.was`);
  if (typed.toLowerCase() !== was.toLowerCase()) return typed;
  if (picked && picked.toLowerCase() !== was.toLowerCase()) return picked;
  return typed;
}

/** A select whose first option is the renderer's default: the default is written only if the file already had it. */
function setDefaulted(target, stored, key, value, defaultValue) {
  if (value === defaultValue && stored[key] !== defaultValue) delete target[key];
  else target[key] = value;
}

/** A newly ticked `indexable` sits right after `slug` (and `active`): launching a site is the first thing a reviewer sees. */
function launchSwitchFirst(next, stored) {
  if (next.indexable !== true || Object.hasOwn(stored, 'indexable')) return next;
  const { slug, active, indexable, ...rest } = next;
  return { slug, ...(active === undefined ? {} : { active }), indexable, ...rest };
}

/** People ticked in a checkbox group, kept to slugs that exist. */
const ticked = (form, name, people) => {
  const chosen = new Set(form.getAll(name));
  return people.map(person => person.slug).filter(slug => chosen.has(slug));
};

/**
 * Applies the site editor form to a stored site.
 * @param {object} site the stored site (not modified)
 * @param {URLSearchParams} form
 * @param {{ jsonKeys: Set<string> }} options wording keys edited as JSON
 * @returns {{ site: object, errors: string[], raw: Record<string, string> }} `raw` keeps unparseable input for re-display
 */
export function applySiteForm(site, form, { jsonKeys }) {
  const next = structuredClone(site);
  const errors = [];
  const raw = {};

  for (const key of ['orgName', 'short', 'platform', 'platformShort', 'tagline', 'entity', 'copyright', 'stadium', 'waysTitle'])
    next[key] = text(form, key);
  const motto = text(form, 'motto');
  if (motto) next.motto = motto;
  else if (Object.hasOwn(site, 'motto')) next.motto = null;
  next.heroTitle = [text(form, 'heroTitle.0'), text(form, 'heroTitle.1')];

  next.home = { ...site.home };
  for (const spot of ['hero', 'inset']) {
    const card = { ...site.home?.[spot] };
    card.image = imageId(form, `home.${spot}.image`);
    card.name = text(form, `home.${spot}.name`);
    card.line = text(form, `home.${spot}.line`);
    setOptional(card, 'tag', text(form, `home.${spot}.tag`) === 'br' ? 'br' : '');
    next.home[spot] = card;
  }
  for (const [key] of HOME_IMAGES) next.home[key] = imageId(form, `home.${key}`);
  next.home.activeEra = text(form, 'home.activeEra');

  if (form.has('eventSpaces.url')) {
    const config = { ...site.eventSpaces };
    for (const key of ['url', 'heading', 'copy', 'image', 'imageAlt', 'buttonText']) {
      setOptional(config, key, text(form, `eventSpaces.${key}`));
    }
    if (Object.keys(config).length) next.eventSpaces = config;
    else delete next.eventSpaces;
  }

  next.pages = { ...site.pages };
  for (const key of PAGE_KEYS) setFlag(next.pages, key, form.has(`pages.${key}`), true);
  if (Object.keys(next.pages).length === 0) delete next.pages;

  // Search and language. Defaults are left out of the file unless it already spells them out.
  setFlag(next, 'indexable', form.has('indexable'), false);
  setDefaulted(next, site, 'lang', text(form, 'lang'), LANGS[0][0]);
  setDefaulted(next, site, 'orgType', text(form, 'orgType'), ORG_TYPES[0][0]);

  next.theme = { ...site.theme };
  for (const key of THEME_COLOURS) next.theme[key] = pickColour(form, `theme.${key}`);
  next.theme.display = text(form, 'theme.display');
  for (const key of NEUTRALS) setOptional(next.theme, key, text(form, `theme.${key}`));

  next.style = { ...site.style };
  for (const [key] of STYLE_FIELDS) setOptional(next.style, key, text(form, `style.${key}`));
  setFlag(next.style, 'buttonClip', form.has('style.buttonClip'), false);
  tidy(next, 'style', Object.hasOwn(site, 'style'));

  next.homeLayout = { ...site.homeLayout };
  for (const [key] of LAYOUT_FLAGS) setFlag(next.homeLayout, key, form.has(`homeLayout.${key}`), false);
  tidy(next, 'homeLayout', Object.hasOwn(site, 'homeLayout'));

  setFlag(next, 'demoHome', form.has('demoHome'), false);
  const demo = ticked(form, 'demoProfiles', site.people);
  if (demo.length) next.demoProfiles = demo;
  else delete next.demoProfiles;

  // Featured order: the typed number, then the current featured order, then people.json order (sort is stable).
  const rank = (value, fallback = Number.MAX_SAFE_INTEGER) => (value === '' || !Number.isFinite(Number(value)) ? fallback : Number(value));
  const current = slug => (site.featured?.includes(slug) ? site.featured.indexOf(slug) : Number.MAX_SAFE_INTEGER);
  next.featured = ticked(form, 'featured', site.people).sort(
    (a, b) => rank(text(form, `featuredOrder.${a}`)) - rank(text(form, `featuredOrder.${b}`)) || current(a) - current(b),
  );

  next.vocab = { ...site.vocab };
  for (const key of VOCAB_KEYS) {
    const name = `vocab.${key}`;
    const value = text(form, name);
    if (!value) {
      setOptional(next.vocab, key, '');
      continue;
    }
    if (!jsonKeys.has(key)) {
      next.vocab[key] = value;
      continue;
    }
    try {
      next.vocab[key] = JSON.parse(value);
    } catch (error) {
      errors.push(`vocab.${key} is not valid JSON (${error.message})`);
      raw[name] = value;
    }
  }
  return { site: launchSwitchFirst(next, site), errors, raw };
}

/**
 * Reads the New site form. The slug is checked here, before it is used for any path.
 * @returns {{ values: object, options: object|null, errors: string[] }} `options` is input for shellSite()
 */
export function readNewSite(form) {
  const values = {
    slug: text(form, 'slug'),
    name: text(form, 'name'),
    short: text(form, 'short'),
    wordmark: text(form, 'wordmark'),
    crest: text(form, 'crest'),
    publish: form.has('publish'),
  };
  for (const key of THEME_COLOURS) values[key] = pickColour(form, key);
  const errors = [];
  if (!isKey(values.slug)) errors.push('Slug must be lowercase letters, digits and single hyphens (for example man-utd)');
  if (!values.name) errors.push('Organisation name is required');
  if (errors.length) return { values, options: null, errors };
  const blank = value => value || undefined;
  return {
    values,
    errors,
    options: {
      slug: values.slug,
      name: values.name,
      short: blank(values.short),
      brand: values.brand,
      ink: values.ink,
      dark: values.dark,
      bar: values.bar,
      wordmark: blank(values.wordmark),
      crest: blank(values.crest),
    },
  };
}
