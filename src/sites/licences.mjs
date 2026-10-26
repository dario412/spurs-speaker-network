// Licence approvals for a site's pictures and marks (src/sites/<slug>/licences.json). Shared by the validator, the
// admin and `npm run validate`. Nothing here renders: approvals are bookkeeping and never reach a page.
//
// An asset counts as licensed only while its approval names the URL in use now. If an image or mark URL changes
// after approval, the approval goes stale ("changed since approval") until someone approves the new file.

export const emptyLicences = () => ({ images: {}, marks: {} });
export const MARKS = ['crest', 'wordmark'];

/** `{ images, marks }` with both keys present, whatever the stored file left out. */
export const normaliseLicences = licences => ({ images: { ...licences?.images }, marks: { ...licences?.marks } });

export const hasLicences = licences => Object.keys(licences?.images ?? {}).length + Object.keys(licences?.marks ?? {}).length > 0;

/**
 * Every licensable asset with its status, images first (images.json order) then marks.
 * Shell placeholders (null images) are not in images.json, so they never count.
 * @returns {{ kind: 'image'|'mark', id: string, url: string, entry: object|undefined, status: 'licensed'|'missing'|'stale' }[]}
 */
export function licenceAssets(site) {
  const licences = normaliseLicences(site.licences);
  const status = (entry, url) => (!entry ? 'missing' : entry.url === url ? 'licensed' : 'stale');
  const images = Object.entries(site.images ?? {})
    .filter(([id, url]) => id && id !== 'null' && typeof url === 'string' && url)
    .map(([id, url]) => ({ kind: 'image', id, url, entry: licences.images[id], status: status(licences.images[id], url) }));
  const marks = MARKS.filter(name => typeof site.marks?.[name] === 'string' && site.marks[name]).map(name => {
    const url = site.marks[name];
    return { kind: 'mark', id: name, url, entry: licences.marks[name], status: status(licences.marks[name], url) };
  });
  return [...images, ...marks];
}

/** @returns {{ total: number, approved: number, missing: object[], stale: object[] }} */
export function licenceStatus(site) {
  const assets = licenceAssets(site);
  return {
    total: assets.length,
    approved: assets.filter(asset => asset.status === 'licensed').length,
    missing: assets.filter(asset => asset.status === 'missing'),
    stale: assets.filter(asset => asset.status === 'stale'),
  };
}

/** One line per site for `npm run validate`, e.g. `spurs: 12/243 assets licensed (3 changed since approval)`. */
export function licenceSummary(site) {
  const { total, approved, stale } = licenceStatus(site);
  return `${site.slug}: ${approved}/${total} assets licensed${stale.length ? ` (${stale.length} changed since approval)` : ''}`;
}

/**
 * Drops approvals for images no longer in images.json and marks no longer set. The admin applies this before every
 * save so removing an image or a mark never leaves an entry the validator rejects.
 */
export function pruneLicences(site) {
  const licences = normaliseLicences(site.licences);
  for (const id of Object.keys(licences.images)) if (!Object.hasOwn(site.images ?? {}, id)) delete licences.images[id];
  for (const name of Object.keys(licences.marks)) if (!site.marks?.[name]) delete licences.marks[name];
  return { ...site, licences };
}

/** Where each image id is used: person slots, homepage slots and role tiles (labels for people to read). */
export function imageUses(site) {
  const uses = new Map();
  const add = (id, label) => {
    if (!id) return;
    if (!uses.has(id)) uses.set(id, []);
    uses.get(id).push(label);
  };
  for (const person of site.people ?? []) {
    add(person.hero, `${person.name} (hero)`);
    add(person.card, `${person.name} (card)`);
    for (const [i, id] of (person.gallery ?? []).entries()) add(id, `${person.name} (gallery ${i + 1})`);
  }
  for (const spot of ['hero', 'inset']) add(site.home?.[spot]?.image, `Homepage ${spot}`);
  for (const [key, label] of [
    ['eraImage', 'Homepage era'],
    ['storyImage', 'Homepage story'],
    ['hospitalityImage', 'Homepage hospitality'],
  ])
    add(site.home?.[key], label);
  add(site.eventSpaces?.image, 'Event Spaces');
  for (const role of site.roles ?? []) add(role.image, `Role tile: ${role.label}`);
  return uses;
}

const ENTRY_KEYS = new Set(['url', 'note', 'approvedAt']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Shape errors in a site's licences (problems, not warnings). Missing or stale approvals are not errors. */
export function licenceProblems(site) {
  const problems = [];
  const at = (path, message) => problems.push(`${site.slug ?? '?'}: licences.${path} ${message}`);
  const licences = site.licences;
  if (licences === undefined) return problems;
  if (!licences || typeof licences !== 'object' || Array.isArray(licences)) {
    at('json', 'must be an object with "images" and "marks"');
    return problems;
  }
  for (const key of Object.keys(licences)) if (!['images', 'marks'].includes(key)) at(key, 'is not a licences key (images, marks)');
  const group = (name, known, label) => {
    const entries = licences[name] ?? {};
    if (typeof entries !== 'object' || Array.isArray(entries) || entries === null) return at(name, 'must be an object');
    for (const [id, entry] of Object.entries(entries)) {
      const path = `${name}.${id}`;
      if (!known(id)) at(path, label);
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        at(path, 'must be an object with url, note and approvedAt');
        continue;
      }
      for (const key of Object.keys(entry))
        if (!ENTRY_KEYS.has(key)) at(`${path}.${key}`, 'is not a licence field (url, note, approvedAt)');
      if (typeof entry.url !== 'string' || !/^https:\/\//.test(entry.url)) at(`${path}.url`, 'must be the https URL that was approved');
      if (entry.note !== undefined && typeof entry.note !== 'string') at(`${path}.note`, 'must be text');
      if (entry.approvedAt !== undefined && !DATE.test(String(entry.approvedAt))) at(`${path}.approvedAt`, 'must be a YYYY-MM-DD date');
    }
  };
  group('images', id => Object.hasOwn(site.images ?? {}, id), 'is not an image in images.json');
  group('marks', name => MARKS.includes(name) && Boolean(site.marks?.[name]), 'is not a mark this site uses (crest, wordmark)');
  return problems;
}

/** Today's date in London, for `approvedAt` (the team works on UK dates). */
export const londonToday = (date = new Date()) => date.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
