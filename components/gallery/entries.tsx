// The component gallery's entries: every shared component in components/site/, rendered with one site's real content
// (/_gallery/<slug>, docs/onboarding.md). Each entry names the exports it shows in `covers`; test/next/gallery.test.ts
// fails when an export of components/site/ is in no entry, so a new component needs an entry here. Full pages are
// linked, not embedded (they bring their own header, footer and structured data).
import type { ReactNode } from 'react';
import type { FormatKey, LegalDoc, Person } from '../../lib/content/types.ts';
import type { SiteContext } from '../../lib/render/context.ts';
import { personNode } from '../../lib/seo/jsonld.ts';
import { Availability, Beyond, Card, ConsentBanner, FormSection, Official, WaysGrid } from '../site/components.tsx';
import { EventSpaces } from '../site/event-spaces.tsx';
import { Eras, EventStory, FeaturedGrid, HomeHero, Quote, RoleTiles, Squad, WaysSection } from '../site/home.tsx';
import { SiteFooter, SiteHeader } from '../site/layout.tsx';
import { AtAGlance, BookingCard, ClosingBand, LegalText, ProfileGallery, ProfileHero, Timeline } from '../site/pages.tsx';
import { A, Button, Crest, Crumbs, FaqItem, Form, Photo, Picture } from '../site/primitives.tsx';

export interface GalleryProps {
  /** The site's render context (hub folder copy, live links). */
  ctx: SiteContext;
  /** The same site in demo mode (look-only: no links, forms or controls). */
  demo: SiteContext;
  /** A person to show the person-level components with: the first legend, else the first person. */
  person: Person;
  /** The Terms, for the legal excerpt. */
  legal: LegalDoc;
}

export interface GalleryEntry {
  /** Anchor (`#g-<id>`) and stable name. */
  id: string;
  title: string;
  /** The components/site/ exports this entry shows. */
  covers: string[];
  /** Where they live. */
  source: string;
  note?: string;
  render(props: GalleryProps): ReactNode;
}

/** A labelled variant inside an entry (normal, limited, demo…). */
function Variant({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gallery-variant">
      <p className="gallery-variant-label">{label}</p>
      {children}
    </div>
  );
}

/** The profile column a profile section sits in on a real page (`.pbody` sets its spacing and type). */
function ProfileColumn({ children }: { children: ReactNode }) {
  return (
    <div className="wrap pbody gallery-pbody">
      <div>{children}</div>
    </div>
  );
}

/** Page components, the path segment they render at, and the page switch that can turn them off. */
const PAGES: { component: string; segment: string | ((person: Person) => string); page?: 'waysToBook' | 'hospitality' | 'about' }[] = [
  { component: 'HomePage', segment: '' },
  { component: 'LegendsPage', segment: '/legends' },
  { component: 'ProfilePage', segment: person => `/legends/${person.slug}` },
  { component: 'WaysToBookPage', segment: '/ways-to-book', page: 'waysToBook' },
  { component: 'HospitalityPage', segment: '/hospitality', page: 'hospitality' },
  { component: 'AboutPage', segment: '/about', page: 'about' },
  { component: 'CheckAvailabilityPage', segment: '/check-availability' },
  { component: 'SiteLegalPage', segment: '/terms' },
];

/** The first few blocks of a markdown document (blocks are separated by blank lines). */
const excerpt = (body: string, blocks = 6): string =>
  body
    .split(/\n\s*\n/)
    .slice(0, blocks)
    .join('\n\n');

export const GALLERY: GalleryEntry[] = [
  {
    id: 'event-spaces',
    title: 'Event Spaces',
    covers: ['EventSpaces'],
    source: 'components/site/event-spaces.tsx',
    render: ({ ctx }) =>
      ctx.site.eventSpaces?.url ? <EventSpaces ctx={ctx} /> : <p>No venue-hire URL configured; the module is hidden.</p>,
  },
  {
    id: 'header',
    title: 'Header and nav',
    covers: ['SiteHeader'],
    source: 'components/site/layout.tsx',
    note: 'Utility bar, mark and platform name, the nav (switched-off pages left out; here the roster is the current section) and the main call to action.',
    render: ({ ctx }) => <SiteHeader ctx={ctx} path="/legends" />,
  },
  {
    id: 'breadcrumbs',
    title: 'Breadcrumbs',
    covers: ['Crumbs'],
    source: 'components/site/primitives.tsx',
    note: 'The same trail is in the page’s BreadcrumbList structured data.',
    render: ({ ctx, person }) => (
      <Crumbs
        demo={false}
        crumbs={[
          { name: 'Home', path: ctx.home },
          { name: ctx.nl.legends, path: `${ctx.base}/legends` },
          { name: person.name, path: `${ctx.base}/legends/${person.slug}` },
        ]}
      />
    ),
  },
  {
    id: 'badges',
    title: 'Badges',
    covers: ['Official', 'Availability', 'Crest'],
    source: 'components/site/components.tsx, primitives.tsx',
    note: 'The official label, availability, the role and era pills, and the crest at every size (its treatment per surface comes from site.json → crestOn).',
    render: ({ ctx, person }) => (
      <div className="wrap gallery-row">
        <Variant label="Official label">
          <div className="p-hero gallery-inline">
            <Official ctx={ctx} label={`Official ${ctx.site.orgName} platform`} />
          </div>
        </Variant>
        <Variant label="Availability">
          <div className="gallery-row">
            <Availability person={{ limited: false }} />
            <Availability person={{ limited: true }} />
          </div>
        </Variant>
        <Variant label="Pills">
          <div className="p-hero gallery-inline">
            <div className="pills">
              <span className="pill">{person.roleLabel}</span>
              <span className="pill alt">{ctx.eraLabel(person.era)}</span>
            </div>
          </div>
        </Variant>
        <Variant label="Crest: xs, md, lg, xl">
          <div className="gallery-row gallery-crests">
            {(['xs', 'md', 'lg', 'xl'] as const).map(size => (
              <Crest key={size} ctx={ctx} size={size} />
            ))}
          </div>
        </Variant>
      </div>
    ),
  },
  {
    id: 'hero',
    title: 'Hero',
    covers: ['HomeHero'],
    source: 'components/site/home.tsx',
    note: 'Headline, role pills, the roster search, and the hero and inset photos (site.json → home).',
    render: ({ ctx }) => <HomeHero ctx={ctx} />,
  },
  {
    id: 'roles',
    title: 'Role tiles',
    covers: ['RoleTiles'],
    source: 'components/site/home.tsx',
    render: ({ ctx }) => <RoleTiles ctx={ctx} />,
  },
  {
    id: 'card',
    title: 'Person card',
    covers: ['Card', 'ShortlistButton'],
    source: 'components/site/components.tsx',
    note: 'Normal, limited availability (the amber pill, legends only) and demo (look-only: no links, disabled shortlist).',
    render: ({ ctx, demo, person }) => (
      <div className="wrap gallery-row gallery-cards">
        <Variant label="Normal">
          <Card ctx={ctx} person={{ ...person, limited: false }} />
        </Variant>
        <Variant label="Limited">
          <Card ctx={ctx} person={{ ...person, limited: true }} />
        </Variant>
        <Variant label="Demo">
          <div className="demo">
            <Card ctx={demo} person={person} />
          </div>
        </Variant>
      </div>
    ),
  },
  {
    id: 'featured',
    title: 'Featured grid',
    covers: ['FeaturedGrid', 'Beyond'],
    source: 'components/site/home.tsx',
    note: 'site.json → featured, then the “beyond” panel.',
    render: ({ ctx }) => <FeaturedGrid ctx={ctx} />,
  },
  {
    id: 'squad',
    title: 'Squad',
    covers: ['Squad'],
    source: 'components/site/home.tsx',
    note: 'The first six current players (role `squad`). The home page leaves the section out when a site has none.',
    render: ({ ctx }) =>
      ctx.hasSquad ? (
        <Squad ctx={ctx} />
      ) : (
        <p className="wrap gallery-empty">This site has no current players, so its home page has no squad section.</p>
      ),
  },
  {
    id: 'ways',
    title: 'Ways-to-book grid',
    covers: ['WaysSection', 'WaysGrid'],
    source: 'components/site/home.tsx, components.tsx',
    note: 'The home page section (short formats), then the detailed grid of the Ways to book page (site.json → formats).',
    render: ({ ctx }) => (
      <>
        <WaysSection ctx={ctx} />
        <div className="block">
          <div className="wrap">
            <WaysGrid ctx={ctx} keys={Object.keys(ctx.FORMATS) as FormatKey[]} detailed />
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'event-story',
    title: 'Event story',
    covers: ['EventStory'],
    source: 'components/site/home.tsx',
    note: 'Placeholder wording until real case studies exist (docs/brand-and-legal.md).',
    render: ({ ctx }) => <EventStory ctx={ctx} index={1} />,
  },
  {
    id: 'eras',
    title: 'Eras',
    covers: ['Eras'],
    source: 'components/site/home.tsx',
    note: 'Hidden on a home page with site.json → homeLayout.hideEras.',
    render: ({ ctx }) => <Eras ctx={ctx} />,
  },
  {
    id: 'quote',
    title: 'Quote',
    covers: ['Quote'],
    source: 'components/site/home.tsx',
    note: 'An unattributed placeholder (vocab.quote), never marked up as a review.',
    render: ({ ctx }) => <Quote ctx={ctx} />,
  },
  {
    id: 'form',
    title: 'Enquiry form',
    covers: ['FormSection', 'Consent'],
    source: 'components/site/components.tsx',
    note: 'Idle, error and sent. On a page the error and sent states follow the URL fragment the endpoint redirects to (#enquiry-error, #enquiry-sent), or the behaviour script; here they are fixed with `state`.',
    render: ({ ctx }) => (
      <>
        <Variant label="Idle">
          <FormSection ctx={ctx} tint={false} />
        </Variant>
        <Variant label="Error">
          <FormSection ctx={ctx} tint={false} state="error" idPrefix="gallery-error-" />
        </Variant>
        <Variant label="Sent">
          <FormSection ctx={ctx} tint={false} state="sent" idPrefix="gallery-sent-" />
        </Variant>
      </>
    ),
  },
  {
    id: 'faq',
    title: 'FAQ',
    covers: ['FaqItem'],
    source: 'components/site/primitives.tsx',
    note: 'A toggle normally, a static block on demo pages. The answer is in the HTML either way.',
    render: ({ ctx }) => {
      const faq = ctx.faq().slice(0, 3);
      return (
        <div className="wrap gallery-row gallery-halves">
          <Variant label="Normal">
            <div className="faq">
              {faq.map(({ q, a }) => (
                <FaqItem key={q} q={q} a={a} />
              ))}
            </div>
          </Variant>
          <Variant label="Demo">
            <div className="faq">
              {faq.map(({ q, a }) => (
                <FaqItem key={q} demo q={q} a={a} />
              ))}
            </div>
          </Variant>
        </div>
      );
    },
  },
  {
    id: 'profile-hero',
    title: 'Profile hero',
    covers: ['ProfileHero'],
    source: 'components/site/pages.tsx',
    render: ({ ctx, person }) => <ProfileHero ctx={ctx} person={person} />,
  },
  {
    id: 'at-a-glance',
    title: 'At a glance',
    covers: ['AtAGlance'],
    source: 'components/site/pages.tsx',
    render: ({ ctx, person }) => (
      <ProfileColumn>
        <AtAGlance ctx={ctx} person={person} />
      </ProfileColumn>
    ),
  },
  {
    id: 'booking-card',
    title: 'Booking card',
    covers: ['BookingCard'],
    source: 'components/site/pages.tsx',
    note: 'Sticky beside the profile on desktop.',
    render: ({ ctx, person }) => (
      <div className="wrap gallery-narrow">
        <BookingCard ctx={ctx} person={person} />
      </div>
    ),
  },
  {
    id: 'timeline',
    title: 'Timeline',
    covers: ['Timeline'],
    source: 'components/site/pages.tsx',
    render: ({ ctx, person }) => (
      <ProfileColumn>
        <Timeline ctx={ctx} person={person} />
      </ProfileColumn>
    ),
  },
  {
    id: 'gallery',
    title: 'Gallery',
    covers: ['ProfileGallery'],
    source: 'components/site/pages.tsx',
    render: ({ ctx, person }) => (
      <ProfileColumn>
        <ProfileGallery ctx={ctx} person={person} />
      </ProfileColumn>
    ),
  },
  {
    id: 'closing',
    title: 'Closing band',
    covers: ['ClosingBand'],
    source: 'components/site/pages.tsx',
    render: ({ ctx, person }) => (
      <ProfileColumn>
        <ClosingBand ctx={ctx} person={person} />
      </ProfileColumn>
    ),
  },
  {
    id: 'beyond',
    title: 'Beyond panel',
    covers: ['Beyond'],
    source: 'components/site/components.tsx',
    note: 'Signposts the wider PepTalk roster (vocab.beyondUrl, beyondLinkText, beyondLead). Not on profiles.',
    render: ({ ctx }) => (
      <div className="wrap">
        <Beyond ctx={ctx} />
      </div>
    ),
  },
  {
    id: 'footer',
    title: 'Footer',
    covers: ['SiteFooter'],
    source: 'components/site/layout.tsx',
    render: ({ ctx }) => <SiteFooter ctx={ctx} />,
  },
  {
    id: 'legal',
    title: 'Legal page excerpt',
    covers: ['LegalText'],
    source: 'components/site/pages.tsx',
    note: 'The opening of the Terms (src/copy/legal/terms.md, shared by every site; placeholder text until launch).',
    render: ({ ctx, legal }) => (
      <>
        <LegalText body={excerpt(legal.body)} />
        <p className="wrap gallery-more">
          <A href={`${ctx.base}/terms`}>The full page</A>
        </p>
      </>
    ),
  },
  {
    id: 'consent',
    title: 'Consent banner',
    covers: ['ConsentBanner'],
    source: 'components/site/components.tsx (built in the browser by public/tracking.js)',
    note: 'Shown only to sites with tracking and site.json → consent.required. Fixed to the bottom of the viewport on a page; placed inline here.',
    render: () => (
      <div className="wrap gallery-consent">
        <ConsentBanner />
      </div>
    ),
  },
  {
    id: 'photos',
    title: 'Photo slots',
    covers: ['Photo', 'Picture'],
    source: 'components/site/primitives.tsx',
    note: 'A photo from the site’s image map through the image optimizer, and the labelled placeholder shell sites show for a null image.',
    render: ({ ctx, person }) => (
      <div className="wrap gallery-row gallery-cards">
        <Variant label="Photo">
          {/* A slot's height comes from where it sits (.card .photo here), as on a page. */}
          <div className="card">
            <Photo ctx={ctx} id={person.card} cls="top" slot="card" alt={person.name} />
          </div>
        </Variant>
        <Variant label="Placeholder (null image)">
          <div className="card">
            <Picture url={null} slot="card" alt={person.name} />
          </div>
        </Variant>
      </div>
    ),
  },
  {
    id: 'primitives',
    title: 'Links, buttons and forms',
    covers: ['A', 'Button', 'Form'],
    source: 'components/site/primitives.tsx',
    note: 'Demo-aware primitives: on a demo page links lose their href, buttons are disabled and forms lose their action.',
    render: ({ ctx }) => (
      <div className="wrap gallery-row gallery-halves">
        <Variant label="Live">
          <Form className="gallery-form" action={`${ctx.base}/legends`} method="get">
            <A className="btn btn-line" href={`${ctx.base}/legends`}>
              A link
            </A>{' '}
            <Button className="btn btn-blue" type="submit">
              A button
            </Button>
          </Form>
        </Variant>
        <Variant label="Demo">
          <div className="demo">
            <Form demo className="gallery-form" action={`${ctx.base}/legends`} method="get">
              <A demo className="btn btn-line" href={`${ctx.base}/legends`}>
                A link
              </A>{' '}
              <Button demo className="btn btn-blue" type="submit">
                A button
              </Button>
            </Form>
          </div>
        </Variant>
      </div>
    ),
  },
  {
    id: 'structured-data',
    title: 'Structured data',
    covers: ['JsonLd'],
    source: 'components/site/primitives.tsx, lib/seo/jsonld.ts',
    note: 'JsonLd writes one JSON-LD @graph per page into a <script type="application/ld+json"> (a data block, never executed). Shown as text here: the Person node of a profile.',
    render: ({ ctx, person }) => (
      <div className="wrap">
        <pre className="gallery-code">
          <code>{JSON.stringify(personNode(ctx, person), null, 2)}</code>
        </pre>
      </div>
    ),
  },
  {
    id: 'pages',
    title: 'Full pages',
    covers: [
      'SiteLayout',
      'SimplePage',
      'HomePage',
      'LegendsPage',
      'ProfilePage',
      'WaysToBookPage',
      'HospitalityPage',
      'AboutPage',
      'CheckAvailabilityPage',
      'SiteLegalPage',
    ],
    source: 'components/site/home.tsx, pages.tsx, layout.tsx',
    note: 'Every page renders inside SiteLayout (header, breadcrumbs, footer, structured data); inner pages with a page head use SimplePage. Linked rather than embedded.',
    render: ({ ctx, person }) => (
      <ul className="wrap gallery-pages">
        {PAGES.map(({ component, segment, page }) => {
          const path = `${ctx.base}${typeof segment === 'function' ? segment(person) : segment}`;
          return (
            <li key={component}>
              <code>{component}</code>{' '}
              {page && !ctx.pages[page] ? <span>switched off for this site (site.json → pages.{page})</span> : <A href={path}>{path}</A>}
            </li>
          );
        })}
      </ul>
    ),
  },
];

/** The gallery entries' anchors, for the table of contents. */
export const galleryAnchor = (entry: Pick<GalleryEntry, 'id'>): string => `g-${entry.id}`;
