// Form → people.json entries / licences.json / verification.json. Same rules as forms.mjs: candidates only, the validator decides.
import { licenceAssets, londonToday, normaliseLicences } from '../sites/licences.mjs';
import { isKey } from './content.mjs';
import { imageId, lines, pairs, setFlag, setOptional, text } from './forms.mjs';
import { FORMAT_KEYS, PERSON_LISTS, PERSON_PAIRS, PERSON_STRINGS, PERSON_TEXTS } from './schema.mjs';

const IMAGE_ID = /^[A-Za-z0-9_-]+$/;

/** A deliberately incomplete person: the editor opens with it and the validator lists what still needs filling in. */
export function personTemplate({ slug, name }, site) {
  return {
    slug,
    name,
    first: name.split(/\s+/)[0] ?? '',
    role: site.roles?.[0]?.key ?? '',
    roleLabel: site.roles?.[0]?.singular ?? '',
    era: site.eras?.[0]?.key ?? '',
    limited: false,
    hero: null,
    gallery: [null, null, null],
    card: null,
    pos: '',
    short: '',
    honour: '',
    line: '',
    stats: [],
    bio: [],
    why: '',
    timeline: [],
    talks: [],
    audiences: [],
    industries: [],
    formats: [],
    langs: 'English',
  };
}

/** The mini "Add person" form (slug + name). Checked before the slug goes anywhere near a path. */
export function readNewPerson(form, site) {
  const slug = text(form, 'slug');
  const name = text(form, 'name');
  const errors = [];
  if (!isKey(slug)) errors.push('Slug must be lowercase letters, digits and single hyphens (for example harry-kane)');
  else if (site.people.some(person => person.slug === slug)) errors.push(`"${slug}" already exists on this site`);
  if (!name) errors.push('Name is required');
  return { slug, name, errors };
}

/**
 * Applies the person editor to a person (stored, or a template when creating).
 * @returns {{ person: object, images: Record<string, string>, errors: string[] }} `images` is the site's images.json
 *   with any image added on this form
 */
export function applyPersonForm(person, form, site) {
  const next = structuredClone(person);
  const errors = [];
  for (const [key] of PERSON_STRINGS) {
    if (key === 'travelsFrom') setOptional(next, key, text(form, key));
    else next[key] = text(form, key);
  }
  for (const [key] of PERSON_TEXTS) next[key] = text(form, key);
  for (const [key] of PERSON_LISTS) next[key] = lines(text(form, key));
  // Optional list: empty removes it (an explicit stored [] stays), the validator checks https and duplicates.
  const sameAs = lines(text(form, 'sameAs'));
  if (sameAs.length || (Array.isArray(person.sameAs) && person.sameAs.length === 0)) next.sameAs = sameAs;
  else delete next.sameAs;
  for (const [key, label] of PERSON_PAIRS) next[key] = pairs(form, key, label, errors);
  next.role = text(form, 'role');
  next.era = text(form, 'era');
  next.limited = form.has('limited');
  setFlag(next, 'active', form.has('active'), true);
  // Stored order is kept (profiles list formats in that order); newly ticked ones are appended.
  const chosen = new Set(form.getAll('formats').filter(key => FORMAT_KEYS.includes(key)));
  next.formats = [...new Set([...(person.formats ?? []), ...FORMAT_KEYS])].filter(key => chosen.has(key));
  next.hero = imageId(form, 'hero');
  next.card = imageId(form, 'card');
  next.gallery = [0, 1, 2].map(i => imageId(form, `gallery.${i}`));

  const images = { ...site.images };
  const newId = text(form, 'newImage.id');
  const newUrl = text(form, 'newImage.url');
  if (newId || newUrl) {
    if (!IMAGE_ID.test(newId)) errors.push('New image id must be letters, digits, hyphens or underscores (a Getty id is just digits)');
    else if (!newUrl) errors.push('New image needs a URL');
    else if (Object.hasOwn(images, newId) && images[newId] !== newUrl)
      errors.push(`Image ${newId} already exists with a different URL; edit it in images.json`);
    else images[newId] = newUrl;
  }
  return { person: next, images, errors };
}

/** Row key for a licensable asset: `image:<id>` or `mark:<crest|wordmark>`. */
export const assetKey = asset => `${asset.kind}:${asset.id}`;

/**
 * Applies the Licences tab. Only rows listed in `row` (the ones on screen) change, so the "unapproved only" filter
 * never touches hidden approvals. Ticked rows are approved for the URL in use now; a row that was ticked and is now
 * unticked loses its entry. A stale approval nobody touched is kept, so it keeps showing as "changed since approval".
 * The "Approve all shown" button (`all`) ticks every listed row.
 * @returns {{ licences: object }}
 */
export function applyLicenceForm(site, form, today = londonToday()) {
  const licences = normaliseLicences(site.licences);
  const assets = new Map(licenceAssets(site).map(asset => [assetKey(asset), asset]));
  const ticked = new Set(form.getAll('approve'));
  const all = form.has('all');
  for (const key of new Set(form.getAll('row'))) {
    const asset = assets.get(key);
    if (!asset) continue;
    const group = asset.kind === 'image' ? licences.images : licences.marks;
    const note = text(form, `note.${key}`);
    if (all || ticked.has(key)) {
      // Re-approving keeps the original date; a new or changed file is approved today.
      const approvedAt = asset.status === 'licensed' ? asset.entry.approvedAt : today;
      group[asset.id] = { url: asset.url, ...(note ? { note } : {}), ...(approvedAt ? { approvedAt } : {}) };
    } else if (form.get(`was.${key}`) === 'on') {
      delete group[asset.id];
    } else if (group[asset.id]) {
      const entry = { ...group[asset.id] };
      setOptional(entry, 'note', note);
      group[asset.id] = entry;
    }
  }
  return { licences };
}

/**
 * Applies a verification checklist form to one entry (see verificationEntries in src/sites/verification.mjs).
 * The saved record is stamped with the content fingerprint as it is now, so saving re-confirms a stale checklist.
 * Ticks already confirmed against the current content keep their date; new or re-confirmed ones are dated today.
 * The "Check all" button (`all`) ticks every item.
 * @returns {object|null} the record, or null when nothing is ticked (the record is then removed)
 */
export function applyChecklistForm(entry, form, today = londonToday()) {
  const ticked = new Set(form.getAll('item'));
  const items = {};
  for (const [key] of entry.checklist) {
    if (!form.has('all') && !ticked.has(key)) continue;
    const before = entry.record?.items?.[key];
    const note = text(form, `note.${key}`);
    const checkedAt = before && !entry.stale ? before.checkedAt : today;
    items[key] = { checkedAt, ...(note ? { note } : {}) };
  }
  return Object.keys(items).length ? { items, fingerprint: entry.fingerprint } : null;
}
