// Validates every site's content files, including inactive sites and people, plus registry.json.
// Run with `npm run validate` (CI runs it on every push). Exits non-zero with one line per problem.
// Licence approvals and verification checks are warnings: summary lines per site, exit 0. `--strict-licences`,
// `--strict-verification` or `--strict` (both: the launch gate) exit 1 while any active site has gaps.
// `validateSite` / `validateRegistry` are also used by the tests, the site tools and the admin before every save.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { PAGE_DEFAULTS } from '../lib/content/publish.ts';
import { domainProblems, hubHost } from '../lib/domains.ts';
import { consentProblems, trackingProblems } from '../lib/tracking.ts';
import { FAQ, VOCAB } from '../src/copy/defaults.mjs';
import { licenceProblems, licenceStatus, licenceSummary } from '../src/sites/licences.mjs';
import { verificationProblems, verificationStatus, verificationSummary } from '../src/sites/verification.mjs';

const ROLE_KEYS = new Set(['player', 'manager', 'staff', 'women', 'squad']);
const FORMAT_KEYS = new Set(['keynote', 'dinner', 'appearance', 'hospitality', 'brand', 'clinic', 'fan', 'workshop', 'virtual']);
const CONTACT_KEYS = new Set(['email', 'phone', 'hours']);
const VOCAB_KEYS = new Set([...Object.keys(VOCAB), 'officialSmall', 'currentNoun']);
const NAV_KEYS = new Set(Object.keys(VOCAB.navLabels));
const FAQ_KEYS = new Set(FAQ.map(entry => entry.key));
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Top-level paths the app owns; a site with one of these slugs would be shadowed by (or shadow) them. */
export const RESERVED_SLUGS = new Set([
  'all',
  'api',
  'health',
  'og',
  'fonts',
  'peptalk',
  'terms',
  'privacy',
  'accessibility',
  'robots',
  'sitemap',
]);
const HEX = /^#[0-9a-f]{6}$/i;
const HTTPS = /^https:\/\//;
const REVIEW_NOTE = /\((?:verify|tbc)\b|\bTODO\b|\bTBC\b|lorem ipsum/i;
const STYLE_KEYS = new Set(['buttonRadius', 'buttonCase', 'buttonClip', 'headingCase', 'headingStyle', 'cardRadius']);
const LAYOUT_KEYS = new Set(['waysAfterRoles', 'hideEras']);
const NEUTRALS = ['tint', 'line', 'muted', 'mutedDark'];
const CREST_SURFACES = new Set(['bar', 'brand', 'dark']);
const CREST_TREATMENTS = new Set(['full', 'white', 'hide']);
const LANGS = new Set(['en-GB', 'en-US']);
const ORG_TYPES = new Set(['SportsTeam', 'SportsOrganization']);
// Every key site.json (plus the files loaded beside it) may hold; anything else is a setting no other site has.
const SITE_KEYS = new Set([
  ...['slug', 'active', 'indexable', 'lang', 'pages', 'status', 'short', 'orgName', 'platform', 'platformShort', 'tagline'],
  ...['entity', 'motto', 'copyright', 'heroTitle', 'waysTitle', 'stadium', 'marks', 'navMark', 'crestOnLight', 'crestOn'],
  ...['crestFallback', 'theme', 'style', 'cspHosts', 'orgType', 'featured', 'home', 'homeLayout', 'demoHome', 'demoProfiles'],
  ...['tracking', 'consent', 'eventSpaces', 'heroWords', 'formatKeys', 'contact'],
  ...['vocab', 'formats', 'faqOverrides', 'roles', 'eras', 'people', 'images', 'licences', 'verification'],
  // Removed features with their own, clearer messages below.
  ...['stories', 'faq'],
]);
const PERSON_KEYS = new Set([
  ...['slug', 'name', 'first', 'active', 'role', 'roleLabel', 'era', 'limited', 'hero', 'card', 'gallery', 'pos', 'short'],
  ...['honour', 'line', 'stats', 'bio', 'why', 'timeline', 'talks', 'audiences', 'industries', 'formats', 'langs'],
  ...['travelsFrom', 'sameAs'],
]);
const flag = value => value === undefined || typeof value === 'boolean';
const text = value => typeof value === 'string' && value.trim() !== '';

/**
 * Checks one site object (as loaded by src/sites/index.mjs) and returns a list of problems.
 * A site with `status: "shell"` may leave images unset (null) and use placeholder people.
 * @param {object} site
 * @returns {string[]}
 */
export function validateSite(site) {
  const problems = [];
  const at = path => `${site.slug ?? '?'}: ${path}`;
  const need = (cond, path, message) => {
    if (!cond) problems.push(`${at(path)} ${message}`);
  };
  const shell = site.status === 'shell';
  const images = site.images ?? {};
  const image = (id, path) => {
    if (id === null && shell) return;
    need(typeof id === 'string' && Object.hasOwn(images, id), path, `image "${id}" is not in images.json`);
  };

  need(SLUG.test(site.slug ?? ''), 'slug', 'must be lowercase letters, digits and hyphens');
  need(!RESERVED_SLUGS.has(site.slug), 'slug', `is reserved for the app (${[...RESERVED_SLUGS].join(', ')})`);
  for (const key of Object.keys(site)) need(SITE_KEYS.has(key), key, 'is not a site setting (see docs/content-model.md)');
  need(flag(site.active), 'active', 'must be true or false');
  need(flag(site.indexable), 'indexable', 'must be true or false');
  if (site.indexable === true) {
    // Indexing is the public launch: placeholder people and look-only demo pages must be gone first.
    need(!shell, 'indexable', 'cannot be true on a shell site (placeholder people and photos)');
    need(site.demoHome !== true && !(site.demoProfiles ?? []).length, 'indexable', 'cannot be true while demoHome or demoProfiles are set');
  }
  need(site.lang === undefined || LANGS.has(site.lang), 'lang', `must be one of ${[...LANGS].join(', ')}`);
  need(site.orgType === undefined || ORG_TYPES.has(site.orgType), 'orgType', `must be one of ${[...ORG_TYPES].join(', ')}`);
  for (const [key, value] of Object.entries(site.pages ?? {})) {
    const removed = key === 'stories' ? 'is no longer supported (stories were removed); delete it' : null;
    need(
      Object.hasOwn(PAGE_DEFAULTS, key),
      `pages.${key}`,
      removed ?? `is not an optional page (${Object.keys(PAGE_DEFAULTS).join(', ')})`,
    );
    need(typeof value === 'boolean', `pages.${key}`, 'must be true or false');
  }
  for (const key of ['short', 'orgName', 'platform', 'platformShort', 'tagline', 'entity', 'copyright', 'stadium', 'waysTitle']) {
    need(typeof site[key] === 'string' && site[key].trim() !== '', key, 'is required');
  }
  need(Array.isArray(site.heroTitle) && site.heroTitle.length === 2, 'heroTitle', 'must be two lines');

  for (const key of ['brand', 'ink', 'dark', 'bar']) need(HEX.test(site.theme?.[key] ?? ''), `theme.${key}`, 'must be a #rrggbb colour');
  need(
    /(Outfit|Barlow Condensed)'?,?\s*(Outfit|helvetica)?/.test(site.theme?.display ?? ''),
    'theme.display',
    'must fall back to a bundled font',
  );
  const neutrals = NEUTRALS.filter(key => site.theme?.[key] !== undefined);
  need(neutrals.length === 0 || neutrals.length === NEUTRALS.length, 'theme', `neutrals must be set together (${NEUTRALS.join(', ')})`);
  for (const key of [...neutrals, 'faint'])
    if (site.theme?.[key] !== undefined) need(HEX.test(site.theme[key]), `theme.${key}`, 'must be a #rrggbb colour');
  for (const key of Object.keys(site.style ?? {})) need(STYLE_KEYS.has(key), `style.${key}`, 'is not a style token');
  for (const [key, value] of Object.entries(site.homeLayout ?? {})) {
    need(LAYOUT_KEYS.has(key), `homeLayout.${key}`, 'is not a layout flag');
    need(typeof value === 'boolean', `homeLayout.${key}`, 'must be true or false');
  }
  for (const [key, value] of Object.entries(site.crestOn ?? {})) {
    need(CREST_SURFACES.has(key), `crestOn.${key}`, 'must be bar, brand or dark');
    need(CREST_TREATMENTS.has(value), `crestOn.${key}`, 'must be full, white or hide');
  }
  if (site.eventSpaces !== undefined) {
    const config = site.eventSpaces;
    const object = config !== null && typeof config === 'object' && !Array.isArray(config);
    need(object, 'eventSpaces', 'must be an object');
    if (object) {
      const keys = ['url', 'heading', 'copy', 'image', 'imageAlt', 'buttonText'];
      for (const [key, value] of Object.entries(config)) {
        need([...keys, 'eyebrow'].includes(key), `eventSpaces.${key}`, 'is not an Event Spaces setting');
        need(typeof value === 'string' && (key === 'url' || text(value)), `eventSpaces.${key}`, 'must be text');
      }
      if (config.url) {
        need(
          typeof config.url === 'string' &&
            HTTPS.test(config.url) &&
            URL.canParse(config.url) &&
            !new URL(config.url).username &&
            !new URL(config.url).password,
          'eventSpaces.url',
          'must be an https URL without credentials',
        );
        for (const key of keys) need(text(config[key]), `eventSpaces.${key}`, 'is required when the venue-hire URL is set');
        image(config.image, 'eventSpaces.image');
      }
    }
  }
  need(flag(site.demoHome), 'demoHome', 'must be true or false');
  for (const problem of [...trackingProblems(site.tracking), ...consentProblems(site.consent)]) problems.push(at(problem));
  for (const origin of [site.marks?.wordmark, site.marks?.crest].filter(url => url && URL.canParse(url)).map(url => new URL(url).origin))
    need((site.cspHosts ?? []).includes(origin), 'cspHosts', `must include ${origin} (a mark is served from there)`);
  need(['wordmark', 'crest'].includes(site.navMark), 'navMark', 'must be "wordmark" or "crest"');
  if (site.navMark === 'wordmark') need(HTTPS.test(site.marks?.wordmark ?? ''), 'marks.wordmark', 'must be an https URL');
  if (site.marks?.crest) need(HTTPS.test(site.marks.crest), 'marks.crest', 'must be an https URL');
  else need(typeof site.crestFallback === 'string', 'crestFallback', 'is required when marks.crest is empty');

  for (const key of Object.keys(site.vocab ?? {}))
    need(VOCAB_KEYS.has(key), `vocab.${key}`, 'is not a known wording key (see src/copy/defaults.mjs)');
  for (const key of Object.keys(site.vocab?.navLabels ?? {})) need(NAV_KEYS.has(key), `vocab.navLabels.${key}`, 'is not a nav label');
  for (const key of Object.keys(site.formats ?? {})) need(FORMAT_KEYS.has(key), `formats.${key}`, 'is not a format key');
  if (site.formatKeys !== undefined)
    need(
      Array.isArray(site.formatKeys) &&
        site.formatKeys.length > 0 &&
        site.formatKeys.every(key => FORMAT_KEYS.has(key)) &&
        new Set(site.formatKeys).size === site.formatKeys.length,
      'formatKeys',
      'must list known format keys, each once',
    );
  if (site.heroWords !== undefined)
    need(
      Array.isArray(site.heroWords) &&
        site.heroWords.length >= 2 &&
        site.heroWords.every(text) &&
        typeof site.heroTitle?.[0] === 'string' &&
        site.heroTitle[0].endsWith(` ${site.heroWords[0]}`),
      'heroWords',
      'must be two or more words, the first ending heroTitle[0]',
    );
  if (site.contact !== undefined) {
    const contact = site.contact;
    const object = contact !== null && typeof contact === 'object' && !Array.isArray(contact);
    need(object, 'contact', 'must be an object');
    if (object)
      for (const [key, value] of Object.entries(contact)) {
        need(CONTACT_KEYS.has(key), `contact.${key}`, 'is not a contact setting (email, phone, hours)');
        need(text(value), `contact.${key}`, 'must be text');
      }
  }
  need(site.faq === undefined, 'faq', 'is not supported; override single entries with faqOverrides');
  for (const [key, value] of Object.entries(site.faqOverrides ?? {})) {
    need(FAQ_KEYS.has(key), `faqOverrides.${key}`, `is not an FAQ key (${[...FAQ_KEYS].join(', ')})`);
    const entry = value !== null && typeof value === 'object' && !Array.isArray(value);
    need(
      text(value) || (entry && Object.keys(value).length > 0 && Object.entries(value).every(([k, v]) => ['q', 'a'].includes(k) && text(v))),
      `faqOverrides.${key}`,
      'must be an answer string or { q, a } strings',
    );
  }

  const roleKeys = new Set();
  for (const [i, role] of (site.roles ?? []).entries()) {
    need(ROLE_KEYS.has(role.key), `roles[${i}].key`, `must be one of ${[...ROLE_KEYS].join(', ')}`);
    need(typeof role.label === 'string', `roles[${i}].label`, 'is required');
    if (role.image !== undefined) image(role.image, `roles[${i}].image`);
    if (role.pitch !== undefined)
      need(
        text(role.pitch?.eyebrow) &&
          text(role.pitch?.heading) &&
          text(role.pitch?.lead) &&
          Array.isArray(role.pitch?.points) &&
          role.pitch.points.length > 0 &&
          role.pitch.points.every(point => text(point?.title) && text(point?.text)),
        `roles[${i}].pitch`,
        'needs eyebrow, heading, lead and points of { title, text }',
      );
    roleKeys.add(role.key);
  }
  need(roleKeys.size > 0, 'roles', 'needs at least one role');
  const eraKeys = new Set((site.eras ?? []).map(era => era.key));
  need(eraKeys.size > 0, 'eras', 'needs at least one era');

  const slugs = new Set();
  for (const [i, person] of (site.people ?? []).entries()) {
    const p = `people[${i}] (${person.slug})`;
    need(SLUG.test(person.slug ?? ''), `${p}.slug`, 'is invalid');
    for (const key of Object.keys(person)) need(PERSON_KEYS.has(key), `${p}.${key}`, 'is not a person field (see docs/content-model.md)');
    if (person.sameAs !== undefined) {
      const links = Array.isArray(person.sameAs) ? person.sameAs : [];
      need(Array.isArray(person.sameAs) && links.length <= 10, `${p}.sameAs`, 'must be a list of at most 10 URLs');
      for (const url of links)
        need(typeof url === 'string' && HTTPS.test(url) && URL.canParse(url), `${p}.sameAs`, `"${url}" must be an https URL`);
      need(new Set(links).size === links.length, `${p}.sameAs`, 'lists a URL twice');
    }
    need(flag(person.active), `${p}.active`, 'must be true or false');
    need(!slugs.has(person.slug), `${p}.slug`, 'is duplicated');
    slugs.add(person.slug);
    need(roleKeys.has(person.role), `${p}.role`, 'is not one of this site’s roles');
    need(eraKeys.has(person.era), `${p}.era`, 'is not one of this site’s eras');
    for (const key of ['name', 'first', 'roleLabel', 'pos', 'short', 'honour', 'line', 'why', 'langs']) {
      need(typeof person[key] === 'string' && person[key] !== '', `${p}.${key}`, 'is required');
    }
    need(Array.isArray(person.stats) && person.stats.length === 4, `${p}.stats`, 'needs exactly 4 [value, caption] pairs');
    need(Array.isArray(person.bio) && person.bio.length >= 1, `${p}.bio`, 'needs at least one paragraph');
    need(Array.isArray(person.timeline) && person.timeline.length >= 1, `${p}.timeline`, 'needs at least one entry');
    for (const key of ['talks', 'audiences', 'industries'])
      need(Array.isArray(person[key]) && person[key].length >= 1, `${p}.${key}`, 'needs entries');
    need(Array.isArray(person.formats) && person.formats.every(f => FORMAT_KEYS.has(f)), `${p}.formats`, 'has an unknown format');
    if (Array.isArray(site.formatKeys) && Array.isArray(person.formats))
      need(
        person.formats.every(f => site.formatKeys.includes(f)),
        `${p}.formats`,
        'has a format this site does not offer (formatKeys)',
      );
    image(person.hero, `${p}.hero`);
    image(person.card, `${p}.card`);
    need(Array.isArray(person.gallery) && person.gallery.length === 3, `${p}.gallery`, 'needs exactly 3 images');
    for (const [g, id] of (person.gallery ?? []).entries()) image(id, `${p}.gallery[${g}]`);
    if (!shell)
      need(!REVIEW_NOTE.test(JSON.stringify(person)), p, 'contains a review note (verify/TODO/TBC); move it to the PR description');
  }

  const live = new Set((site.people ?? []).filter(person => person.active !== false).map(person => person.slug));
  for (const slug of site.featured ?? []) {
    need(slugs.has(slug), 'featured', `"${slug}" is not in people.json`);
    if (slugs.has(slug)) need(live.has(slug), 'featured', `"${slug}" is hidden; unfeature them first`);
  }
  for (const slug of site.demoProfiles ?? []) need(slugs.has(slug), 'demoProfiles', `"${slug}" is not in people.json`);
  need((site.featured ?? []).length >= 1, 'featured', 'needs at least one person');
  for (const key of ['hero', 'inset']) image(site.home?.[key]?.image, `home.${key}.image`);
  for (const key of ['eraImage', 'storyImage', 'hospitalityImage']) image(site.home?.[key], `home.${key}`);
  for (const [i, slide] of (site.home?.slides ?? []).entries()) {
    image(slide?.image, `home.slides[${i}].image`);
    need(text(slide?.name) && text(slide?.line), `home.slides[${i}]`, 'needs a name and a line');
  }
  if (site.home?.aboutImage !== undefined) image(site.home.aboutImage, 'home.aboutImage');
  need(eraKeys.has(site.home?.activeEra), 'home.activeEra', 'is not one of this site’s eras');
  // Stories were removed from the product; a leftover array would otherwise sit in the file unnoticed.
  need(site.stories === undefined, 'stories', 'is no longer supported (stories were removed); delete the "stories" key');
  if (!shell) {
    // Licence and verification notes are internal bookkeeping (never rendered), so "renewal TBC" there is fine.
    const { people, images: _, licences: __, verification: ___, ...rest } = site;
    need(!REVIEW_NOTE.test(JSON.stringify(rest)), 'site.json', 'contains a review note (verify/TODO/TBC); move it to the PR description');
  }
  for (const [id, url] of Object.entries(images)) need(HTTPS.test(url), `images.${id}`, 'must be an https URL');
  problems.push(...licenceProblems(site), ...verificationProblems(site));
  return problems;
}

/**
 * Checks registry.json against the sites it lists.
 * @param {{ order: string[], rootSite?: string, redirects: Record<string, string> }} registry
 * @param {object[]} sites every site in registry order, as stored (including inactive ones)
 */
export function validateRegistry(registry, sites) {
  const problems = [];
  const order = registry.order ?? [];
  const bySlug = new Map(sites.map(site => [site.slug, site]));
  if (new Set(order).size !== order.length) problems.push('registry: order lists a site twice');
  for (const key of Object.keys(registry))
    if (!['order', 'rootSite', 'redirects', 'indexable', 'domains'].includes(key))
      problems.push(`registry: "${key}" is not a registry setting`);
  if (registry.indexable !== undefined && typeof registry.indexable !== 'boolean')
    problems.push('registry: indexable must be true or false');
  for (const slug of order)
    if (bySlug.get(slug)?.slug !== slug) problems.push(`registry: "${slug}" has no matching src/sites/${slug}/site.json slug`);
  // No rootSite: `/` serves the landing page. When set, it must be a site in order that is active.
  if (registry.rootSite !== undefined) {
    const root = order.includes(registry.rootSite) ? bySlug.get(registry.rootSite) : undefined;
    if (typeof registry.rootSite !== 'string' || !root) problems.push(`registry: rootSite "${registry.rootSite}" is not in order`);
    else if (root.active === false) problems.push(`registry: rootSite "${registry.rootSite}" is inactive, so / would 404`);
  }
  for (const [from, to] of Object.entries(registry.redirects ?? {})) {
    if (!SLUG.test(from)) problems.push(`registry: redirect "${from}" is not a valid slug`);
    if (bySlug.has(from)) problems.push(`registry: redirect "${from}" shadows a live site`);
    if (!bySlug.has(to)) problems.push(`registry: redirect "${from}" points at unknown site "${to}"`);
  }
  problems.push(...domainProblems(registry.domains, order, hubHost()));
  return problems;
}

/** Validates every stored site and the registry. */
export async function validateAll(dir) {
  const { loadSite, readRegistry } = await import('../src/sites/index.mjs');
  const registry = readRegistry(dir);
  const sites = registry.order.map(slug => loadSite(slug, dir));
  return { sites, problems: [...validateRegistry(registry, sites), ...sites.flatMap(validateSite)] };
}

// The CLI. A function rather than top-level code with `await`, and plain parseArgs rather than scripts/lib/cli.mjs
// (which pulls in the site tools), because the app imports this module too: the Airtable people provider checks synced
// people with validateSite, and next.config.ts loads it through require(), which refuses modules with top-level await.
async function main() {
  const usage = 'Usage: npm run validate [-- --strict | --strict-licences | --strict-verification] [--dir <src/sites directory>]';
  let options;
  try {
    options = parseArgs({
      options: {
        'strict-licences': { type: 'boolean' },
        'strict-verification': { type: 'boolean' },
        strict: { type: 'boolean' },
        dir: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }).values;
  } catch (error) {
    console.error(`${error.message}\n\n${usage}`);
    process.exit(1);
  }
  if (options.help) {
    console.log(usage);
    process.exit(0);
  }
  const dir = options.dir ? pathToFileURL(options.dir.endsWith('/') ? options.dir : `${options.dir}/`) : undefined;
  const { sites, problems } = await validateAll(dir);
  for (const problem of problems) console.error(problem);
  for (const site of sites) {
    const tag = site.active === false ? ' [inactive]' : '';
    console.log(`${licenceSummary(site)}${tag}`);
    console.log(`${verificationSummary(site)}${tag}`);
  }
  const inactive = sites.filter(site => site.active === false).map(site => site.slug);
  console.log(
    `${sites.length} sites checked${inactive.length ? ` (inactive: ${inactive.join(', ')})` : ''}, ${problems.length} problem(s).`,
  );
  // Only published sites gate a launch; an inactive site can be licensed and verified before it is switched on.
  const active = sites.filter(site => site.active !== false);
  const gates = [
    [options['strict-licences'] || options.strict, 'unlicensed assets', site => licenceStatus(site).approved < licenceStatus(site).total],
    [
      options['strict-verification'] || options.strict,
      'unverified pages or profiles',
      site => verificationStatus(site).verified < verificationStatus(site).total,
    ],
  ];
  let failed = problems.length > 0;
  for (const [on, what, gap] of gates) {
    const slugs = on ? active.filter(gap).map(site => site.slug) : [];
    if (slugs.length) console.error(`strict: ${slugs.join(', ')} still have ${what}.`);
    failed ||= slugs.length > 0;
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
