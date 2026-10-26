// Inner pages of a site: roster, category, profile, ways to book, hospitality, about, enquiry, legal; and the profile's
// sections, exported so the component gallery (/_gallery) can show each on its own.
import type { FormatKey, LegalDoc, Person, Role } from '../../lib/content/types.ts';
import { personAlt } from '../../lib/render/alt.ts';
import { categoryRoles, peopleIn, topItems } from '../../lib/render/category.ts';
import type { SiteContext } from '../../lib/render/context.ts';
import { renderMarkdown } from '../../lib/render/markdown-view.ts';
import { categoryPath } from '../../lib/render/routes.ts';
import {
  aboutCopy,
  categoryCopy,
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
import { A, Button, FaqItem, Photo } from './primitives.tsx';
import { CtaBand, FaqBlock, FORMAT_SHORT, HowItWorks, offering, RoleList } from './sections.tsx';

/** Home, then the given trail. The visible breadcrumbs and the BreadcrumbList use the same list. */
const trail = ({ home }: SiteContext, ...rest: Crumb[]): Crumb[] => [{ name: 'Home', path: home }, ...rest];

/** Cards in the first rows load eagerly; the rest wait until they scroll near the viewport. */
const EAGER_CARDS = 3;

/** Display titles of booking formats, in the given order. */
const formatTitles = ({ FORMATS }: SiteContext, keys: FormatKey[]): string[] => keys.map(key => FORMATS[key].title);

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** The "not sure who to book?" tile closing a grid of cards (not a .card, so the roster filters leave it alone). */
export function HelpTile({ ctx }: { ctx: SiteContext }) {
  const { base, v, demo } = ctx;
  return (
    <div className="help-tile">
      <div>
        <span className="eyebrow">Not sure who to book?</span>
        <p className="big">Tell us about your event. We’ll suggest the right fit.</p>
        <p>A free shortlist from the PepTalk bookings team, matched to your audience and budget.</p>
      </div>
      <A demo={demo} className="btn btn-cta" href={`${base}/check-availability`}>
        Get a shortlist of {v.legendsNoun} <span aria-hidden="true">→</span>
      </A>
    </div>
  );
}

export function LegendsPage({ ctx }: { ctx: SiteContext }) {
  const { site, base, v, nl, FORMATS, demo } = ctx;
  const path = `${base}/legends`;
  const crumbs = trail(ctx, { name: nl.legends, path });
  const heading = `All ${site.short} ${v.legendsNoun}`;
  const graph = siteGraph({
    ctx,
    path,
    type: 'CollectionPage',
    name: heading,
    description: legendsCopy(ctx).description,
    crumbs,
    mainEntity: peopleListNode(ctx, site.people, ctx.url(path), heading),
  });
  const tabs: [string, string, number][] = [
    ['', 'All', site.people.length],
    ...categoryRoles(site).map(role => [role.key, role.label, peopleIn(site, role).length] as [string, string, number]),
  ];
  const offered = (Object.keys(FORMATS) as FormatKey[]).filter(key => offering(site.people, key) > 0);
  return (
    <SiteLayout ctx={ctx} path="/legends" graph={graph} crumbs={crumbs}>
      <section className="page-head">
        <div className="wrap">
          <span className="eyebrow">The roster</span>
          <div className="ph-row">
            <h1 className="disp">{heading}</h1>
            <p className="lead">{v.rosterLead}</p>
          </div>
        </div>
      </section>
      <section className="block first roster">
        <div className="wrap" data-roster="">
          {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> would restyle the tab row; role="group" names it for assistive tech. */}
          <div className="filters tabs" role="group" aria-label="Filter by role">
            {tabs.map(([key, label, count]) => (
              <Button demo={demo} key={key} className="chip" type="button" data-filter="role" data-value={key} aria-pressed={key === ''}>
                {label} <small>{count}</small>
              </Button>
            ))}
          </div>
          <div className="filter-row">
            <label className="select">
              <span className="sr-only">Era</span>
              <select data-filter="era" disabled={demo || undefined}>
                <option value="">Any era</option>
                {site.eras.map(era => (
                  <option key={era.key} value={era.key}>
                    {era.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="select">
              <span className="sr-only">Format</span>
              <select data-filter="format" disabled={demo || undefined}>
                <option value="">Any format</option>
                {offered.map(key => (
                  <option key={key} value={key}>
                    {FORMATS[key].title}
                  </option>
                ))}
              </select>
            </label>
            <label className="searchbox">
              <input
                className="roster-q"
                type="search"
                placeholder="Search by name or topic, e.g. leadership"
                aria-label={`Search ${v.legendsNoun}`}
                disabled={demo || undefined}
              />
            </label>
          </div>
          <p className="count" data-count="" aria-live="polite">
            Showing {site.people.length} of {site.people.length} {v.legendsNoun}
          </p>
          {/* The cards sit directly under the page's <h1>, so their names are <h2>s. */}
          <div className="grid">
            {site.people.map((person, i) => (
              <Card key={person.slug} ctx={ctx} person={person} level={2} eager={i < EAGER_CARDS} />
            ))}
            {site.people.length ? <HelpTile ctx={ctx} /> : null}
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

/** The questions a category page answers, built from its people (formats and topics) plus the shared booking FAQ. */
export function categoryFaq(ctx: SiteContext, role: Role, people: Person[]): { q: string; a: string }[] {
  const { site, FORMATS } = ctx;
  const label = lower(role.label);
  const [cost, leadTime] = ctx.faq();
  const formats = (Object.keys(FORMATS) as FormatKey[])
    .map(key => ({ key, count: offering(people, key) }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count);
  const topics = topItems(
    people.map(person => person.talks),
    5,
  ).map(({ item }) => lower(item));
  return [
    { q: `How much does it cost to book ${site.short} ${label}?`, a: cost.a },
    {
      q: `Which formats do ${site.short} ${label} offer?`,
      a: `${listText(formats.map(({ key, count }) => `${FORMATS[key].title} (${count} of ${people.length})`))}.`,
    },
    ...(topics.length ? [{ q: `What do ${site.short} ${label} talk about?`, a: `Most often: ${listText(topics)}.` }] : []),
    leadTime,
  ];
}

export function CategoryPage({ ctx, role }: { ctx: SiteContext; role: Role }) {
  const { site, base, v, nl, FORMATS, demo } = ctx;
  const people = peopleIn(site, role);
  const path = categoryPath(base, role);
  const url = ctx.url(path);
  const crumbs = trail(ctx, { name: nl.legends, path: `${base}/legends` }, { name: role.label, path });
  const copy = categoryCopy(ctx, role, people);
  const faq = categoryFaq(ctx, role, people);
  const graph = siteGraph({
    ctx,
    path,
    type: 'CollectionPage',
    name: role.label,
    description: copy.description,
    crumbs,
    image: role.image ? site.images[role.image] : null,
    mainEntity: peopleListNode(ctx, people, url, `${site.short} ${lower(role.label)}`),
    extra: [faqNode(faq, url, ctx)],
  });
  const formats = (Object.keys(FORMATS) as FormatKey[])
    .map(key => ({ key, count: offering(people, key) }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count);
  const topics = topItems(
    people.map(person => person.talks),
    8,
  );
  const label = lower(role.label);
  return (
    <SiteLayout ctx={ctx} path="/category" graph={graph} crumbs={crumbs}>
      <section className="c-hero">
        <div className="split-hero">
          <div className="copy">
            <div className="badges">
              <span className="badge light">Category</span>
              <span className="badge-note">
                {people.length} {people.length === 1 ? 'speaker' : 'speakers'}
              </span>
            </div>
            <h1 className="disp">{role.label}</h1>
            <p className="lead">
              Book {site.orgName} {label} for {listText(formats.slice(0, 3).map(({ key }) => lower(FORMATS[key].title)))}. {role.blurb}
            </p>
            <div className="ctas">
              <A demo={demo} className="btn btn-cta btn-lg" href={`${base}/check-availability`}>
                Check availability <span aria-hidden="true">→</span>
              </A>
              <A demo={demo} className="quiet" href="#people">
                See all {people.length}
              </A>
            </div>
          </div>
          {role.image ? (
            <Photo ctx={ctx} id={role.image} cls="top media" slot="profile" alt={`${role.label}, ${site.orgName}`} priority />
          ) : null}
        </div>
      </section>
      <nav className="cat-tabs" aria-label="Categories">
        <div className="wrap">
          <A demo={demo} href={`${base}/legends`}>
            All {v.legendsNoun} <small>{site.people.length}</small>
          </A>
          {categoryRoles(site).map(other => (
            <A demo={demo} key={other.key} href={categoryPath(base, other)} aria-current={other.key === role.key ? 'page' : undefined}>
              {other.label} <small>{peopleIn(site, other).length}</small>
            </A>
          ))}
        </div>
      </nav>
      <section className="block first" id="people" aria-labelledby="people-title">
        <div className="wrap">
          <h2 className="count" id="people-title">
            {people.length} {label}
          </h2>
          <div className="grid g3">
            {people.map((person, i) => (
              <Card key={person.slug} ctx={ctx} person={person} eager={i < 3} />
            ))}
            <HelpTile ctx={ctx} />
          </div>
        </div>
      </section>
      <section className="block tint" aria-labelledby="topics-title">
        <div className="wrap side-head">
          <div className="intro">
            <span className="eyebrow">What they talk about</span>
            <h2 className="disp" id="topics-title">
              Topics &amp; formats
            </h2>
            <p className="lead">
              What {site.short} {label} are booked for most, from their own profiles.
            </p>
          </div>
          <div className="topic-cols">
            <div>
              <h3>Popular topics</h3>
              <ul className="tags big">
                {topics.map(({ item, count }) => (
                  <li key={item}>
                    {item} {count > 1 ? <small>{count}</small> : null}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Formats offered</h3>
              <ul className="fmt-count">
                {formats.map(({ key, count }) => (
                  <li key={key}>
                    <A demo={demo} href={ctx.pages.waysToBook ? `${base}/ways-to-book#${key}` : `${base}/legends?format=${key}`}>
                      {FORMATS[key].title}
                    </A>
                    <span>
                      {count} of {people.length}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
      <FaqBlock ctx={ctx} faq={faq} title={`${role.label}, answered.`} />
      <RoleList ctx={ctx} eyebrow="Other categories" title="Explore another category." exclude={role.key} tint />
      <CtaBand ctx={ctx} title={`Bring ${role.singular ? `a ${lower(role.singular)}` : `${site.short} ${label}`} to your next event.`} />
    </SiteLayout>
  );
}

export function ProfilePage({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { site, base, v, nl, demo } = ctx;
  const others = site.people.filter(other => other.slug !== person.slug);
  const sims = [...others.filter(other => other.role === person.role), ...others.filter(other => other.role !== person.role)].slice(0, 4);
  const path = `${base}/legends/${person.slug}`;
  const url = ctx.url(path);
  const role = site.roles.find(candidate => candidate.key === person.role);
  const crumbs = trail(
    ctx,
    { name: nl.legends, path: `${base}/legends` },
    ...(role && peopleIn(site, role).length ? [{ name: role.label, path: categoryPath(base, role) }] : []),
    { name: person.name, path },
  );
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
  const tags = (items: string[], label: string, cls = 'tags') => (
    <ul className={cls} aria-label={label}>
      {items.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
  return (
    <SiteLayout ctx={ctx} path="/legends" graph={graph} crumbs={crumbs}>
      <ProfileHero ctx={ctx} person={person} />
      <nav className="subnav" aria-label="Profile sections">
        <div className="wrap">
          <span className="links">
            {(
              [
                ['overview', 'At a glance'],
                ['about', 'About'],
                ['career', 'Career'],
                ['talks', 'Talks about'],
                ['formats', 'Ways to book'],
                ['gallery', 'Gallery'],
                ['faq', 'FAQ'],
              ] as const
            ).map(([id, label]) => (
              <A demo={demo} key={id} href={`#${id}`}>
                {label}
              </A>
            ))}
          </span>
          <span className="sub-cta">
            <b>{person.first}</b>
            <A demo={demo} className="btn btn-cta btn-sm" href={`${base}/check-availability?legend=${person.slug}`}>
              Check availability
            </A>
          </span>
        </div>
      </nav>
      <div className="wrap pbody">
        <div className="pmain">
          <AtAGlance ctx={ctx} person={person} />{' '}
          <section className="bio" id="about">
            <span className="eyebrow">About</span>
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
                {tags(person.talks, `${person.first} talks about`, 'tags line')}
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
          <ProfileFormats ctx={ctx} person={person} /> <ProfileGallery ctx={ctx} person={person} />{' '}
          <section className="faq" id="faq">
            <span className="eyebrow">FAQ</span>
            <h2>Booking {person.first}</h2>
            {faq.map(({ q, a }, i) => (
              <FaqItem key={q} demo={demo} q={q} a={a} open={i === 0} />
            ))}
          </section>
        </div>{' '}
        <BookingCard ctx={ctx} person={person} />
      </div>
      <ClosingBand ctx={ctx} person={person} />
      {/* A site with one person has nobody else to suggest; the section (and its heading) is left out. */}
      {sims.length ? (
        <section className="sim block tint">
          <div className="wrap">
            <div className="head">
              <div>
                <span className="eyebrow">You might also like</span>
                <h2 className="disp">
                  More {site.short} {v.legendsNoun}.
                </h2>
              </div>
              <A demo={demo} className="more" href={`${base}/legends`}>
                See all {v.legendsNoun} <span aria-hidden="true">→</span>
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

/** The profile hero: badges, name, position, line, calls to action and availability beside the photo; key stats below. */
export function ProfileHero({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { site, base, eraLabel, v, demo } = ctx;
  return (
    <section className="p-hero">
      <div className="split-hero">
        <div className="copy">
          <div className="badges">
            <Official ctx={ctx} label={v.officialLegendLabel ?? `Official ${site.short} ${v.legendNoun}`} />
            <span className="pill">{person.roleLabel}</span>
            <span className="pill">{eraLabel(person.era)}</span>
          </div>
          <h1 className="disp">{person.name}</h1>
          <div className="pos">{person.pos}</div>
          <p className="line">{person.line}</p>
          <div className="ctas">
            <A demo={demo} className="btn btn-cta btn-lg" href={`${base}/check-availability?legend=${person.slug}`}>
              Check {person.first}'s availability <span aria-hidden="true">→</span>
            </A>
            <ShortlistButton ctx={ctx} person={person} cls="btn btn-ghost shortlist" />
            <Availability person={person} />
          </div>
        </div>{' '}
        <Photo ctx={ctx} id={person.hero} cls="top media" slot="profile" alt={personAlt(person)} priority />
      </div>
      <div className="wrap">
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

/** The career timeline: `[year, text]` entries, oldest first, laid out as a row. */
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

/** "How you can work with <name>": one tile per format, each starting an enquiry for this person. */
export function ProfileFormats({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { base, FORMATS, demo } = ctx;
  return (
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
              <A demo={demo} className="more" href={`${base}/check-availability?legend=${person.slug}`}>
                Enquire for {lower(FORMAT_SHORT[key])}
                <span className="sr-only"> with {person.name}</span> <span aria-hidden="true">→</span>
              </A>
            </div>
          );
        })}
      </div>
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

/** The closing band under a profile: a photo, a last call to action and a link to the enquiry form. */
export function ClosingBand({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { base, demo } = ctx;
  const photo = person.gallery.find(Boolean) ?? person.card;
  return (
    <section className="band closing" aria-labelledby="closing-title">
      <div className="wrap">
        <div className="who">
          <Photo ctx={ctx} id={photo} cls="top thumb" slot="mini" alt="" />
          <div>
            <h2 className="disp" id="closing-title">
              Bring {person.first} to your event.
            </h2>
            <p>Tell us your date and the PepTalk bookings team will come back with availability and an indicative fee.</p>
          </div>
        </div>
        <A demo={demo} className="btn btn-cta btn-lg" href={`${base}/check-availability?legend=${person.slug}`}>
          Check availability <span aria-hidden="true">→</span>
        </A>
      </div>
    </section>
  );
}

/** The booking card beside a profile (sticky on desktop): availability, fee band, formats, travel, languages, actions. */
export function BookingCard({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { site, base, v, demo } = ctx;
  const travelsFrom = person.travelsFrom ?? v.travelsFrom;
  return (
    <aside className="side" id="book" aria-label={`Book ${person.name}`}>
      <div className="side-head">
        <Photo ctx={ctx} id={person.card} cls="top thumb" slot="mini" alt="" />
        <div>
          <h2>Book {person.first}</h2>
          <div className="av">
            <Availability person={person} />
          </div>
        </div>
      </div>{' '}
      <div className="side-body">
        <dl>
          <div className="row">
            <dt>Fee</dt>
            <dd>On enquiry</dd>
          </div>{' '}
          <div className="row">
            <dt>Formats</dt>
            <dd>{person.formats.map(key => FORMAT_SHORT[key]).join(', ')}</dd>
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
        <A demo={demo} className="btn btn-cta" href={`${base}/check-availability?legend=${person.slug}`}>
          Check availability →
        </A>{' '}
        <ShortlistButton ctx={ctx} person={person} label="+ Add to shortlist" cls="btn btn-line shortlist" />{' '}
        <p className="note">Handled by the PepTalk bookings team on behalf of {site.orgName}.</p>
      </div>
    </aside>
  );
}

export function WaysToBookPage({ ctx }: { ctx: SiteContext }) {
  const { site, base, v, FORMATS, demo } = ctx;
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
      extra={
        <nav className="jump" aria-label="Formats">
          {keys.map(key => (
            <A demo={demo} key={key} href={`#${key}`}>
              {FORMATS[key].title}
            </A>
          ))}
        </nav>
      }
    >
      <section className="block first">
        <div className="wrap">
          {/* Each format is a top-level section of this page, so its title is an <h2>. */}
          <WaysGrid ctx={ctx} keys={keys} detailed level={2} />
        </div>
      </section>
      <HowItWorks ctx={ctx} />
      <section className="block">
        <div className="wrap">
          <Beyond ctx={ctx} />
        </div>
      </section>
      <CtaBand ctx={ctx} />
    </SimplePage>
  );
}

export function HospitalityPage({ ctx }: { ctx: SiteContext }) {
  const { site, base, v, nl, demo } = ctx;
  const path = `${base}/hospitality`;
  const crumbs = trail(ctx, { name: v.hospitalityTitle, path });
  const hosts = site.people.filter(person => person.formats.includes('hospitality')).slice(0, 4);
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
              <A demo={demo} className="more" href={`${base}/legends?format=hospitality`}>
                See all hosts <span aria-hidden="true">→</span>
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
      <CtaBand ctx={ctx} />
    </SimplePage>
  );
}

export function AboutPage({ ctx }: { ctx: SiteContext }) {
  const { site, base, v, FORMATS, demo } = ctx;
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
  const facts: [number, string][] = [
    [site.people.length, `${v.legendsNoun.charAt(0).toUpperCase()}${v.legendsNoun.slice(1)} to book`],
    [categoryRoles(site).length, 'Categories, from legends to today’s squad'],
    [Object.keys(FORMATS).length, 'Ways to book, in person or virtual'],
    [1, 'Team handling it all: PepTalk'],
  ];
  return (
    <SimplePage ctx={ctx} path="/about" eyebrow="About the network" title={v.aboutTitle} lead={site.entity} graph={graph} crumbs={crumbs}>
      <section className="about-media">
        <div className="wrap">
          <Photo ctx={ctx} id={site.home.hospitalityImage} cls="wide" slot="split" alt="" priority />
          <dl className="facts">
            {facts.map(([value, caption]) => (
              <div key={caption}>
                <dt>{caption}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section className="block tint" aria-labelledby="who-title">
        <div className="wrap">
          <div className="head">
            <div>
              <span className="eyebrow">Who does what</span>
              <h2 className="disp" id="who-title">
                The club’s people. PepTalk’s booking team.
              </h2>
            </div>
            <p className="lead">
              {site.platform}{' '}
              {v.aboutLead ??
                `brings together former ${site.orgName} players, managers and backroom staff, plus today's first-team squad, for keynotes, hospitality, brand partnerships and community work, all through one official platform.`}
            </p>
          </div>
          <div className="duo">
            <div className="club">
              <span className="crest lg" role="img" aria-label={`${site.orgName} crest`} />
              <h3>{site.orgName}</h3>
              <p>
                Puts its people forward, agrees the appearances and hosts matchday hospitality at {site.stadium}. Current players are booked
                around the {v.fixtureWord}.
              </p>
            </div>
            <div className="op">
              {/* biome-ignore lint/performance/noImgElement: PepTalk's own logo file. */}
              <img src="/peptalk/logo.png" alt="PepTalk" width={123} height={32} loading="lazy" />
              <h3>PepTalk</h3>
              <p>
                The speaker and talent booking agency that runs the platform: enquiries, availability, contracts, payments and event
                logistics, on behalf of {site.orgName}.{' '}
                <A demo={demo} href={v.beyondUrl} rel="noopener">
                  More speakers on PepTalk
                </A>
                .
              </p>
            </div>
          </div>
        </div>
      </section>
      <HowItWorks ctx={ctx} />
      <FaqBlock ctx={ctx} faq={faq} title="Frequently asked questions" />
      <CtaBand ctx={ctx} />
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
      <FormSection ctx={ctx} tint first h1 />
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

/** Legal text (the safe markdown subset, lib/render/markdown-view.ts) in the prose column of a legal page. */
export function LegalText({ body }: { body: string }) {
  return <div className="wrap prose legal">{renderMarkdown(body)}</div>;
}
