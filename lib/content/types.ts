// Content types for the Appearances sites, derived from docs/content-model.md and the JSON in src/sites/.
// Every provider (JSON today, a CMS or Airtable later) returns these shapes, so components never see storage details.
// String values are stored as trusted "HTML text": in practice plain text where `&amp;` stands for `&`.
// The renderer decodes entities and lets React escape (see lib/render/text.ts).

export type RoleKey = 'player' | 'manager' | 'staff' | 'women' | 'squad';
export type FormatKey = 'keynote' | 'dinner' | 'appearance' | 'hospitality' | 'brand' | 'clinic' | 'fan' | 'workshop' | 'virtual';
export type CrestTreatment = 'full' | 'white' | 'hide';
export type PageKey = 'waysToBook' | 'hospitality' | 'about';
export type LegalKind = 'terms' | 'privacy' | 'accessibility';

/** registry.json */
export interface Registry {
  /** Every site folder in landing-page order, inactive sites included. */
  order: string[];
  /**
   * Where `/` on the hub redirects; must be an active site. Absent (the default): `/` serves the PepTalk landing page,
   * and `/all` answers 301 to `/`. Set: the landing page stays at `/all`.
   */
  rootSite?: string;
  /** Old slug -> new slug; pages and Open Graph cards answer 301. */
  redirects: Record<string, string>;
  /**
   * The hub pages (the landing page, /terms, /privacy) may be indexed by search engines and listed in sitemaps (default false).
   * See lib/seo/indexing.ts; a preview deployment never indexes, whatever this says.
   */
  indexable?: boolean;
  /**
   * Per-site domains: `{ "<slug>": { primary, aliases, live } }` (lib/domains.ts, docs/domains.md). A site with a domain
   * is also served at the root of its own host; once `live`, its hub folder answers 301 and canonical URLs use the domain.
   */
  domains?: Record<string, { primary: string; aliases: string[]; live: boolean }>;
}

/** Content language of a site (BCP 47): `<html lang>`, `og:locale` and `inLanguage` in structured data. */
export type SiteLang = 'en-GB' | 'en-US';

export interface Theme {
  brand: string;
  ink: string;
  dark: string;
  bar: string;
  display: string;
  tint?: string;
  line?: string;
  muted?: string;
  mutedDark?: string;
  faint?: string;
}

export interface StyleTokens {
  buttonRadius?: string;
  buttonCase?: string;
  buttonClip?: boolean;
  headingCase?: string;
  headingStyle?: string;
  cardRadius?: string;
}

/** `null` image ids are allowed only on `status: "shell"` sites (rendered as a labelled placeholder). */
export type ImageId = string | null;

export interface Slot {
  image: ImageId;
  name: string;
  line: string;
  tag?: string;
}

export interface Home {
  hero: Slot;
  inset: Slot;
  eraImage: ImageId;
  storyImage: ImageId;
  hospitalityImage: ImageId;
  activeEra: string;
  /** More hero slides after `hero`: the hero photo becomes a carousel (lib/behaviour.ts rotates it). */
  slides?: Slot[];
  /** Speaker photo beside the about page's introduction. */
  aboutImage?: ImageId;
}

export interface Role {
  key: RoleKey;
  label: string;
  blurb: string;
  image?: ImageId;
  singular?: string;
  browseLabel?: string;
  /** "Why book a manager": the category page's pitch section (else the page shows popular topics and formats). */
  pitch?: RolePitch;
}

export interface RolePitch {
  eyebrow: string;
  heading: string;
  lead: string;
  points: { title: string; text: string }[];
}

export interface Era {
  key: string;
  label: string;
  blurb: string;
}

export interface Format {
  title: string;
  short: string;
  desc: string;
  items: string[];
}

export interface FaqEntry {
  key: string;
  q: string;
  a: string;
  profile: boolean;
  /** Shown on the home page too (default true; the about page shows every entry). */
  home?: boolean;
  /** Only for sites with a venue-hire promotion (site.json eventSpaces.url). */
  venue?: boolean;
}

export type Pair = [string, string];

/** Wording: VOCAB in src/copy/defaults.mjs merged with site.json `vocab`. */
export interface Vocab {
  rolesEyebrow: string;
  heroLead: string;
  rosterLead: string;
  staffPill: string;
  rolesHeadline: string;
  whoOptions: string[];
  whereOptions: string[];
  fixtureWord: string;
  assureRoles: string;
  eraHeadline: string | null;
  eraLead: string;
  eventStoryTitle: string;
  galleryHeadline: string;
  howTitle: string;
  diaryCheck: string;
  hospitalityTitle: string;
  hospitalityEyebrow: string;
  hospitalityHeadline: string;
  hospitalityLead: string | null;
  hospitalityBody: string;
  hospitalityMetrics: Pair[];
  eventStoryBody: string | null;
  quote: string;
  careerHeadline: string | null;
  waysLead: string | null;
  pastEvents: [string, string, string][] | null;
  peopleNoun: string;
  aboutLead: string | null;
  beyondUrl: string;
  beyondLinkText: string;
  beyondLead: string;
  squadEyebrow: string;
  squadHeadline: string;
  squadLead: string;
  squadLinkText: string;
  featuredEyebrow: string;
  featuredHeadline: string;
  legendNoun: string;
  legendsNoun: string;
  storyMetrics: Pair[];
  quoteEyebrow: string;
  quoteCite: string;
  profileQuote: string;
  formHeadline: string;
  officialLabel: string | null;
  officialLegendLabel: string | null;
  officialFooter: string;
  navLabels: NavLabels;
  travelsFrom: string;
  /** About page h1, title and breadcrumb. The shared default is null; the render context fills "About <platform>". */
  aboutTitle: string | null;
  /** Enquiry consent line; `{terms:label}` and `{privacy:label}` become links to the site's legal pages. */
  consentLine: string;
  /** Keys with no shared default. */
  officialSmall?: string;
  currentNoun?: string;
}

export interface NavLabels {
  legends: string;
  ways: string;
  hospitality: string;
  about: string;
}

export interface Person {
  slug: string;
  name: string;
  first: string;
  /** `false` hides the profile and removes the person from every list. */
  active?: boolean;
  role: RoleKey;
  roleLabel: string;
  era: string;
  limited: boolean;
  hero: ImageId;
  card: ImageId;
  gallery: ImageId[];
  pos: string;
  short: string;
  honour: string;
  line: string;
  stats: Pair[];
  bio: string[];
  why: string;
  timeline: Pair[];
  talks: string[];
  audiences: string[];
  industries: string[];
  formats: FormatKey[];
  langs: string;
  travelsFrom?: string;
  /**
   * Official profiles of this person elsewhere (club page, Wikipedia, Wikidata, verified social accounts) as https URLs.
   * Emitted as Person.sameAs in structured data; empty or absent by default. Only add pages that are about this person.
   */
  sameAs?: string[];
}

/** `{ "<getty id>": "<https url>" }` */
export type Images = Record<string, string>;

/** Partner venue promotion. Omit/empty url hides it on every page. Image is an images.json key. */
export interface EventSpaces {
  url?: string;
  heading?: string;
  copy?: string;
  image?: string;
  imageAlt?: string;
  buttonText?: string;
  /** Small label above the heading (default "Event spaces"). */
  eyebrow?: string;
}

/** Contact details shown under the footer's brand column; each line only when set. */
export interface Contact {
  email?: string;
  phone?: string;
  hours?: string;
}

/** site.json as stored. */
export interface SiteConfig {
  slug: string;
  active?: boolean;
  /**
   * Launch switch for search engines (default false): robots meta and X-Robots-Tag allow indexing, the site's pages
   * join the sitemaps, robots.txt allows the site, /<slug>/llms.txt is served, and the site's pages no longer need a
   * preview password. Rejected on shell sites and sites with demo pages. See docs/brand-and-legal.md (launch checklist).
   */
  indexable?: boolean;
  /** Content language (default en-GB; en-US for US leagues). */
  lang?: SiteLang;
  pages?: Partial<Record<PageKey, boolean>>;
  status?: 'shell';
  short: string;
  orgName: string;
  platform: string;
  platformShort: string;
  tagline: string;
  entity: string;
  motto: string | null;
  copyright: string;
  heroTitle: [string, string];
  /** Words the hero headline cycles through; the first must end `heroTitle[0]` (it is the one crawlers read). */
  heroWords?: string[];
  waysTitle: string;
  stadium: string;
  marks: { crest?: string | null; wordmark?: string | null };
  navMark: 'wordmark' | 'crest';
  crestOnLight?: boolean;
  crestOn?: Partial<Record<'bar' | 'brand' | 'dark', CrestTreatment>>;
  crestFallback?: string;
  theme: Theme;
  style?: StyleTokens;
  cspHosts?: string[];
  orgType?: string;
  /** Tag Manager / GA4 ids (off by default; lib/tracking.ts). Loaded by the one shared tracking component. */
  tracking?: { gtmId?: string; ga4Id?: string };
  /** `required: true` loads tags only after the visitor accepts in the consent banner (default false). */
  consent?: { required?: boolean };
  eventSpaces?: EventSpaces;
  featured: string[];
  home: Home;
  homeLayout?: { waysAfterRoles?: boolean; hideEras?: boolean };
  demoHome?: boolean;
  demoProfiles?: string[];
  vocab?: Partial<Omit<Vocab, 'navLabels'>> & { navLabels?: Partial<NavLabels> };
  formats?: Partial<Record<FormatKey, Partial<Format>>>;
  /** The formats this site offers, in display order (default: every format in src/copy/defaults.mjs). */
  formatKeys?: FormatKey[];
  contact?: Contact;
  faqOverrides?: Record<string, string | { q?: string; a?: string }>;
  roles: Role[];
  eras: Era[];
}

/** A site as stored: every person (hidden ones too) plus the never-rendered bookkeeping files. */
export interface RawSite extends SiteConfig {
  people: Person[];
  images: Images;
  licences: unknown;
  verification: unknown;
}

/** A site as published: hidden people removed, bookkeeping left behind. Only active sites are published. */
export interface Site extends SiteConfig {
  people: Person[];
  images: Images;
}

/** A legal document (terms, privacy) shared by every site. */
export interface LegalDoc {
  kind: LegalKind;
  title: string;
  /** "Last updated" text taken from the source, when it has one. */
  lastUpdated: string | null;
  /** Markdown body with the frontmatter and the "Last update" line removed. Render with lib/render/markdown.ts. */
  body: string;
  /** Frontmatter bookkeeping (`source`, `copied`, `status`, `note`); never rendered. */
  meta: Record<string, string>;
}
