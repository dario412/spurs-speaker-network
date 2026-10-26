// Site editor: one form covering site.json's editable settings, split into sections with a jump list.
import {
  BASICS,
  HOME_IMAGES,
  LANGS,
  LAYOUT_FLAGS,
  NEUTRALS,
  ORG_TYPES,
  PAGE_KEYS,
  PAGE_LABELS,
  STYLE_FIELDS,
  THEME_COLOURS,
} from '../schema.mjs';
import { area, check, colour, csrfField, esc, field, imageInput, imageList, problemsBox, section, select } from './html.mjs';
import { siteHeader } from './layout.mjs';
import { wordingSection } from './wording.mjs';

const SECTIONS = [
  ['basics', 'Basics'],
  ['hero', 'Homepage'],
  ['event-spaces', 'Event Spaces'],
  ['pages', 'Pages'],
  ['search', 'Search & language'],
  ['theme', 'Theme'],
  ['style', 'Style & layout'],
  ['demo', 'Demo'],
  ['featured', 'Featured'],
  ['wording', 'Wording'],
];

const LONG = new Set(['entity', 'tagline']);

function basics(site) {
  const inputs = BASICS.map(([key, label]) =>
    LONG.has(key) ? area({ label, name: key, value: site[key], rows: 2, cls: 'span2' }) : field({ label, name: key, value: site[key] }),
  ).join('');
  const hero = [0, 1].map(i => field({ label: `Hero title line ${i + 1}`, name: `heroTitle.${i}`, value: site.heroTitle?.[i] })).join('');
  return section(
    'basics',
    'Basics',
    `<div class="grid">${inputs}${hero}</div>`,
    'Wording values are trusted HTML: write &amp; for an ampersand.',
  );
}

function heroCard(site, spot) {
  const card = site.home?.[spot] ?? {};
  return `<fieldset><legend>${spot === 'hero' ? 'Hero' : 'Inset'}</legend><div class="grid">
${imageInput({ label: 'Image', name: `home.${spot}.image`, value: card.image, images: site.images })}
${field({ label: 'Name', name: `home.${spot}.name`, value: card.name })}
${field({ label: 'Line', name: `home.${spot}.line`, value: card.line })}
${select({
  label: 'Name layout',
  name: `home.${spot}.tag`,
  value: card.tag ?? '',
  options: [
    ['', 'Name and line inline'],
    ['br', 'Line on its own row'],
  ],
})}
</div></fieldset>`;
}

function hero(site) {
  const images = HOME_IMAGES.map(([key, label]) =>
    imageInput({ label, name: `home.${key}`, value: site.home?.[key], images: site.images }),
  ).join('');
  const eras = (site.eras ?? []).map(era => [era.key, era.label]);
  return section(
    'hero',
    'Homepage',
    `${heroCard(site, 'hero')}${heroCard(site, 'inset')}<div class="grid">${images}${select({ label: 'Active era', name: 'home.activeEra', value: site.home?.activeEra, options: eras })}</div>`,
    'Image ids come from images.json; add new ones from a person’s editor or the images.json raw editor.',
  );
}

function eventSpaces(site) {
  const config = site.eventSpaces ?? {};
  const inputs = [
    ['url', 'Partner venue-hire URL (HTTPS)'],
    ['heading', 'Heading'],
    ['copy', 'Short copy'],
    ['imageAlt', 'Image description'],
    ['buttonText', 'Button text'],
  ]
    .map(([key, label]) => field({ label, name: `eventSpaces.${key}`, value: config[key] }))
    .join('');
  return section(
    'event-spaces',
    'Event Spaces',
    `<div class="grid">${inputs}${imageInput({ label: 'Venue image', name: 'eventSpaces.image', value: config.image, images: site.images })}</div>`,
    'Appears on every page. Leave the URL empty to hide it. With a URL, complete all fields. Enquiries and bookings go directly to the partner site.',
  );
}

function search(site) {
  const warning = `<div class="alert warn"><p><b>Indexable launches the site.</b> Its pages become public (no password, for this site only) and search engines may index them: robots meta and headers allow indexing, the sitemaps and robots.txt list the site, and /${esc(site.slug)}/llms.txt is served. Tick it only when the content is real, licensed and verified. Shell sites and sites with demo pages are refused. A Vercel preview never indexes, and <code>SEARCH_INDEXING=off</code> switches indexing off everywhere.</p></div>`;
  return section(
    'search',
    'Search & language',
    `${warning}<div class="checks">${check({ label: 'Indexable: public and in search engines (the launch switch)', name: 'indexable', checked: site.indexable === true })}</div>
<div class="grid">${select({ label: 'Content language', name: 'lang', value: site.lang ?? LANGS[0][0], options: LANGS, hint: '<html lang>, og:locale and structured data. US leagues use en-US.' })}${select({ label: 'Organisation type', name: 'orgType', value: site.orgType ?? ORG_TYPES[0][0], options: ORG_TYPES, hint: 'schema.org type in structured data' })}</div>`,
  );
}

function pages(site) {
  const boxes = PAGE_KEYS.map(key => check({ label: PAGE_LABELS[key], name: `pages.${key}`, checked: site.pages?.[key] !== false })).join(
    '',
  );
  return section(
    'pages',
    'Pages',
    `<div class="checks">${boxes}</div>`,
    'Home, roster, profiles and the enquiry page always exist. Unticked pages are not built and leave the navigation.',
  );
}

function theme(site) {
  const t = site.theme ?? {};
  const colours = THEME_COLOURS.map(key => colour({ label: key, name: `theme.${key}`, value: t[key] })).join('');
  const neutrals = NEUTRALS.map(key =>
    field({
      label: key,
      name: `theme.${key}`,
      value: t[key],
      placeholder: '#rrggbb',
      hint: key === 'faint' ? 'Optional' : 'Set all four or none',
    }),
  ).join('');
  return section(
    'theme',
    'Theme',
    `<div class="grid colours">${colours}</div>
${field({ label: 'Display font stack', name: 'theme.display', value: t.display, hint: 'Must end in a bundled font (Outfit or Barlow Condensed)', cls: 'span2' })}
<h3>Neutrals (optional)</h3><div class="grid">${neutrals}</div>`,
    'Changing colours, names or hero copy means the Open Graph cards need regenerating (npm run og-cards).',
  );
}

function style(site) {
  const st = site.style ?? {};
  const tokens = STYLE_FIELDS.map(([key, label, options]) =>
    options
      ? select({ label, name: `style.${key}`, value: st[key] ?? '', options: [['', 'Default'], ...options.map(o => [o, o])] })
      : field({ label, name: `style.${key}`, value: st[key], placeholder: 'Default', hint: 'CSS length, e.g. 0, 4px, 999px' }),
  ).join('');
  const layout = LAYOUT_FLAGS.map(([key, label]) =>
    check({ label, name: `homeLayout.${key}`, checked: site.homeLayout?.[key] === true }),
  ).join('');
  return section(
    'style',
    'Style & layout',
    `<div class="grid">${tokens}</div><div class="checks">${check({ label: 'Chamfered buttons (buttonClip)', name: 'style.buttonClip', checked: st.buttonClip === true })}</div><h3>Homepage layout</h3><div class="checks">${layout}</div>`,
  );
}

function demo(site) {
  const people = site.people
    .map(person =>
      check({ label: person.name, name: 'demoProfiles', value: person.slug, checked: site.demoProfiles?.includes(person.slug) }),
    )
    .join('');
  return section(
    'demo',
    'Demo pages',
    `<div class="checks">${check({ label: 'Homepage is a look-only demo (demoHome)', name: 'demoHome', checked: site.demoHome === true })}</div><h3>Demo profiles</h3><div class="checks columns">${people}</div>`,
    'Demo pages render without working links, forms or scripts.',
  );
}

function featured(site) {
  const order = site.featured ?? [];
  const people = [...site.people].sort((a, b) => {
    const rank = person => (order.includes(person.slug) ? order.indexOf(person.slug) : Number.MAX_SAFE_INTEGER);
    return rank(a) - rank(b);
  });
  const rows = people
    .map(person => {
      const at = order.indexOf(person.slug);
      const hidden = person.active === false ? ' <span class="badge muted">Hidden</span>' : '';
      return `<tr><td>${check({ label: person.name, name: 'featured', value: person.slug, checked: at !== -1 })}${hidden}</td><td><input class="order" type="number" min="1" name="featuredOrder.${esc(person.slug)}" value="${at === -1 ? '' : at + 1}" aria-label="Order for ${esc(person.name)}"></td><td>${esc(person.roleLabel)}</td></tr>`;
    })
    .join('');
  return section(
    'featured',
    'Featured people',
    `<div class="table-wrap scroll"><table class="compact"><thead><tr><th>Person</th><th>Order</th><th>Role</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    'Tick people for “Featured this season” (six works best). Order is the number, lowest first.',
  );
}

/**
 * @param {{ site: object, csrf: string, problems?: string[], raw?: Record<string, string>, jsonKeys: Set<string> }} options
 */
export function siteEditor({ site, csrf, problems = [], raw = {}, jsonKeys }) {
  const jump = SECTIONS.map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join('');
  return `${siteHeader(site, 'Site settings')}
${problemsBox(problems)}
<nav class="jump" aria-label="Sections">${jump}</nav>
<form method="post" action="/sites/${esc(site.slug)}" class="editor">${csrfField(csrf)}
${imageList(site.images)}
${basics(site)}${hero(site)}${eventSpaces(site)}${pages(site)}${search(site)}${theme(site)}${style(site)}${demo(site)}${featured(site)}${wordingSection(site, { raw, jsonKeys })}
<div class="savebar"><button class="btn primary" type="submit">Save site settings</button><span>Validated before saving; nothing is written if there are problems.</span></div>
</form>`;
}
