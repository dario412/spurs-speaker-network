// Inner pages of a site: roster, category, profile, ways to book, hospitality, about, enquiry, legal; and the profile's
// sections, exported so the component gallery (/_gallery) can show each on its own.
import type { FormatKey, LegalDoc, Person, Role } from '../../lib/content/types.ts';
import { personAlt } from '../../lib/render/alt.ts';
import { categoryRoles, peopleIn, roleProse, topItems, topicKey } from '../../lib/render/category.ts';
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
import { Availability, Card, FormSection, Official, ShortlistButton, WaysGrid } from './components.tsx';
import { EventSpaces } from './event-spaces.tsx';
import { SimplePage, SiteLayout } from './layout.tsx';
import { A, Button, edit, FaqItem, Photo } from './primitives.tsx';
import { CtaBand, FaqBlock, FORMAT_SHORT, offering, RoleList } from './sections.tsx';

/** Home, then the given trail. The visible breadcrumbs and the BreadcrumbList use the same list. */
const trail = ({ home }: SiteContext, ...rest: Crumb[]): Crumb[] => [{ name: 'Home', path: home }, ...rest];

/** Cards in the first rows load eagerly; the rest wait until they scroll near the viewport. */
const EAGER_CARDS = 3;

/** Roster pages show this many cards, then "Show more speakers" (lib/behaviour.ts; all cards are in the HTML). */
const PAGE_SIZE = 11;

/** People with the site's featured people first (in featured order), then everyone else in roster order. */
const featuredFirst = (site: SiteContext['site'], people: Person[]): Person[] => {
  const rank = (person: Person) => {
    const i = site.featured.indexOf(person.slug);
    return i === -1 ? site.featured.length : i;
  };
  return people
    .map((person, i) => ({ person, i }))
    .sort((a, b) => rank(a.person) - rank(b.person) || a.i - b.i)
    .map(({ person }) => person);
};

/** "Sort: Featured / Name": reorders the cards in place (lib/behaviour.ts). */
function SortSelect({ ctx }: { ctx: SiteContext }) {
  return (
    <label className="select sort-select">
      <span className="sort-label">Sort:</span>
      <select data-filter="sort" disabled={ctx.demo || undefined} aria-label="Sort">
        <option value="">Featured</option>
        <option value="name">Name (A–Z)</option>
      </select>
    </label>
  );
}

/** "Show more speakers", shown by the behaviour script while cards are held back. */
function ShowMore({ ctx }: { ctx: SiteContext }) {
  const { base, demo } = ctx;
  return (
    <div className="load-more">
      <Button demo={demo} className="btn btn-line more-btn" type="button" hidden>
        Show more {ctx.v.legendsNoun}
      </Button>
      <p className="roster-help">
        Can’t find who you’re after?{' '}
        <A demo={demo} href={`${base}/check-availability`} {...edit('vocab.askTeam')}>
          {ctx.v.askTeam}
        </A>
      </p>
    </div>
  );
}

/** Display titles of booking formats, in the given order. */
const formatTitles = ({ FORMATS }: SiteContext, keys: FormatKey[]): string[] => keys.map(key => FORMATS[key].title);

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "a Spurs manager": a role's singular for a closing line, without "Former" and with the site's short name once. */
const oneOf = (site: SiteContext['site'], singular: string): string => {
  const noun = lower(singular.replace(/^former\s+/i, ''));
  return noun.toLowerCase().startsWith(site.short.toLowerCase()) ? `a ${capital(noun)}` : `a ${site.short} ${noun}`;
};

/** The "not sure who to book?" tile closing a grid of cards (not a .card, so the roster filters leave it alone). */
export function HelpTile({ ctx }: { ctx: SiteContext }) {
  const { base, demo } = ctx;
  return (
    <div className="help-tile">
      <div>
        <span className="eyebrow">Not sure who to book?</span>
        <p className="big">Tell us about your event. We’ll suggest the right fit.</p>
        <p>A free shortlist from the PepTalk bookings team, matched to your audience and budget.</p>
      </div>
      <A demo={demo} className="btn btn-cta" href={`${base}/check-availability`}>
        Get a shortlist <span aria-hidden="true">→</span>
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
  const offered = (Object.keys(FORMATS) as FormatKey[]).filter(key => offering(site.people, key) > 0);
  const topics = topItems(
    site.people.map(person => person.talks),
    12,
  ).map(({ item }) => item);
  return (
    <SiteLayout ctx={ctx} path="/legends" graph={graph} crumbs={crumbs}>
      <section className="page-head">
        <div className="wrap">
          <span className="eyebrow">All {v.legendsNoun}</span>
          <div className="ph-row">
            <h1 className="disp">{heading}.</h1>
            <p className="lead" {...edit('vocab.rosterLead')}>
              {v.rosterLead}
            </p>
          </div>
        </div>
      </section>
      <section className="block first roster">
        <div className="wrap" data-roster="" data-page-size={PAGE_SIZE}>
          <div className="filter-row">
            <label className="select role-select">
              <span className="sr-only">Role</span>
              <select data-filter="role" disabled={demo || undefined}>
                <option value="">All roles</option>
                {categoryRoles(site).map(role => (
                  <option key={role.key} value={role.key}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="select">
              <span className="sr-only">Topic</span>
              <select data-filter="topic" disabled={demo || undefined}>
                <option value="">Any topic</option>
                {topics.map(topic => (
                  <option key={topic} value={topicKey(topic)}>
                    {topic}
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
                placeholder={`Search by name, e.g. ${site.featured.map(slug => ctx.bySlug[slug]).find(Boolean)?.name ?? site.people[0]?.name ?? 'Ledley King'}`}
                aria-label={`Search ${v.legendsNoun}`}
                disabled={demo || undefined}
              />
            </label>
            <SortSelect ctx={ctx} />
          </div>
          {/* Announced to screen readers as the filters change; not shown (no counts on the page). */}
          <p className="sr-only" data-count="" aria-live="polite">
            Showing {site.people.length} of {site.people.length} {v.legendsNoun}
          </p>
          {/* The cards sit directly under the page's <h1>, so their names are <h2>s. */}
          <div className="grid">
            {featuredFirst(site, site.people).map((person, i) => (
              <Card key={person.slug} ctx={ctx} person={person} level={2} eager={i < EAGER_CARDS} />
            ))}
            {site.people.length ? <HelpTile ctx={ctx} /> : null}
          </div>
          {/* Shown by the filters when nothing matches; shown from the start (no script needed) when the roster is empty. */}
          <p className="empty" hidden={site.people.length > 0}>
            No {v.legendsNoun} match those filters yet.{' '}
            <A demo={demo} href={v.beyondUrl} rel="noopener" {...edit('vocab.beyondLinkText', 'vocab.beyondUrl')}>
              <b>Browse {v.beyondLinkText} →</b>
            </A>
          </p>
          <ShowMore ctx={ctx} />
        </div>
      </section>
    </SiteLayout>
  );
}

/** The questions a category page answers, built from its people (formats and topics) plus the shared booking FAQ. */
export function categoryFaq(ctx: SiteContext, role: Role, people: Person[]): { q: string; a: string }[] {
  const { site, FORMATS } = ctx;
  const label = roleProse(site, role);
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
      a: `${listText(formats.map(({ key }) => FORMATS[key].title))}.`,
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
    mainEntity: peopleListNode(ctx, people, url, `${site.short} ${roleProse(site, role)}`),
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
  const label = roleProse(site, role);
  return (
    <SiteLayout ctx={ctx} path="/category" graph={graph} crumbs={crumbs}>
      <section className="c-hero">
        <div className="split-hero">
          <div className="copy">
            <div className="badges">
              <span className="badge light">Category</span>
            </div>
            <h1 className="disp" {...edit(`roles.${site.roles.indexOf(role)}.label`)}>
              {role.label}
            </h1>
            <p className="lead">
              Book {site.orgName} {label} for {listText(formats.slice(0, 3).map(({ key }) => lower(FORMATS[key].title)))}. {role.blurb}
            </p>
            <div className="ctas">
              <A demo={demo} className="btn btn-cta btn-lg" href={`${base}/check-availability`}>
                Get shortlist <span aria-hidden="true">→</span>
              </A>
              <A demo={demo} className="quiet" href="#people">
                See the {v.legendsNoun}
              </A>
            </div>
          </div>
          {role.image ? (
            <Photo
              ctx={ctx}
              id={role.image}
              cls="top media"
              slot="profile"
              alt={`${role.label}, ${site.orgName}`}
              priority
              paths={site.home.fromSpeakers ? 'home.fromSpeakers featured' : `roles.${site.roles.indexOf(role)}.image`}
              imagePath={site.home.fromSpeakers ? undefined : `roles.${site.roles.indexOf(role)}.image`}
            />
          ) : null}
        </div>
      </section>
      <nav className="cat-tabs" aria-label="Categories">
        <div className="wrap">
          <A demo={demo} href={`${base}/legends`}>
            All {v.legendsNoun}
          </A>
          {categoryRoles(site).map(other => (
            <A demo={demo} key={other.key} href={categoryPath(base, other)} aria-current={other.key === role.key ? 'page' : undefined}>
              {other.label}
            </A>
          ))}
        </div>
      </nav>
      <section className="block first tint" id="people" aria-labelledby="people-title">
        <div className="wrap" data-roster="" data-page-size={PAGE_SIZE}>
          <div className="results-head">
            <h2 className="count" id="people-title">
              Featured {label}
            </h2>
            <div className="filter-row">
              <label className="select">
                <span className="sr-only">Format</span>
                <select data-filter="format" disabled={demo || undefined}>
                  <option value="">Any format</option>
                  {formats.map(({ key }) => (
                    <option key={key} value={key}>
                      {FORMATS[key].title}
                    </option>
                  ))}
                </select>
              </label>
              <SortSelect ctx={ctx} />
            </div>
          </div>
          <p className="sr-only" data-count="" aria-live="polite">
            Showing {people.length} of {people.length} {label}
          </p>
          <div className="grid g3">
            {featuredFirst(site, people).map((person, i) => (
              <Card key={person.slug} ctx={ctx} person={person} eager={i < 3} />
            ))}
            <HelpTile ctx={ctx} />
          </div>
          <p className="empty" hidden>
            No {label} offer that format yet.{' '}
            <A demo={demo} href={`${base}/check-availability`}>
              <b>Ask the bookings team →</b>
            </A>
          </p>
          <ShowMore ctx={ctx} />
        </div>
      </section>
      {role.pitch ? (
        <section className="block" aria-labelledby="pitch-title">
          <div className="wrap side-head">
            <div className="intro">
              <span className="eyebrow" {...edit(`roles.${site.roles.indexOf(role)}.pitch.eyebrow`)}>
                {role.pitch.eyebrow}
              </span>
              <h2 className="disp" id="pitch-title" {...edit(`roles.${site.roles.indexOf(role)}.pitch.heading`)}>
                {role.pitch.heading}
              </h2>
              <p className="lead" {...edit(`roles.${site.roles.indexOf(role)}.pitch.lead`)}>
                {role.pitch.lead}
              </p>
            </div>
            <ul className="pitch-points">
              {role.pitch.points.map((point, i) => (
                <li key={point.title}>
                  <h3 {...edit(`roles.${site.roles.indexOf(role)}.pitch.points.${i}.title`)}>{point.title}</h3>
                  <p {...edit(`roles.${site.roles.indexOf(role)}.pitch.points.${i}.text`)}>{point.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section className="block" aria-labelledby="topics-title">
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
                  {topics.map(({ item }) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Formats offered</h3>
                <ul className="fmt-count">
                  {formats.map(({ key }) => (
                    <li key={key}>
                      <A demo={demo} href={ctx.pages.waysToBook ? `${base}/ways-to-book#${key}` : `${base}/legends?format=${key}`}>
                        {FORMATS[key].title}
                      </A>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}
      <FaqBlock ctx={ctx} faq={faq} title={`${role.label}, answered.`} tint />
      <RoleList
        ctx={ctx}
        eyebrow="More speakers"
        title={`Explore more ${site.short} ${v.legendsNoun}.`}
        lead={capital(
          `${listText(
            categoryRoles(site)
              .filter(other => other.key !== role.key)
              .map(other => roleProse(site, other)),
          )}, for every kind of event.`,
        )}
        exclude={role.key}
      />
      <CtaBand ctx={ctx} title={`Bring ${role.singular ? oneOf(site, role.singular) : `${site.short} ${label}`} to your next event.`} />
    </SiteLayout>
  );
}

export function ProfilePage({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { site, base, v, nl, demo } = ctx;
  const others = site.people.filter(other => other.slug !== person.slug);
  // Related speakers: the site's featured people first, then the same role, then everyone else.
  const sims = featuredFirst(site, [
    ...others.filter(other => site.featured.includes(other.slug)),
    ...others.filter(other => !site.featured.includes(other.slug) && other.role === person.role),
    ...others.filter(other => !site.featured.includes(other.slug) && other.role !== person.role),
  ]).slice(0, 4);
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
            )
              .filter(([id]) => id !== 'career' || person.timeline.length > 0)
              .map(([id, label]) => (
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
          {person.timeline.length ? <Timeline ctx={ctx} person={person} /> : null}{' '}
          <section id="talks">
            <span className="eyebrow">Talks about</span>
            <h2>Themes &amp; audiences</h2>{' '}
            <div className="taglists">
              <div>
                <h3>Talks about</h3>
                {tags(person.talks, `${person.first} talks about`, 'tags line')}
              </div>
              {person.audiences.length ? (
                <div>
                  <h3>Great for</h3>
                  {tags(person.audiences, `${person.first} is great for`)}
                </div>
              ) : null}
              {person.industries.length ? (
                <div>
                  <h3>Industries</h3>
                  {tags(person.industries, `Industries ${person.first} works with`)}
                </div>
              ) : null}
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
                <Card key={other.slug} ctx={ctx} person={other} cta="Explore profile" />
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
  const { site, base, v, demo } = ctx;
  return (
    <section className="p-hero">
      <div className="split-hero">
        <div className="copy">
          <div className="badges">
            <Official
              ctx={ctx}
              label={v.officialLegendLabel ?? `Official ${site.short} ${v.legendNoun}`}
              path="vocab.officialLegendLabel"
            />
            <span className="pill">{person.roleLabel}</span>
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
      {person.stats.length ? (
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
      ) : null}
    </section>
  );
}

/** "<name> at a glance": the answer-style definition list that opens a profile (docs/architecture.md → SEO and AEO). */
export function AtAGlance({ ctx, person }: { ctx: SiteContext; person: Person }) {
  const { site, v } = ctx;
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
        <dt>Known for</dt>
        <dd>{person.honour}</dd>
        {person.audiences.length ? (
          <>
            <dt>Best for</dt>
            <dd>{listText(person.audiences)}</dd>
          </>
        ) : null}
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
      <h2 {...edit('vocab.careerHeadline')}>{v.careerHeadline ?? `${site.short} story`}</h2>
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
              <h3 {...edit(`formats.${key}.title`)}>{format.title}</h3>
              <p {...edit(`formats.${key}.desc`)}>{format.desc}</p>
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
      <h2 {...edit('vocab.galleryHeadline')}>
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
        <A
          demo={demo}
          className="btn btn-cta btn-lg"
          href={`${base}/check-availability?legend=${person.slug}`}
          {...edit('vocab.checkAvailability')}
        >
          {ctx.v.checkAvailability} <span aria-hidden="true">→</span>
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
        {/* The hero photo: the most recent picture of the person (cards may show their playing days). */}
        <Photo ctx={ctx} id={person.hero} cls="top thumb" slot="mini" alt="" />
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

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

export function WaysToBookPage({ ctx }: { ctx: SiteContext }) {
  const { site, base, v, FORMATS, demo } = ctx;
  const path = `${base}/ways-to-book`;
  const count = Object.keys(FORMATS).length;
  const title =
    count < NUMBER_WORDS.length
      ? `${NUMBER_WORDS[count]} ways to book a ${site.short} ${v.legendNoun}.`
      : `Ways to book ${site.short} ${v.legendsNoun}`;
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
      paths={{ lead: 'vocab.waysLead' }}
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
      <EventSpaces ctx={ctx} />
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
    [1, 'Bookings team, one point of contact'],
  ];
  const photo = site.home.aboutImage;
  const pictured = photo ? site.people.find(person => person.hero === photo || person.card === photo) : undefined;
  return (
    <SimplePage
      ctx={ctx}
      path="/about"
      eyebrow="About the network"
      title={v.aboutTitle}
      lead={site.entity}
      paths={{ title: 'vocab.aboutTitle', lead: 'entity' }}
      graph={graph}
      crumbs={crumbs}
    >
      <section className="about-media">
        <div className="wrap">
          <Photo
            ctx={ctx}
            id={site.home.hospitalityImage}
            cls="wide"
            slot="split"
            alt=""
            priority
            paths="home.hospitalityImage"
            imagePath="home.hospitalityImage"
          />
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
      <FaqBlock ctx={ctx} faq={faq} title="Everything you need to know." tint />
      <section className="block about-intro" aria-labelledby="intro-title">
        <div className="wrap split">
          <div>
            <span className="eyebrow">Our {v.legendsNoun}</span>
            <h2 className="disp" id="intro-title">
              The people who made the club, in your room.
            </h2>
            <p className="lead" {...edit('vocab.aboutLead')}>
              {site.platform}{' '}
              {v.aboutLead ??
                `brings together former ${site.orgName} players, managers and backroom staff, plus today's first-team squad, for keynotes, dinners, workshops and events, all through one official platform.`}
            </p>
            <A demo={demo} className="more" href={`${base}/legends`}>
              Meet the {v.legendsNoun} <span aria-hidden="true">→</span>
            </A>
          </div>
          {photo ? (
            <Photo
              ctx={ctx}
              id={photo}
              cls="top"
              slot="split"
              alt={pictured ? personAlt(pictured) : `A ${site.short} ${v.legendNoun}`}
              paths={site.home.fromSpeakers ? 'home.fromSpeakers featured' : 'home.aboutImage'}
              imagePath={site.home.fromSpeakers ? undefined : 'home.aboutImage'}
            />
          ) : null}
        </div>
      </section>
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
