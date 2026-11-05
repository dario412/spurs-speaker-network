// The content contract: every shape a ContentProvider or PeopleProvider returns, described once. `npm run schema`
// emits schema/*.schema.json and the field tables in docs/content-contract.md from these definitions; the assertions at
// the bottom fail the typecheck if they ever disagree with lib/content/types.ts.

import { HOSTNAME } from '../../domains.ts';
import { GA4_ID, GTM_ID } from '../../tracking.ts';
import type { PeopleResult } from '../provider.ts';
import type { Images, LegalDoc, Person, RawSite, Registry, Site, SiteConfig, Vocab } from '../types.ts';
import { type Assert, type Infer, type Node, type Same, s } from './builder.ts';

export const SLUG_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$';
export const HTTPS_PATTERN = '^https://';
const HEX_PATTERN = '^#[0-9a-fA-F]{6}$';
const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

const slug = () => s.string({ pattern: SLUG_PATTERN }).label('slug');
const https = () => s.string({ pattern: HTTPS_PATTERN, format: 'uri' }).label('https URL');
const hex = () => s.string({ pattern: HEX_PATTERN }).label('#rrggbb');
const text = () => s.string({ minLength: 1 });
const hostname = () => s.string({ pattern: HOSTNAME.source }).label('hostname');

export const ROLE_KEYS = ['player', 'manager', 'staff', 'women', 'squad'] as const;
export const FORMAT_KEYS = ['keynote', 'dinner', 'appearance', 'hospitality', 'brand', 'clinic', 'fan', 'workshop', 'virtual'] as const;
export const PAGE_KEYS = ['waysToBook', 'hospitality', 'about'] as const;

const RoleKey = s.ref('RoleKey', s.enum(ROLE_KEYS).describe('Role group: drives roster filters and homepage tiles.'));
const FormatKey = s.ref('FormatKey', s.enum(FORMAT_KEYS).describe('One of the booking formats (src/copy/defaults.mjs).'));
const CrestTreatment = s.enum(['full', 'white', 'hide']);

const ImageId = s.ref(
  'ImageId',
  s
    .nullable(s.string({ minLength: 1 }))
    .describe(
      'A key of the site’s `images` map: a Getty id today ("2206513784"), the URL’s host and path for R2 images ("media.example.com/people/a.jpg"). `null` only on `status: "shell"` sites (a labelled placeholder renders).',
    ),
);

const Pair = s.ref('Pair', s.tuple([s.string(), s.string()]).describe('`[value, caption]` or `[year, text]`.'));

export const ImagesSchema = s.ref(
  'Images',
  s
    .record(https())
    .describe(
      'Image id -> https URL. Every id a person or slot references must be here; URLs must be on a host allowed by next/image and the CSP (Getty, the site’s hosts, IMAGE_HOSTS_EXTRA).',
    ),
);

export const PersonSchema = s.ref(
  'Person',
  s.object({
    slug: slug().describe('URL segment of the profile (`/<site>/legends/<slug>`). Unique within the site; keep it stable.'),
    name: text().describe('Display name.'),
    first: text().describe('First name, used in "Check Thierry’s availability".'),
    active: s.optional(
      s
        .boolean()
        .defaults(true)
        .describe('`false` hides the profile and removes the person from every list. A hidden person cannot be featured.'),
    ),
    role: RoleKey,
    roleLabel: text().describe('Role line on cards, e.g. "Ex-player · Goalkeeping coach".'),
    era: text().describe('An `eras[].key` of the site.'),
    limited: s.boolean().describe('Limited availability (current playing or major job; always true for `squad`). Shows the amber pill.'),
    hero: ImageId,
    card: ImageId,
    gallery: s.array(ImageId, { minItems: 3, maxItems: 3 }).describe('Exactly three image ids.'),
    pos: text().describe('Position line, e.g. "Striker · Arsenal 1999–2007 · France".'),
    short: text().describe('Card line.'),
    honour: text().describe('Headline honour.'),
    line: text().describe('Positioning line on the profile.'),
    stats: s
      .array(Pair, { maxItems: 4 })
      .describe('Four `[value, caption]` pairs, or none (the profile then leaves out its key stats); stable facts only.'),
    bio: s.array(text(), { minItems: 1 }).describe('Paragraphs of original copy (no quotes, no contested numbers).'),
    why: text().describe('"Best for" paragraph.'),
    timeline: s.array(Pair).describe('`[year, text]` entries, oldest first; empty leaves out the career section.'),
    talks: s.array(text(), { minItems: 1 }).describe('Talk topics.'),
    audiences: s.array(text()).describe('Audiences ("Great for"); empty leaves the list out.'),
    industries: s.array(text()).describe('Industries; empty leaves the list out.'),
    formats: s.array(FormatKey).describe('Booking formats offered, in display order.'),
    langs: text().describe('Languages, as display text ("English, French").'),
    travelsFrom: s.optional(text().describe('Defaults to the site’s `vocab.travelsFrom`.')),
    sameAs: s.optional(
      s
        .array(https(), { maxItems: 10, uniqueItems: true })
        .defaults([])
        .describe(
          'Up to 10 official profiles elsewhere (club page, Wikipedia, Wikidata, verified socials). Emitted as `Person.sameAs` in JSON-LD.',
        ),
    ),
  }),
);

const SiteDomain = s.ref(
  'SiteDomain',
  s.object({
    primary: hostname().describe('The canonical host: lowercase, no scheme, port, path or trailing dot.'),
    aliases: s
      .array(hostname(), { uniqueItems: true })
      .describe('Extra hosts that answer 301 to `primary`, keeping path and query. `[]` for none.'),
    live: s.boolean().describe('`true` once DNS and TLS work: the hub folder answers 301 to the domain, and canonical URLs use it.'),
  }),
);

export const RegistrySchema = s.ref(
  'Registry',
  s.object({
    order: s.array(slug(), { uniqueItems: true }).describe('Every site slug in landing-page order, inactive sites included.'),
    rootSite: s.optional(
      slug().describe(
        'Where `/` on the hub redirects; must be an active site. Absent: `/` serves the PepTalk landing page and `/all` answers 301 to `/`; set: the landing page stays at `/all`.',
      ),
    ),
    redirects: s.record(slug(), SLUG_PATTERN).describe('Old slug -> new slug; pages and Open Graph cards answer 301.'),
    indexable: s.optional(
      s.boolean().defaults(false).describe('Hub pages (the landing page, `/terms`, `/privacy`) may be indexed. Previews never index.'),
    ),
    domains: s.optional(
      s
        .record(SiteDomain, SLUG_PATTERN)
        .describe(
          'Per-site domains, keyed by a slug in `order` (docs/domains.md). A site with a domain is also served at the root of its own host; each host belongs to one site and never the hub’s host. Unpublished sites’ domains are ignored.',
        ),
    ),
  }),
);

const Theme = s.ref(
  'Theme',
  s.object({
    brand: hex(),
    ink: hex(),
    dark: hex(),
    bar: hex(),
    display: text().describe('Display font stack ending in a bundled font (Outfit or Barlow Condensed).'),
    tint: s.optional(hex().describe('Neutral; set tint, line, muted and mutedDark together.')),
    line: s.optional(hex()),
    muted: s.optional(hex()),
    mutedDark: s.optional(hex()),
    faint: s.optional(hex().describe('Defaults to `muted`.')),
  }),
);

const StyleTokens = s.ref(
  'StyleTokens',
  s.object({
    buttonRadius: s.optional(s.string().defaults('999px')),
    buttonCase: s.optional(s.string().defaults('none')),
    buttonClip: s.optional(s.boolean().defaults(false).describe('Chamfered button corners.')),
    headingCase: s.optional(s.string().defaults('uppercase')),
    headingStyle: s.optional(s.string().defaults('normal')),
    cardRadius: s.optional(s.string().defaults('16px')),
  }),
);

const Slot = s.ref(
  'Slot',
  s.object({
    image: ImageId,
    name: s.string(),
    line: s.string(),
    tag: s.optional(s.string().describe('`"br"` puts the name card bottom-right.')),
  }),
);

const Home = s.ref(
  'Home',
  s.object({
    hero: Slot,
    inset: Slot,
    eraImage: ImageId,
    storyImage: ImageId,
    hospitalityImage: ImageId,
    activeEra: text().describe('An `eras[].key`.'),
    slides: s.optional(s.array(Slot).describe('More hero slides after `hero`; the hero photo becomes a carousel.')),
    aboutImage: s.optional(ImageId),
    fromSpeakers: s.optional(
      s
        .boolean()
        .describe(
          'The hero, inset, carousel, about photo and role tile photos follow the live speakers (featured first), so only listed speakers are ever shown. The slots above then only set how many slides there are.',
        ),
    ),
  }),
);

const Role = s.ref(
  'Role',
  s.object({
    key: RoleKey,
    label: s.string(),
    blurb: s.string(),
    image: s.optional(ImageId),
    singular: s.optional(s.string()),
    browseLabel: s.optional(s.string()),
    pitch: s.optional(
      s
        .object({
          eyebrow: s.string(),
          heading: s.string(),
          lead: s.string(),
          points: s.array(s.object({ title: s.string(), text: s.string() }), { minItems: 1 }),
        })
        .describe('The category page\'s "why book" section; without it the page shows popular topics and formats.'),
    ),
  }),
);

const Era = s.ref('Era', s.object({ key: text(), label: s.string(), blurb: s.string() }));

const formatShape = { title: s.string(), short: s.string(), desc: s.string(), items: s.array(s.string()) };
const Format = s.ref('Format', s.object(formatShape));

const NAV_LABELS = { legends: s.string(), ways: s.string(), hospitality: s.string(), about: s.string() };
const NavLabels = s.ref('NavLabels', s.object(NAV_LABELS));

const str = () => s.string();
const strOrNull = () => s.nullable(s.string());
// Every wording key (VOCAB in src/copy/defaults.mjs). Sites override any subset in site.json `vocab`.
const vocabShape = {
  rolesEyebrow: str(),
  heroLead: str(),
  rosterLead: str(),
  staffPill: str(),
  rolesHeadline: str(),
  whoOptions: s.array(s.string()),
  whereOptions: s.array(s.string()),
  fixtureWord: str(),
  assureRoles: str(),
  eraHeadline: strOrNull(),
  eraLead: str(),
  eventStoryTitle: str(),
  galleryHeadline: str(),
  howTitle: str(),
  diaryCheck: str(),
  hospitalityTitle: str(),
  hospitalityEyebrow: str(),
  hospitalityHeadline: str(),
  hospitalityLead: strOrNull(),
  hospitalityBody: str(),
  hospitalityMetrics: s.array(Pair),
  eventStoryBody: strOrNull(),
  quote: str(),
  careerHeadline: strOrNull(),
  waysLead: strOrNull(),
  pastEvents: s.nullable(s.array(s.tuple([s.string(), s.string(), s.string()]))),
  peopleNoun: str(),
  aboutLead: strOrNull(),
  beyondUrl: str(),
  beyondLinkText: str(),
  beyondLead: str(),
  squadEyebrow: str(),
  squadHeadline: str(),
  squadLead: str(),
  squadLinkText: str(),
  featuredEyebrow: str(),
  featuredHeadline: str(),
  legendNoun: str(),
  legendsNoun: str(),
  storyMetrics: s.array(Pair),
  quoteEyebrow: str(),
  quoteCite: str(),
  profileQuote: str(),
  formHeadline: str(),
  officialLabel: strOrNull(),
  officialLegendLabel: strOrNull(),
  officialFooter: str(),
  travelsFrom: str(),
  aboutTitle: strOrNull(),
  consentLine: str(),
  trustOfficial: str(),
  trustShortlist: str(),
  trustManaged: str(),
  browseEyebrow: str(),
  homeRolesTitle: str(),
  waysEyebrow: str(),
  waysHomeLead: str(),
  homeFaqTitle: str(),
  faqLead: str(),
  howEyebrow: str(),
  howHeadline: str(),
  step1Title: str(),
  step1Text: str(),
  step2Title: str(),
  step2Text: str(),
  step3Title: str(),
  step3Text: str(),
  ctaTitle: str(),
  ctaLead: str(),
  checkAvailability: str(),
  eventSpacesNav: str(),
  findButton: str(),
  seeAllLink: str(),
  waysSeeWho: str(),
  waysHelpTitle: str(),
  waysHelpText: str(),
  askTeam: str(),
  esVenueTitle: str(),
  esVenueText: str(),
  esVenueLink: str(),
  ctaBrowse: str(),
};
const VocabFull = s.object({
  ...vocabShape,
  navLabels: NavLabels,
  officialSmall: s.optional(s.string()),
  currentNoun: s.optional(s.string()),
});
const VocabOverrides = s.ref(
  'VocabOverrides',
  s
    .partial({ ...vocabShape, officialSmall: s.string(), currentNoun: s.string(), navLabels: s.partial(NAV_LABELS) })
    .describe('Wording overrides; any key left out keeps the default in src/copy/defaults.mjs (VOCAB).'),
);

const FaqOverride = s.union([s.string({ minLength: 1 }), s.partial({ q: s.string({ minLength: 1 }), a: s.string({ minLength: 1 }) })]);

const siteConfigShape = {
  slug: slug().describe('URL folder (`/<slug>`).'),
  active: s.optional(
    s.boolean().defaults(true).describe('`false` leaves the whole site out: its URLs 404 and it leaves the landing page.'),
  ),
  indexable: s.optional(
    s.boolean().defaults(false).describe('Search launch switch. Rejected on shell sites and while demo pages are set.'),
  ),
  lang: s.optional(s.enum(['en-GB', 'en-US']).defaults('en-GB').describe('`<html lang>`, `og:locale`, `inLanguage`.')),
  pages: s.optional(
    s
      .partial({ waysToBook: s.boolean(), hospitality: s.boolean(), about: s.boolean() })
      .describe('Optional pages, each `true` by default. `false` removes the page and every link to it.'),
  ),
  status: s.optional(s.literal('shell').describe('Present only on shell sites: allows `null` images and placeholder copy.')),
  short: text().describe('Short name used in copy ("Spurs").'),
  orgName: text().describe('Organisation name ("Tottenham Hotspur").'),
  platform: text().describe('Site name ("Spurs Speaker Network").'),
  platformShort: text().describe('Nav short form.'),
  tagline: text().describe('Utility-bar text.'),
  entity: text().describe('One factual sentence describing the platform; used everywhere (footer, About, meta, JSON-LD, llms.txt).'),
  motto: s.nullable(s.string()).describe('Official motto, or null.'),
  copyright: text().describe('Rights holder’s legal name.'),
  heroTitle: s.tuple([s.string(), s.string()]).describe('The two hero headline lines.'),
  heroWords: s.optional(
    s.array(s.string(), { minItems: 2 }).describe('Words the hero headline cycles through; the first ends `heroTitle[0]`.'),
  ),
  waysTitle: text().describe('"Ways to book" heading.'),
  stadium: text().describe('Venue used in copy.'),
  marks: s
    .object({ crest: s.optional(s.nullable(https())), wordmark: s.optional(s.nullable(https())) })
    .describe('The organisation’s own crest and wordmark files, unmodified.'),
  navMark: s.enum(['wordmark', 'crest']).describe('What sits in the nav.'),
  crestOnLight: s.optional(s.boolean().describe('Crest artwork works on white.')),
  crestOn: s.optional(s.partial({ bar: CrestTreatment, brand: CrestTreatment, dark: CrestTreatment }).describe('Crest per surface.')),
  crestFallback: s.optional(s.string().describe('Text badge when there is no embeddable crest (required then).')),
  theme: Theme,
  style: s.optional(StyleTokens),
  cspHosts: s.optional(s.array(https()).describe('Origins the marks load from; added to the image CSP.')),
  orgType: s.optional(s.string().defaults('SportsTeam').describe('`SportsTeam` or `SportsOrganization` (structured data).')),
  tracking: s.optional(
    s
      .partial({
        gtmId: s.string({ pattern: GTM_ID.source }).describe('Google Tag Manager container, `GTM-XXXXXXX`.'),
        ga4Id: s.string({ pattern: GA4_ID.source }).describe('GA4 measurement id, `G-XXXXXXXXXX`.'),
      })
      .describe(
        'Tags the site loads (off by default; lib/tracking.ts). Unset: the TRACKING_GTM_ID fallback, else none. The CSP allows Google’s hosts only for sites with tags.',
      ),
  ),
  consent: s.optional(
    s
      .partial({
        required: s.boolean().defaults(false).describe('`true` loads tags only after the visitor accepts in the consent banner.'),
      })
      .describe('Consent banner for the tracking tags.'),
  ),
  eventSpaces: s.optional(
    s
      .partial({
        url: s
          .string({ pattern: '^$|^https://' })
          .describe('Partner venue-hire URL over HTTPS. Empty or absent hides the module on every page.'),
        heading: text(),
        copy: text(),
        image: text().describe('Image id in this site’s images map. Use a venue photo.'),
        imageAlt: text(),
        buttonText: text(),
        eyebrow: text().describe('Small label above the heading (default "Event spaces").'),
      })
      .describe(
        'Shared Event Spaces promotion. When url is set, all fields are required. Enquiries and bookings stay on the partner site.',
      ),
  ),
  featured: s.array(slug(), { minItems: 1 }).describe('People in "Featured this season": active people of this site.'),
  home: Home,
  homeLayout: s.optional(s.partial({ waysAfterRoles: s.boolean(), hideEras: s.boolean() })),
  demoHome: s.optional(s.boolean().describe('Render the home page as a look-only demo.')),
  demoProfiles: s.optional(s.array(slug()).describe('Profiles rendered as look-only demos.')),
  vocab: s.optional(VocabOverrides),
  formats: s.optional(
    s
      .partial(
        Object.fromEntries(FORMAT_KEYS.map(key => [key, s.partial(formatShape)])) as Record<
          (typeof FORMAT_KEYS)[number],
          Node<Partial<Infer<typeof Format>>>
        >,
      )
      .describe('Per-format overrides of title, short, desc, items.'),
  ),
  formatKeys: s.optional(s.array(FormatKey, { minItems: 1 }).describe('The formats this site offers, in display order (default: all).')),
  contact: s.optional(
    s
      .partial({ email: text(), phone: text(), hours: text() })
      .describe('Contact details under the footer brand column; each line shown only when set.'),
  ),
  faqOverrides: s.optional(
    s.record(FaqOverride).describe('Keyed by an FAQ `key` in src/copy/defaults.mjs: an answer string, or `{ q, a }`.'),
  ),
  roles: s.array(Role, { minItems: 1 }),
  eras: s.array(Era, { minItems: 1 }),
};

const people = () => s.array(PersonSchema).describe('Every person, in display order. Slugs unique.');

/** licences.json: never rendered; typed `unknown` in TypeScript, described here for providers that store approvals. */
const Licences = s.opaque<unknown>({
  type: 'object',
  description:
    'Licence approvals (bookkeeping, never rendered). An asset counts as licensed while `url` equals the URL in use; a changed URL makes the approval stale.',
  properties: {
    images: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          url: { type: 'string', pattern: HTTPS_PATTERN },
          note: { type: 'string' },
          approvedAt: { type: 'string', pattern: DATE_PATTERN },
        },
        required: ['url', 'approvedAt'],
        additionalProperties: false,
      },
    },
    marks: {
      type: 'object',
      propertyNames: { enum: ['crest', 'wordmark'] },
      additionalProperties: {
        type: 'object',
        properties: {
          url: { type: 'string', pattern: HTTPS_PATTERN },
          note: { type: 'string' },
          approvedAt: { type: 'string', pattern: DATE_PATTERN },
        },
        required: ['url', 'approvedAt'],
        additionalProperties: false,
      },
    },
  },
  required: ['images', 'marks'],
  additionalProperties: false,
});

/** verification.json: never rendered; checked in detail by src/sites/verification.mjs. */
const Verification = s.opaque<unknown>({
  type: 'object',
  description: 'Verification checklists (bookkeeping, never rendered). Item keys are defined in src/sites/verification.mjs.',
  properties: { pages: { type: 'object' }, people: { type: 'object' } },
  required: ['pages', 'people'],
  additionalProperties: false,
});

const SiteConfigSchema = s.object(siteConfigShape);

export const SiteSchema = s.ref(
  'Site',
  s
    .object({ ...siteConfigShape, people: people(), images: ImagesSchema })
    .describe('A published site (`listSites()`, `getSite()`): active only, hidden people removed, no bookkeeping.'),
);

export const RawSiteSchema = s.ref(
  'RawSite',
  s
    .object({ ...siteConfigShape, people: people(), images: ImagesSchema, licences: Licences, verification: Verification })
    .describe('A site as stored (`getRawSite()`, `listRawSites()`): hidden people and bookkeeping included.'),
);

export const LegalSchema = s.ref(
  'LegalDoc',
  s.object({
    kind: s.enum(['terms', 'privacy', 'accessibility']),
    title: text().describe('Page heading.'),
    lastUpdated: s.nullable(s.string()).describe('"Last updated" text from the source, or null.'),
    body: text().describe('Markdown body (safe subset, see docs/content-model.md → Legal pages).'),
    meta: s.record(s.string()).describe('Frontmatter bookkeeping (`source`, `status`, …); never rendered.'),
  }),
);

export const PeopleResultSchema = s.ref(
  'PeopleResult',
  s
    .object({ people: people(), images: ImagesSchema })
    .describe('What a PeopleProvider returns for one site (hidden people included; switches are applied afterwards).'),
);

/** The files `npm run schema` writes: schema/<file>.schema.json. */
export const ROOTS = [
  { file: 'registry', title: 'Registry', node: RegistrySchema, method: '`getRegistry()`' },
  { file: 'site', title: 'Site', node: SiteSchema, method: '`listSites()` items, `getSite()`' },
  { file: 'raw-site', title: 'RawSite', node: RawSiteSchema, method: '`listRawSites()` items, `getRawSite()`' },
  { file: 'person', title: 'Person', node: PersonSchema, method: '`site.people[]`' },
  { file: 'legal', title: 'LegalDoc', node: LegalSchema, method: '`getLegal(kind)`' },
  { file: 'people-result', title: 'PeopleResult', node: PeopleResultSchema, method: '`PeopleProvider.peopleFor(site)`' },
] as const;

// Compile-time drift checks: each line fails `npm run typecheck` if lib/content/types.ts and this file disagree.
export type ContractChecks = [
  Assert<Same<Infer<typeof PersonSchema>, Person>>,
  Assert<Same<Infer<typeof RegistrySchema>, Registry>>,
  Assert<Same<Infer<typeof ImagesSchema>, Images>>,
  Assert<Same<Infer<typeof SiteConfigSchema>, SiteConfig>>,
  Assert<Same<Infer<typeof SiteSchema>, Site>>,
  Assert<Same<Infer<typeof RawSiteSchema>, RawSite>>,
  Assert<Same<Infer<typeof LegalSchema>, LegalDoc>>,
  Assert<Same<Infer<typeof VocabFull>, Vocab>>,
  Assert<Same<Infer<typeof PeopleResultSchema>, PeopleResult>>,
];
