// The CMS's page editors: each page of the site lists the site.json settings it shows, grouped as on the page.
// Saving reads only the listed fields from the form, applies them to the site, and goes through the one validated
// save path (src/admin/content.mjs → saveSite), so the content rules still decide what is allowed.
// An empty field falls back to the shared default (shown as the placeholder); optional rows left empty are dropped.
import { FAQ, FORMATS, VOCAB } from '../../src/copy/defaults.mjs';

export type FieldKind = 'text' | 'textarea' | 'lines' | 'image' | 'color' | 'select' | 'check' | 'url';

export interface Field {
  /** Dotted path into site.json; numbers index arrays (roles.1.pitch.points.0.title). */
  path: string;
  label: string;
  kind?: FieldKind;
  hint?: string;
  placeholder?: string;
  options?: [string, string][];
  /** check: the value the site uses when the key is absent (stored only when it differs). */
  default?: boolean;
  /** Spans the full width of the form grid. */
  wide?: boolean;
}

export interface Section {
  title: string;
  intro?: string;
  fields: Field[];
}

export interface PageDef {
  slug: string;
  title: string;
  description: string;
  /** Path of the live page under the site (`` for the home page). */
  live: string | null;
  sections: (site: SiteLike) => Section[];
}

// biome-ignore lint/suspicious/noExplicitAny: site.json is validated by the content rules, not by this module.
export type SiteLike = Record<string, any>;

const vocab = (key: string, label: string, kind: FieldKind = 'text', hint?: string): Field => {
  const fallback = (VOCAB as Record<string, unknown>)[key];
  return {
    path: `vocab.${key}`,
    label,
    kind,
    hint,
    placeholder: typeof fallback === 'string' ? fallback : Array.isArray(fallback) ? fallback.join('\n') : undefined,
  };
};

const TOKENS = 'You can use {short} (Spurs), {org}, {platform}, {legendNoun} and {legendsNoun}; step texts also {diaryCheck}.';

const FORMAT_TEXT: [string, string, FieldKind][] = [
  ['title', 'Title', 'text'],
  ['short', 'Short line (cards)', 'textarea'],
  ['desc', 'Description', 'textarea'],
];

const formatOrder = (site: SiteLike): string[] => {
  const shown: string[] = site.formatKeys ?? [];
  return [...shown, ...Object.keys(FORMATS).filter(key => !shown.includes(key))];
};

/** Rows for a list of objects: the stored rows plus `spare` empty ones to add more (empty rows are dropped). */
const rows = (count: number, spare: number, max: number) => Array.from({ length: Math.min(count + spare, max) }, (_, i) => i);

export const PAGES: PageDef[] = [
  {
    slug: 'home',
    title: 'Home',
    description: 'Hero, rotating word and carousel, featured speakers, roles, ways to book, how booking works and the enquiry form.',
    live: '',
    sections: site => [
      {
        title: 'Hero',
        fields: [
          {
            path: 'heroTitle',
            label: 'Heading',
            kind: 'lines',
            hint: 'Two lines. The rotating word replaces the word it matches in the first line.',
          },
          {
            path: 'heroWords',
            label: 'Rotating words',
            kind: 'lines',
            hint: 'One per line, in order. The first must appear in the heading.',
          },
          vocab('heroLead', 'Intro', 'textarea'),
          vocab('trustOfficial', 'Check 1', 'text', TOKENS),
          vocab('trustShortlist', 'Check 2'),
          vocab('trustManaged', 'Check 3'),
        ],
      },
      {
        title: 'Hero photo',
        intro: 'The first photo in the hero; the carousel slides follow it.',
        fields: [
          {
            path: 'home.fromSpeakers',
            label: 'Use the synced speakers',
            kind: 'check',
            default: false,
            hint: 'The hero, carousel, About photo and role tiles show the listed speakers (featured first), so only speakers synced from Airtable appear. The photos below are then only used if no speaker is listed.',
          },
          { path: 'home.hero.image', label: 'Image', kind: 'image' },
          { path: 'home.hero.name', label: 'Name' },
          { path: 'home.hero.line', label: 'Caption' },
        ],
      },
      ...rows(site.home?.slides?.length ?? 0, 2, 8).map(i => ({
        title: `Carousel slide ${i + 1}`,
        intro: i >= (site.home?.slides?.length ?? 0) ? 'Empty: fill in all three to add a slide.' : undefined,
        fields: [
          { path: `home.slides.${i}.image`, label: 'Image', kind: 'image' as const },
          { path: `home.slides.${i}.name`, label: 'Name' },
          { path: `home.slides.${i}.line`, label: 'Caption', hint: 'E.g. “Midfielder · 2015–2022”.' },
        ],
      })),
      {
        title: 'Featured speakers',
        intro: 'Speakers ticked “Featured” in Airtable are shown here after a sync; this list is used when none are ticked.',
        fields: [
          vocab('featuredEyebrow', 'Eyebrow'),
          vocab('featuredHeadline', 'Heading'),
          { path: 'featured', label: 'Featured speakers', kind: 'lines', hint: 'Speaker ids (see Speakers), one per line, in order.' },
        ],
      },
      {
        title: 'Roles',
        intro: 'The hero eyebrow and the role list. The roles themselves are edited under Pages → Speaker categories.',
        fields: [
          vocab('rolesEyebrow', 'Hero eyebrow'),
          vocab('browseEyebrow', 'Role list eyebrow'),
          vocab('homeRolesTitle', 'Role list heading'),
        ],
      },
      {
        title: 'Ways to book',
        intro: 'The formats themselves are edited under Pages → Ways to book.',
        fields: [vocab('waysEyebrow', 'Eyebrow'), { path: 'waysTitle', label: 'Heading' }, vocab('waysHomeLead', 'Intro', 'textarea')],
      },
      {
        title: 'FAQs',
        intro: 'The questions themselves are edited under Pages → FAQs.',
        fields: [vocab('homeFaqTitle', 'Heading', 'text', TOKENS), vocab('faqLead', 'Intro', 'textarea')],
      },
      {
        title: 'How booking works',
        fields: [
          vocab('howEyebrow', 'Eyebrow'),
          vocab('howHeadline', 'Heading'),
          vocab('step1Title', 'Step 1'),
          vocab('step1Text', 'Step 1 text', 'textarea'),
          vocab('step2Title', 'Step 2'),
          vocab('step2Text', 'Step 2 text', 'textarea', TOKENS),
          vocab('step3Title', 'Step 3'),
          vocab('step3Text', 'Step 3 text', 'textarea'),
        ],
      },
      {
        title: 'Closing band',
        fields: [
          { path: 'motto', label: 'Eyebrow (motto)' },
          vocab('ctaTitle', 'Heading', 'text', TOKENS),
          vocab('ctaLead', 'Line', 'textarea'),
        ],
      },
      {
        title: 'First team',
        fields: [
          vocab('squadEyebrow', 'Eyebrow'),
          vocab('squadHeadline', 'Heading'),
          vocab('squadLead', 'Intro', 'textarea'),
          vocab('squadLinkText', 'Link text'),
        ],
      },
      {
        title: 'Enquiry form',
        intro: 'Shown on the home page next to “How booking works”, and on Check availability.',
        fields: [
          vocab('formHeadline', 'Heading'),
          vocab('whoOptions', 'Who is booking (options)', 'lines'),
          vocab('whereOptions', 'Where is the event (options)', 'lines'),
          vocab('consentLine', 'Consent line', 'textarea'),
        ],
      },
    ],
  },
  {
    slug: 'speakers',
    title: 'Speakers page',
    description: 'The intro on the speakers list and the link to more speakers on PepTalk.',
    live: '/legends',
    sections: () => [
      {
        title: 'Intro',
        fields: [vocab('rosterLead', 'Intro', 'textarea')],
      },
      {
        title: 'More speakers on PepTalk',
        fields: [
          vocab('beyondLead', 'Line', 'textarea'),
          vocab('beyondLinkText', 'Link text'),
          { ...vocab('beyondUrl', 'Link'), kind: 'url' },
        ],
      },
    ],
  },
  {
    slug: 'categories',
    title: 'Speaker categories',
    description: 'Each role’s tile on the home page and its category page: name, image, and the “Why book” section.',
    live: null,
    sections: site =>
      (site.roles ?? []).flatMap((role: SiteLike, r: number) => [
        {
          title: role.label ?? role.key,
          intro: 'Its category page’s address follows the name: renaming it moves the page (the site rebuilds).',
          fields: [
            { path: `roles.${r}.label`, label: 'Name (plural)' },
            { path: `roles.${r}.singular`, label: 'Name (one person)' },
            { path: `roles.${r}.blurb`, label: 'Tile line', kind: 'textarea' as const },
            { path: `roles.${r}.image`, label: 'Tile image', kind: 'image' as const },
          ],
        },
        {
          title: `${role.label ?? role.key}: why book`,
          intro: 'Leave all of these empty to show popular topics and formats instead.',
          fields: [
            { path: `roles.${r}.pitch.eyebrow`, label: 'Eyebrow' },
            { path: `roles.${r}.pitch.heading`, label: 'Heading' },
            { path: `roles.${r}.pitch.lead`, label: 'Intro', kind: 'textarea' as const, wide: true },
            ...rows(role.pitch?.points?.length ?? 0, 1, 6).flatMap(i => [
              { path: `roles.${r}.pitch.points.${i}.title`, label: `Point ${i + 1}` },
              { path: `roles.${r}.pitch.points.${i}.text`, label: `Point ${i + 1} text` },
            ]),
          ],
        },
      ]),
  },
  {
    slug: 'profile',
    title: 'Speaker profile',
    description: 'Headings shared by every speaker’s profile. The speakers’ own text comes from Airtable.',
    live: null,
    sections: () => [
      {
        title: 'Profile',
        fields: [
          vocab('officialLegendLabel', 'Official label'),
          vocab('careerHeadline', 'Career heading'),
          vocab('galleryHeadline', 'Gallery heading'),
          vocab('travelsFrom', 'Travels from'),
        ],
      },
    ],
  },
  {
    slug: 'ways-to-book',
    title: 'Ways to book',
    description: 'The booking formats: which ones show, in what order, and their wording.',
    live: '/ways-to-book',
    sections: site => [
      {
        title: 'Page',
        fields: [
          { path: 'waysTitle', label: 'Heading' },
          vocab('waysLead', 'Intro', 'textarea'),
          {
            path: 'formatKeys',
            label: 'Formats shown, in order',
            kind: 'lines',
            hint: `One per line. Available: ${Object.keys(FORMATS).join(', ')}.`,
          },
        ],
      },
      ...formatOrder(site).map(key => ({
        title: `${(FORMATS as Record<string, { title: string }>)[key].title}${(site.formatKeys ?? []).includes(key) ? '' : ' (not shown)'}`,
        intro: `Format id: ${key}`,
        fields: FORMAT_TEXT.map(([prop, label, kind]) => ({
          path: `formats.${key}.${prop}`,
          label,
          kind,
          placeholder: String((FORMATS as Record<string, Record<string, unknown>>)[key][prop] ?? ''),
        })),
      })),
    ],
  },
  {
    slug: 'event-spaces',
    title: 'Event spaces',
    description: 'The stadium event spaces promotion on the home page and the Event spaces link in the menu.',
    live: '',
    sections: () => [
      {
        title: 'Event spaces',
        fields: [
          { path: 'eventSpaces.eyebrow', label: 'Eyebrow' },
          { path: 'eventSpaces.heading', label: 'Heading' },
          { path: 'eventSpaces.copy', label: 'Text', kind: 'textarea', wide: true },
          { path: 'eventSpaces.image', label: 'Image', kind: 'image' },
          { path: 'eventSpaces.imageAlt', label: 'Image description' },
          { path: 'eventSpaces.buttonText', label: 'Button text' },
          { path: 'eventSpaces.url', label: 'Button link', kind: 'url' },
        ],
      },
    ],
  },
  {
    slug: 'about',
    title: 'About',
    description: 'The About page: title, intro and image.',
    live: '/about',
    sections: () => [
      {
        title: 'About',
        fields: [
          { path: 'pages.about', label: 'Show the About page', kind: 'check', default: true },
          vocab('aboutTitle', 'Title'),
          vocab('aboutLead', 'Intro', 'textarea', 'Follows the platform name: “Spurs Speaker Network …”.'),
          { path: 'home.aboutImage', label: 'Image', kind: 'image' },
        ],
      },
    ],
  },
  {
    slug: 'faqs',
    title: 'FAQs',
    description: 'Questions on the home page, speaker profiles and category pages. Empty fields use the standard wording.',
    live: '',
    sections: () => [
      {
        title: 'Placeholders',
        intro:
          '{org} is the club, {platform} the network, {stadium} the venue. {first|a legend} is the speaker’s first name on a profile, and the text after | elsewhere.',
        fields: [],
      },
      ...(FAQ as { key: string; q: string; a: string }[]).map(entry => ({
        title: entry.q.replace(/\{(\w+)\|([^}]*)\}/g, '$2'),
        fields: [
          { path: `faqOverrides.${entry.key}.q`, label: 'Question', placeholder: entry.q, wide: true },
          { path: `faqOverrides.${entry.key}.a`, label: 'Answer', kind: 'textarea' as const, placeholder: entry.a, wide: true },
        ],
      })),
    ],
  },
  {
    slug: 'site',
    title: 'Header, footer & names',
    description: 'Names used across the site, the footer contact block, and the words for “speaker”.',
    live: '',
    sections: () => [
      {
        title: 'Names',
        fields: [
          { path: 'orgName', label: 'Club name' },
          { path: 'short', label: 'Short name' },
          { path: 'platform', label: 'Network name' },
          { path: 'platformShort', label: 'Network short name' },
          { path: 'stadium', label: 'Stadium' },
          { path: 'motto', label: 'Motto' },
        ],
      },
      {
        title: 'Footer',
        fields: [
          { path: 'tagline', label: 'Tagline' },
          { path: 'entity', label: 'About line', kind: 'textarea', wide: true },
          { path: 'copyright', label: 'Copyright holder' },
          vocab('officialFooter', 'Official line'),
          { path: 'contact.email', label: 'Contact email' },
          { path: 'contact.phone', label: 'Contact phone' },
          { path: 'contact.hours', label: 'Opening hours' },
        ],
      },
      {
        title: 'Wording',
        fields: [
          vocab('legendNoun', 'Word for one speaker'),
          vocab('legendsNoun', 'Word for speakers'),
          vocab('officialLabel', 'Official label'),
          vocab('officialSmall', 'Official label (short)'),
          vocab('assureRoles', 'Who you can book'),
        ],
      },
      {
        title: 'Pages',
        fields: [{ path: 'pages.waysToBook', label: 'Show the Ways to book page', kind: 'check', default: true }],
      },
    ],
  },
];

/** The style guide's editable part: brand colours and shapes (lib/render/theme.ts turns them into CSS variables). */
export const STYLE_SECTIONS: Section[] = [
  {
    title: 'Brand colours',
    fields: [
      { path: 'theme.brand', label: 'Brand', kind: 'color', hint: 'Headings, links and navy panels.' },
      { path: 'theme.ink', label: 'Ink', kind: 'color', hint: 'Text on light backgrounds.' },
      { path: 'theme.dark', label: 'Dark', kind: 'color', hint: 'Dark sections and the footer.' },
      { path: 'theme.bar', label: 'Bar', kind: 'color', hint: 'The top utility bar.' },
    ],
  },
  {
    title: 'Shapes and type',
    fields: [
      { path: 'style.buttonRadius', label: 'Button corner radius', hint: 'A CSS length: 0 for square, 999px for pills.' },
      { path: 'style.cardRadius', label: 'Card corner radius', hint: 'A CSS length, e.g. 0 or 8px.' },
      {
        path: 'style.buttonCase',
        label: 'Button text',
        kind: 'select',
        options: [
          ['none', 'As written'],
          ['uppercase', 'UPPERCASE'],
        ],
      },
      {
        path: 'style.headingCase',
        label: 'Heading text',
        kind: 'select',
        options: [
          ['none', 'As written'],
          ['uppercase', 'UPPERCASE'],
        ],
      },
      {
        path: 'style.headingStyle',
        label: 'Heading style',
        kind: 'select',
        options: [
          ['normal', 'Upright'],
          ['italic', 'Italic'],
        ],
      },
    ],
  },
];

/**
 * Every editable field by path, for the visual editor: the page editors' fields (the first page listing a path wins),
 * with `page` naming the page editor that holds it.
 */
export function fieldCatalog(site: SiteLike): Map<string, Field & { page: string }> {
  const catalog = new Map<string, Field & { page: string }>();
  for (const page of PAGES)
    for (const field of fieldsOf(page.sections(site))) if (!catalog.has(field.path)) catalog.set(field.path, { ...field, page: page.slug });
  return catalog;
}

/** The page editor for a live page path (`/spurs/legends/…` → profile). */
export function pageForPath(base: string, pathname: string): string | null {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) || '/' : null;
  if (rest === null) return null;
  if (rest === '/') return 'home';
  if (rest === '/legends') return 'speakers';
  if (rest.startsWith('/legends/')) return 'profile';
  if (rest.startsWith('/category/')) return 'categories';
  if (rest === '/ways-to-book') return 'ways-to-book';
  if (rest === '/about') return 'about';
  return null;
}

export const findPage = (slug: string) => PAGES.find(page => page.slug === slug) ?? null;
export const fieldsOf = (sections: Section[]) => sections.flatMap(section => section.fields);

// ---- Reading and writing values by path ----

const isIndex = (part: string) => /^\d+$/.test(part);

export function getPath(target: SiteLike, path: string): unknown {
  let node: unknown = target;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as SiteLike)[part];
  }
  return node;
}

function setPath(target: SiteLike, path: string, value: unknown): void {
  const parts = path.split('.');
  let node: SiteLike = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (node[part] === null || typeof node[part] !== 'object') {
      if (value === undefined) return;
      node[part] = isIndex(parts[i + 1]) ? [] : {};
    }
    node = node[part];
  }
  const last = parts[parts.length - 1];
  if (value === undefined) {
    if (Array.isArray(node)) node[Number(last)] = undefined;
    else delete node[last];
  } else node[last] = value;
}

const isEmpty = (value: unknown) =>
  value === undefined ||
  (Array.isArray(value) && value.length === 0) ||
  (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

/** After edits: drop emptied rows from lists and emptied objects, from the field up to the top. */
function prune(target: SiteLike, path: string): void {
  const parts = path.split('.');
  for (let depth = parts.length - 1; depth >= 1; depth--) {
    const parentPath = parts.slice(0, depth).join('.');
    const container = getPath(target, parentPath);
    if (Array.isArray(container)) {
      const kept = container.filter(item => !isEmpty(item));
      if (kept.length !== container.length) setPath(target, parentPath, kept);
    }
    if (isEmpty(getPath(target, parentPath))) setPath(target, parentPath, undefined);
  }
}

/** FAQ overrides may be a bare answer string; the editor works on { q, a } and stores an answer-only edit as a string. */
const expandFaq = (site: SiteLike) => {
  for (const [key, value] of Object.entries(site.faqOverrides ?? {})) if (typeof value === 'string') site.faqOverrides[key] = { a: value };
};
const collapseFaq = (site: SiteLike) => {
  for (const [key, value] of Object.entries(site.faqOverrides ?? {}) as [string, { q?: string; a?: string }][])
    if (value && !value.q && value.a) site.faqOverrides[key] = value.a;
};

/** The current value of a field as the form shows it. */
export function fieldValue(site: SiteLike, field: Field): string | boolean {
  const copy = structuredClone(site);
  expandFaq(copy);
  const value = getPath(copy, field.path);
  if (field.kind === 'check') return typeof value === 'boolean' ? value : field.default === true;
  if (field.kind === 'lines') return Array.isArray(value) ? value.join('\n') : '';
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

/** The site with this page's fields taken from the form. */
export function applyForm(site: SiteLike, fields: Field[], form: { get(name: string): unknown }): SiteLike {
  const next = structuredClone(site);
  expandFaq(next);
  for (const field of fields) {
    const raw = form.get(field.path);
    let value: unknown;
    if (field.kind === 'check') {
      const on = raw === 'on';
      value = on === (field.default === true) ? undefined : on;
    } else {
      const text = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim() : '';
      if (field.kind === 'lines') {
        const lines = text
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean);
        value = lines.length ? lines : undefined;
      } else value = text || undefined;
    }
    setPath(next, field.path, value);
  }
  for (const field of fields) prune(next, field.path);
  collapseFaq(next);
  return next;
}

/** Image ids each image is used by: speakers, the home page, roles, event spaces. */
export function imageUses(site: SiteLike): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  const add = (id: unknown, label: string) => {
    if (typeof id !== 'string' || !id) return;
    const list = uses.get(id) ?? [];
    if (!list.includes(label)) list.push(label);
    uses.set(id, list);
  };
  for (const person of site.people ?? []) {
    add(person.hero, person.name);
    add(person.card, person.name);
    for (const id of person.gallery ?? []) add(id, person.name);
  }
  const home = site.home ?? {};
  add(home.hero?.image, 'Home hero');
  add(home.inset?.image, 'Home hero');
  for (const slide of home.slides ?? []) add(slide.image, 'Home carousel');
  add(home.aboutImage, 'About');
  for (const key of ['eraImage', 'storyImage', 'hospitalityImage']) add(home[key], 'Home');
  for (const role of site.roles ?? []) add(role.image, `${role.label} tile`);
  add(site.eventSpaces?.image, 'Event spaces');
  return uses;
}
