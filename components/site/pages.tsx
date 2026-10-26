// Inner pages of a site: roster, profile, ways to book, hospitality, about, enquiry, legal; and the profile's sections,
// exported so the component gallery (/_gallery) can show each on its own.
import type { FormatKey, LegalDoc, Person } from '../../lib/content/types.ts';
import { personAlt } from '../../lib/render/alt.ts';
import { PEPTALK, type SiteContext } from '../../lib/render/context.ts';
import { renderMarkdown } from '../../lib/render/markdown-view.ts';
import {
  aboutCopy,
  checkAvailabilityCopy,
  hospitalityCopy,
  legalCopy,
  legendsCopy,
  listText,
  profileCopy,
  waysCopy,
} from '../../lib/seo/copy.ts';
import { type Crumb, faqNode, peopleListNode, personNode, servicesNode, siteGraph } from '../../lib/seo/jsonld.ts';
import { Availability, Beyond, Card, FormSection, Official, ShortlistButton, WaysGrid } from './components.tsx';
import { SimplePage, SiteLayout } from './layout.tsx';
import { A, Button, Crest, FaqItem, Photo } from './primitives.tsx';

/** Home, then the given trail. The visible breadcrumbs and the BreadcrumbList use the same list. */
const trail = ({ home }: SiteContext, ...rest: Crumb[]): Crumb[] => [{ name: 'Home', path: home }, ...rest];

/** Cards in the first rows load eagerly; the rest wait until they scroll near the viewport. */
const EAGER_CARDS = 3;

/** Display titles of booking formats, in the given order. */
const formatTitles = ({ FORMATS }: SiteContext, keys: FormatKey[]): string[] => keys.map(key => FORMATS[key].title);

export function LegendsPage({ ctx }: { ctx: SiteContext }) {
  const { site, base, v, nl, demo } = ctx;
  const chips: [string, string][] = [['', 'All'], ...site.roles.map(role => [role.key, role.label] as [string, string])];
  const path = `${base}/legends`;
  const crumbs = trail(ctx, { name: nl.legends, path });
  const heading = `${site.short} ${v.legendsNoun}`;
  const graph = siteGraph({
    ctx,
    path,
    type: 'CollectionPage',
    name: heading,
    description: legendsCopy(ctx).description,
    crumbs,
    mainEntity: peopleListNode(ctx, site.people, ctx.url(path), heading),
  });
  return (
    <SiteLayout ctx={ctx} path="/legends" graph={graph} crumbs={crumbs}>
      <section className="page-head">
        <div className="wrap">
          <span className="eyebrow">The roster</span>
          <h1 className="disp">
            {site.short} {v.legendsNoun}
          </h1>
          <p className="lead">{v.rosterLead}</p>
        </div>
      </section>
      <section className="block first">
        <div className="wrap" data-roster="">
          {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> would restyle the chip row; role="group" names it for assistive tech. */}
          <div className="filters" role="group" aria-label="Filter by role">
            {chips.map(([key, label]) => (
              <Button demo={demo} key={key} className="chip" type="button" data-filter="role" data-value={key} aria-pressed={key === ''}>
                {label}
              </Button>
            ))}
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> would restyle the chip row; role="group" names it for assistive tech. */}
          <div className="filters" role="group" aria-label="Filter by era">
            {site.eras.map(era => (
              <Button demo={demo} key={era.key} className="chip" type="button" data-filter="era" data-value={era.key} aria-pressed="false">
                {era.label}
              </Button>
            ))}
            <label className="chip searchbox">
              <input
                className="roster-q"
                type="search"
                placeholder="Search name or theme"
                aria-label={`Search ${v.legendsNoun}`}
                disabled={demo || undefined}
              />
            </label>
          </div>
          {/* The cards sit directly under the page's <h1>, so their names are <h2>s. */}
          <div className="grid">
            {site.people.map((person, i) => (
              <Card key={person.slug} ctx={ctx} person={person} level={2} eager={i < EAGER_CARDS} />
            ))}
          </div>
          {/* Shown by the filters when nothing matches; shown from the start (no script needed) when the roster is empty. */}
          <p className="empty" hidden={site.people.length > 0}>
            No {v.legendsNoun} match those filters yet.{' '}
            <A demo={demo} href={v.beyondUrl} rel="noopener">
              <b>Browse {v.beyondLinkText} →</b>
            </A>
          </p>
          <Beyond ctx={ctx} />
        </div>
      </section>
    </SiteLayout>
  );
}

export function ProfilePage({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { site, base, v, nl, FORMATS, demo } = ctx;
  const others = site.people.filter(other => other.slug !== person.slug);
  const sims = [...others.filter(other => other.role === person.role), ...others.filter(other => other.role !== person.role)].slice(0, 3);
  const path = `${base}/legends/${person.slug}`;
  const url = ctx.url(path);
  const crumbs = trail(ctx, { name: nl.legends, path: `${base}/legends` }, { name: person.name, path });
  const faq = ctx.faq(person);
  const graph = siteGraph({
    ctx,
    path,
    type: 'ProfilePage',
    name: profileCopy(ctx, person).title,
    description: person.line,
    crumbs,
    image: person.hero ? site.images[person.hero] : null,
    mainEntity: personNode(ctx, person),
    extra: [faqNode(faq, url, ctx)],
  });
  const tags = (items: string[], label: string) => (
    <ul className="tags" aria-label={label}>
      {items.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
  const pastEvents = v.pastEvents ?? [
    ['Matchday hospitality · placeholder', `Partner lounge host, ${site.stadium}`, '120 guests · pre-match Q&A and table visits'],
    ['Keynote · placeholder', 'Sales kick-off, London', '400 delegates · 40-minute keynote and Q&A'],
  ];
  return (
    <SiteLayout ctx={ctx} path="/legends" graph={graph} crumbs={crumbs}>
      <ProfileHero ctx={ctx} person={person} />
      <nav className="subnav" aria-label="Profile sections">
        <div className="wrap">
          {(
            [
              ['overview', 'Overview'],
              ['career', 'Career'],
              ['talks', 'Talks about'],
              ['formats', 'Ways to book'],
              ['gallery', 'Gallery'],
              ['events', 'Past events'],
              ['faq', 'FAQ'],
              ['book', 'Book'],
            ] as const
          ).map(([id, label]) => (
            <A demo={demo} key={id} href={`#${id}`}>
              {label}
            </A>
          ))}
        </div>
      </nav>
      <div className="wrap pbody">
        <div>
          <AtAGlance ctx={ctx} person={person} />{' '}
          <section className="bio" id="about">
            <span className="eyebrow">Overview</span>
            <h2>About {person.first}</h2>
            {person.bio.map(paragraph => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <div className="why">{person.why}</div>
          </section>{' '}
          <Timeline ctx={ctx} person={person} />{' '}
          <section id="talks">
            <span className="eyebrow">Talks about</span>
            <h2>Themes &amp; audiences</h2>{' '}
            <div className="taglists">
              <div>
                <h3>Talks about</h3>
                {tags(person.talks, `${person.first} talks about`)}
              </div>
              <div>
                <h3>Great for</h3>
                {tags(person.audiences, `${person.first} is great for`)}
              </div>
              <div>
                <h3>Industries</h3>
                {tags(person.industries, `Industries ${person.first} works with`)}
              </div>
            </div>
          </section>{' '}
          <section id="formats">
            <span className="eyebrow">Ways to book</span>
            <h2>How you can work with {person.first}</h2>{' '}
            <div className="formats">
              {person.formats.map(key => {
                const format = FORMATS[key];
                return (
                  <div className="fmt" key={key}>
                    <h3>{format.title}</h3>
                    <p>{format.desc}</p>
                    <ul>
                      {format.items.map(item => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>{' '}
          <ProfileGallery ctx={ctx} person={person} />{' '}
          <section id="events">
            <span className="eyebrow">Past events</span>
            <h2>Recent appearances</h2>{' '}
            <div className="events">
              {pastEvents.map(([kind, title, detail]) => (
                <div className="ev" key={title}>
                  <small>{kind}</small>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </div>
              ))}
            </div>{' '}
            {/* An unattributed, site-level placeholder: never marked up as a Review (docs/architecture.md). */}
            <figure className="tq">
              <blockquote>{v.profileQuote}</blockquote>
              <figcaption>
                <cite>{v.quoteCite}</cite>
              </figcaption>
            </figure>
          </section>{' '}
          <section className="faq" id="faq">
            <span className="eyebrow">FAQ</span>
            <h2>Booking {person.first}</h2>
            {faq.map(({ q, a }) => (
              <FaqItem key={q} demo={demo} q={q} a={a} />
            ))}
          </section>{' '}
          <ClosingBand ctx={ctx} person={person} />
        </div>{' '}
        <BookingCard ctx={ctx} person={person} />
      </div>
      {/* A site with one person has nobody else to suggest; the section (and its heading) is left out. */}
      {sims.length ? (
        <section className="sim">
          <div className="wrap">
            <div className="head">
              <div>
                <span className="eyebrow">You might also like</span>
                <h2 className="disp">
                  More {site.short} {v.legendsNoun}
                </h2>
              </div>
              <A demo={demo} href={`${base}/legends`}>
                See all {v.legendsNoun}
              </A>
            </div>{' '}
            <div className="grid">
              {sims.map(other => (
                <Card key={other.slug} ctx={ctx} person={other} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </SiteLayout>
  );
}

/** The profile hero: official label, role and era pills, name, position, calls to action, key stats and the photo. */
export function ProfileHero({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { site, eraLabel, v, demo } = ctx;
  return (
    <section className="p-hero">
      <div className="wrap">
        <div>
          <Official ctx={ctx} label={v.officialLegendLabel ?? `Official ${site.orgName} ${v.legendNoun}`} />
          <div className="pills">
            <span className="pill">{person.roleLabel}</span>
            <span className="pill alt">{eraLabel(person.era)}</span>
          </div>
          <h1 className="disp">{person.name}</h1>
          <div className="pos">{person.pos}</div>
          <p className="line">{person.line}</p>
          <div className="ctas">
            <A demo={demo} className="btn btn-blue" href="#book">
              Check {person.first}'s availability →
            </A>
            <ShortlistButton ctx={ctx} person={person} cls="btn btn-line shortlist" />
            <Availability person={person} />
          </div>
          <dl className="kstats">
            {person.stats.map(([value, caption]) => (
              <div key={caption}>
                <dt>
                  <small>{caption}</small>
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>{' '}
        <Photo ctx={ctx} id={person.hero} cls="top" slot="profile" alt={personAlt(person)} priority />
      </div>
    </section>
  );
}

/** "<name> at a glance": the answer-style definition list that opens a profile (docs/architecture.md → SEO and AEO). */
export function AtAGlance({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { site, eraLabel, v } = ctx;
  const travelsFrom = person.travelsFrom ?? v.travelsFrom;
  return (
    <section className="glance" id="overview" aria-labelledby="glance-title">
      <span className="eyebrow">At a glance</span>
      <h2 id="glance-title">{person.name} at a glance</h2>
      <dl>
        <dt>Role</dt>
        <dd>
          {person.roleLabel}, {site.orgName}
        </dd>
        <dt>Era</dt>
        <dd>{eraLabel(person.era)}</dd>
        <dt>Known for</dt>
        <dd>{person.honour}</dd>
        <dt>Best for</dt>
        <dd>{listText(person.audiences)}</dd>
        <dt>Talks about</dt>
        <dd>{listText(person.talks)}</dd>
        <dt>Formats</dt>
        <dd>{listText(formatTitles(ctx, person.formats))}</dd>
        <dt>Travels from</dt>
        <dd>{travelsFrom}</dd>
        <dt>Languages</dt>
        <dd>{person.langs}</dd>
      </dl>
    </section>
  );
}

/** The career timeline: `[year, text]` entries, oldest first. */
export function Timeline({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { site, v } = ctx;
  return (
    <section id="career">
      <span className="eyebrow">Career</span>
      <h2>{v.careerHeadline ?? `${site.short} story`}</h2>
      <ol className="timeline">
        {person.timeline.map(([year, text]) => (
          <li key={`${year}${text}`}>
            <b>{year}</b>
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The profile photo gallery: exactly three photos, the first larger. */
export function ProfileGallery({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { site, v } = ctx;
  return (
    <section id="gallery">
      <span className="eyebrow">Gallery</span>
      <h2>
        <span className="sr-only">{person.name}: </span>
        {v.galleryHeadline}
      </h2>
      <div className="gallery">
        {person.gallery.map((id, i) => (
          <Photo
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of three; shell sites repeat null ids.
            key={`${i}:${id}`}
            ctx={ctx}
            id={id}
            cls="top"
            slot={i === 0 ? 'gallery-lead' : 'gallery'}
            alt={`${person.name}, ${site.orgName} (photo ${i + 1} of ${person.gallery.length})`}
          />
        ))}
      </div>
    </section>
  );
}

/** The closing band at the foot of a profile: crest, a last call to action and a link to the enquiry form. */
export function ClosingBand({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { base, demo } = ctx;
  return (
    <div className="closing">
      <Crest ctx={ctx} size="xl" />
      <div>
        <h2>Bring {person.first} to your event</h2>
        <p>Tell us your date and the PepTalk bookings team will come back within one working day.</p>
      </div>
      <A demo={demo} className="btn btn-white" href={`${base}/check-availability?legend=${person.slug}`}>
        Check availability →
      </A>
    </div>
  );
}

/** The booking card beside a profile (sticky on desktop): availability, fee band, formats, travel, languages, actions. */
export function BookingCard({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { site, base, v, demo } = ctx;
  const travelsFrom = person.travelsFrom ?? v.travelsFrom;
  return (
    <aside className="side" id="book" aria-label={`Book ${person.name}`}>
      <h2>Book {person.first}</h2>
      <div className="av">
        <Availability person={person} />
      </div>{' '}
      <dl>
        <div className="row">
          <dt>Fee band</dt>
          <dd>On enquiry</dd>
        </div>{' '}
        <div className="row">
          <dt>Formats</dt>
          <dd>{formatTitles(ctx, person.formats.slice(0, 3)).join(', ')}</dd>
        </div>{' '}
        <div className="row">
          <dt>Travels from</dt>
          <dd>{travelsFrom}</dd>
        </div>{' '}
        <div className="row">
          <dt>Languages</dt>
          <dd>{person.langs}</dd>
        </div>{' '}
        <div className="row">
          <dt>Virtual</dt>
          <dd>{person.formats.includes('virtual') ? 'Yes' : 'On request'}</dd>
        </div>
      </dl>{' '}
      <A demo={demo} className="btn btn-blue" href={`${base}/check-availability?legend=${person.slug}`}>
        Check availability →
      </A>{' '}
      <ShortlistButton ctx={ctx} person={person} label="+ Add to shortlist" cls="btn btn-line shortlist" />{' '}
      <p className="note">Handled by the PepTalk bookings team on behalf of {site.orgName}.</p>
    </aside>
  );
}

export function WaysToBookPage({ ctx }: { ctx: SiteContext }) {
  const { site, base, v, FORMATS } = ctx;
  const path = `${base}/ways-to-book`;
  const title = `Ways to book ${site.short} ${v.legendsNoun}`;
  const crumbs = trail(ctx, { name: 'Ways to book', path });
  const keys = Object.keys(FORMATS) as FormatKey[];
  const graph = siteGraph({
    ctx,
    path,
    name: title,
    description: waysCopy(ctx).description,
    crumbs,
    mainEntity: servicesNode(ctx, keys, ctx.url(path)),
  });
  return (
    <SimplePage
      ctx={ctx}
      path="/ways-to-book"
      eyebrow="Ways to book"
      title={title}
      lead={v.waysLead ?? `From a keynote to a full matchday, here is how you can work with ${site.short} ${v.legendsNoun}.`}
      graph={graph}
      crumbs={crumbs}
    >
      <section className="block first">
        <div className="wrap">
          {/* Each format is a top-level section of this page, so its title is an <h2>. */}
          <WaysGrid ctx={ctx} keys={keys} detailed level={2} />{' '}
          <div className="head mt">
            <div>
              <span className="eyebrow">How it works</span>
              <h2 className="disp">{v.howTitle}</h2>
            </div>
          </div>{' '}
          <div className="ways">
            <div className="way">
              <div className="n">1</div>
              <h3>Share your brief</h3>
              <p>Date, audience, format and who you have in mind.</p>
            </div>
            <div className="way">
              <div className="n">2</div>
              <h3>Confirm availability</h3>
              <p>{v.diaryCheck}</p>
            </div>
            <div className="way">
              <div className="n">3</div>
              <h3>Contract &amp; deliver</h3>
              <p>PepTalk handles contracts, payment, briefing and logistics.</p>
            </div>
          </div>{' '}
          <Beyond ctx={ctx} />
        </div>
      </section>
      <FormSection ctx={ctx} />
    </SimplePage>
  );
}

export function HospitalityPage({ ctx }: { ctx: SiteContext }) {
  const { site, base, v, nl, demo } = ctx;
  const path = `${base}/hospitality`;
  const crumbs = trail(ctx, { name: v.hospitalityTitle, path });
  const hosts = site.people.filter(person => person.formats.includes('hospitality')).slice(0, 3);
  const graph = siteGraph({ ctx, path, name: v.hospitalityTitle, description: hospitalityCopy(ctx).description, crumbs });
  return (
    <SimplePage
      ctx={ctx}
      path="/hospitality"
      eyebrow="Hospitality"
      title={v.hospitalityTitle}
      lead={v.hospitalityLead ?? `Add a ${site.short} ${v.legendNoun} to your lounge or box at ${site.stadium}.`}
      graph={graph}
      crumbs={crumbs}
    >
      <section className="block first">
        <div className="wrap split">
          {/* Decorative: the photo has no caption data; the copy beside it carries the meaning. */}
          <Photo ctx={ctx} id={site.home.hospitalityImage} slot="split" alt="" priority />
          <div>
            <span className="eyebrow">{v.hospitalityEyebrow}</span>
            <h2 className="disp">{v.hospitalityHeadline}</h2> <p>{v.hospitalityBody}</p>{' '}
            <div className="metrics">
              {v.hospitalityMetrics.map(([value, caption]) => (
                <div key={caption}>
                  <b>{value}</b>
                  <small>{caption}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>{' '}
      {/* Nobody offers hospitality: leave the section (and its heading) out rather than show an empty grid. */}
      {hosts.length ? (
        <section className="block tint">
          <div className="wrap">
            <div className="head">
              <div>
                <span className="eyebrow">{nl.hospitality}</span>
                <h2 className="disp">Popular hosts</h2>
              </div>
              <A demo={demo} href={`${base}/legends`}>
                See all {v.legendsNoun}
              </A>
            </div>{' '}
            <div className="grid">
              {hosts.map(person => (
                <Card key={person.slug} ctx={ctx} person={person} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <FormSection ctx={ctx} tint={false} />
    </SimplePage>
  );
}

export function AboutPage({ ctx }: { ctx: SiteContext }) {
  const { site, base, v, demo } = ctx;
  const path = `${base}/about`;
  const crumbs = trail(ctx, { name: v.aboutTitle, path });
  const faq = ctx.faq();
  const graph = siteGraph({
    ctx,
    path,
    type: 'AboutPage',
    name: v.aboutTitle,
    description: aboutCopy(ctx).description,
    crumbs,
    extra: [faqNode(faq, ctx.url(path), ctx)],
  });
  return (
    <SimplePage ctx={ctx} path="/about" eyebrow="About this platform" title={v.aboutTitle} lead={site.entity} graph={graph} crumbs={crumbs}>
      <section className="block first">
        <div className="wrap prose">
          <p>
            {site.platform}{' '}
            {v.aboutLead ??
              `brings together former ${site.orgName} players, managers and backroom staff, plus today's first-team squad, for keynotes, hospitality, brand partnerships and community work, all through one official platform.`}
          </p>{' '}
          <h2>Who runs the platform</h2>{' '}
          <p>
            The platform is operated by{' '}
            <A demo={demo} href={PEPTALK} rel="noopener">
              <b>PepTalk</b>
            </A>
            , the speaker and talent booking agency. PepTalk handles enquiries, availability, contracts, payments and event logistics on
            behalf of {site.orgName}.
          </p>{' '}
          <p>
            Looking for speakers beyond {site.short}? PepTalk represents hundreds of{' '}
            <A demo={demo} href={v.beyondUrl} rel="noopener">
              <b>{v.beyondLinkText.replace(/^PepTalk /, '')}</b>
            </A>
            .
          </p>{' '}
          <h2 id="faq">Frequently asked questions</h2>{' '}
          <div className="faq">
            {faq.map(({ q, a }) => (
              <FaqItem key={q} demo={demo} q={q} a={a} />
            ))}
          </div>{' '}
        </div>
      </section>
    </SimplePage>
  );
}

export function CheckAvailabilityPage({ ctx }: { ctx: SiteContext }) {
  const { base, v } = ctx;
  const path = `${base}/check-availability`;
  const crumbs = trail(ctx, { name: 'Check availability', path });
  const graph = siteGraph({
    ctx,
    path,
    type: 'ContactPage',
    name: v.formHeadline,
    description: checkAvailabilityCopy(ctx).description,
    crumbs,
  });
  return (
    <SiteLayout ctx={ctx} path="/check-availability" graph={graph} crumbs={crumbs}>
      <FormSection ctx={ctx} tint={false} first h1 />
    </SiteLayout>
  );
}

/** Terms or privacy, in the site's layout and branding (the text is shared by every site). */
export function SiteLegalPage({ ctx, doc }: { ctx: SiteContext; doc: LegalDoc }) {
  const path = `${ctx.base}/${doc.kind}`;
  const crumbs = trail(ctx, { name: doc.title, path });
  const graph = siteGraph({ ctx, path, name: doc.title, description: legalCopy(ctx, doc).description, crumbs });
  return (
    <SimplePage
      ctx={ctx}
      path={`/${doc.kind}`}
      eyebrow="Legal"
      title={doc.title}
      lead={doc.lastUpdated ? `Last updated: ${doc.lastUpdated}` : null}
      graph={graph}
      crumbs={crumbs}
    >
      <section className="block first">
        <LegalText body={doc.body} />
      </section>
    </SimplePage>
  );
}

/** Legal text (the safe markdown subset, lib/render/markdown.ts) in the prose column of a legal page. */
export function LegalText({ body }: { body: string }) {
  return <div className="wrap prose legal">{renderMarkdown(body)}</div>;
}
