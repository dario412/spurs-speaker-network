// Home page and its sections, each exported so the component gallery (/_gallery) can show it on its own.
// site.homeLayout can move "ways to book" under the role tiles and hide the eras module; sections alternate
// tinted/plain backgrounds whatever is shown.
import type { ReactNode } from 'react';
import { HOME_FORMATS } from '../../lib/content/defaults.ts';
import { slotAlt } from '../../lib/render/alt.ts';
import { officialLabel, type SiteContext } from '../../lib/render/context.ts';
import { homeCopy } from '../../lib/seo/copy.ts';
import { siteGraph } from '../../lib/seo/jsonld.ts';
import { Beyond, Card, FormSection, Official, WaysGrid } from './components.tsx';
import { EventSpaces } from './event-spaces.tsx';
import { SiteLayout } from './layout.tsx';
import { A, Button, Form, Photo } from './primitives.tsx';

type Section = 'roles' | 'featured' | 'eventSpaces' | 'squad' | 'ways' | 'eras' | 'eventStory';

const blockClass = (i: number, extra = '') => `block${i % 2 === 0 ? ' tint' : ''}${i === 0 ? ' first' : ''}${extra}`;

function Head({
  ctx,
  eyebrow,
  title,
  lead,
  link,
}: {
  ctx: SiteContext;
  eyebrow: string;
  title: string;
  lead?: string;
  link?: [string, string] | null;
}) {
  return (
    <div className="head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="disp">{title}</h2>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {link ? (
        <A demo={ctx.demo} href={link[0]}>
          {link[1]}
        </A>
      ) : null}
    </div>
  );
}

/** "Browse by role": one tile per role, linking to the roster filtered by it. `index` sets the alternating background. */
export function RoleTiles({ ctx, index = 0 }: { ctx: SiteContext; index?: number }) {
  const { site, base, v, demo } = ctx;
  return (
    <section className={blockClass(index)}>
      <div className="wrap">
        <Head ctx={ctx} eyebrow="Browse by role" title={v.rolesHeadline} link={[`${base}/legends`, 'See everyone']} />
        <div className="cats">
          {site.roles.map(role => (
            <A demo={demo} key={role.key} className="cat" href={`${base}/legends?role=${role.key}`}>
              {/* Decorative: the tile's heading names the role, and the photo has no caption data. */}
              {role.image ? (
                <Photo ctx={ctx} id={role.image} cls="top" slot="cat" alt="" />
              ) : (
                <div className="photo noimg">Club archive image</div>
              )}
              <div className="bd">
                <h3>{role.label}</h3>
                <p>{role.blurb}</p>
                <span className="ct">{role.browseLabel ?? `Browse ${role.label}`} →</span>
              </div>
            </A>
          ))}
        </div>
      </div>
    </section>
  );
}

/** "Featured this season": the site's `featured` people as cards, then the "beyond" panel. */
export function FeaturedGrid({ ctx, index = 0 }: { ctx: SiteContext; index?: number }) {
  const { site, base, bySlug, v } = ctx;
  return (
    <section className={blockClass(index)} id="legends">
      <div className="wrap">
        <Head ctx={ctx} eyebrow={v.featuredEyebrow} title={v.featuredHeadline} link={[`${base}/legends`, `See all ${v.legendsNoun}`]} />
        <div className="grid">
          {/* A people provider can hide a featured person; skip them rather than fail the page. */}
          {site.featured
            .filter(slug => bySlug[slug])
            .map(slug => (
              <Card key={slug} ctx={ctx} person={bySlug[slug]} />
            ))}
        </div>
        <Beyond ctx={ctx} />
      </div>
    </section>
  );
}

/** "Book today's stars": the first six current players (role `squad`). The home page leaves it out when there are none. */
export function Squad({ ctx, index = 0 }: { ctx: SiteContext; index?: number }) {
  const { site, base, v } = ctx;
  return (
    <section className={blockClass(index)} id="squad">
      <div className="wrap">
        <Head
          ctx={ctx}
          eyebrow={v.squadEyebrow}
          title={v.squadHeadline}
          lead={v.squadLead}
          link={[`${base}/legends?role=squad`, v.squadLinkText]}
        />
        <div className="grid">
          {site.people
            .filter(person => person.role === 'squad')
            .slice(0, 6)
            .map(person => (
              <Card key={person.slug} ctx={ctx} person={person} />
            ))}
        </div>
      </div>
    </section>
  );
}

/** The home page's "Ways to book" section: the short booking-format grid and a link to the full page when it is on. */
export function WaysSection({ ctx, index = 0 }: { ctx: SiteContext; index?: number }) {
  const { site, base, pages } = ctx;
  return (
    <section className={blockClass(index)}>
      <div className="wrap">
        <Head
          ctx={ctx}
          eyebrow="Ways to book"
          title={site.waysTitle}
          link={pages.waysToBook ? [`${base}/ways-to-book`, 'How booking works'] : null}
        />
        <WaysGrid ctx={ctx} keys={HOME_FORMATS} />
      </div>
    </section>
  );
}

/** "Browse by era": the era photo and one link per era (the `home.activeEra` one highlighted). */
export function Eras({ ctx, index = 0 }: { ctx: SiteContext; index?: number }) {
  const { site, base, v, demo } = ctx;
  const home = site.home;
  return (
    <section className={blockClass(index)}>
      <div className="wrap split">
        <Photo ctx={ctx} id={home.eraImage} slot="split" alt="" />
        <div>
          <span className="eyebrow">Browse by era</span>
          <h2 className="disp">{v.eraHeadline ?? `Pick your ${site.short} era`}</h2>
          <p>{v.eraLead}</p>
          <div className="eras">
            {site.eras.map(era => (
              <A
                demo={demo}
                key={era.key}
                href={`${base}/legends?era=${era.key}`}
                className={era.key === home.activeEra ? 'on' : undefined}
              >
                <b>{era.label}</b>
                <small>{era.blurb}</small>
              </A>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** "Event story": an illustrative event with three metrics (placeholder wording until real case studies exist). */
export function EventStory({ ctx, index = 0 }: { ctx: SiteContext; index?: number }) {
  const { site, v } = ctx;
  return (
    <section className={blockClass(index)}>
      <div className="wrap split rev">
        <Photo ctx={ctx} id={site.home.storyImage} slot="split" alt="" />
        <div>
          <span className="eyebrow">Event story</span>
          <h2 className="disp">{v.eventStoryTitle}</h2>
          <p>
            {v.eventStoryBody ??
              `A former manager and two fan favourites hosted a partner dinner at ${site.stadium}, with a Q&A, dressing-room stories and a lot of photos. (Illustrative example.)`}
          </p>
          <div className="metrics">
            {v.storyMetrics.map(([value, caption]) => (
              <div key={caption}>
                <b>{value}</b>
                <small>{caption}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const SECTIONS: Record<Section, (props: { ctx: SiteContext; index: number }) => ReactNode> = {
  roles: RoleTiles,
  featured: FeaturedGrid,
  eventSpaces: EventSpaces,
  squad: Squad,
  ways: WaysSection,
  eras: Eras,
  eventStory: EventStory,
};

/** The home hero: official label, headline, role pills, the roster search form and the hero and inset photos. */
export function HomeHero({ ctx }: { ctx: SiteContext }) {
  const { site, base, v, demo } = ctx;
  const home = site.home;
  return (
    <section className="hero">
      <div className="wrap">
        <div>
          <Official ctx={ctx} label={officialLabel(ctx)} />
          <br />
          <span className="eyebrow">{v.rolesEyebrow}</span>
          <h1 className="disp">
            <span>{site.heroTitle[0]}</span>
            <span>{site.heroTitle[1]}</span>
          </h1>
          <p>{v.heroLead}</p>
          <div className="roles">
            {site.roles.map(role => (
              <A demo={demo} key={role.key} href={`${base}/legends?role=${role.key}`}>
                {role.key === 'staff' ? v.staffPill : role.label}
              </A>
            ))}
          </div>
          <Form demo={demo} className="search" action={`${base}/legends`} method="get" role="search">
            <label>
              Who
              <select name="role" disabled={demo || undefined}>
                <option value="">Any {v.legendNoun}</option>
                {site.roles.map(role => (
                  <option key={role.key} value={role.key}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>{' '}
            <label>
              Era
              <select name="era" disabled={demo || undefined}>
                <option value="">Any era</option>
                {site.eras.map(era => (
                  <option key={era.key} value={era.key}>
                    {era.label}
                  </option>
                ))}
              </select>
            </label>{' '}
            <label>
              Search
              <input name="q" placeholder="Name or theme" disabled={demo || undefined} />
            </label>{' '}
            <Button demo={demo} type="submit">
              Search
            </Button>
          </Form>
        </div>{' '}
        <Photo ctx={ctx} id={home.hero.image} cls="hero-media top" slot="hero" alt={slotAlt(home.hero)} priority>
          <div className={`tag${home.hero.tag ? ` ${home.hero.tag}` : ''}`}>
            <b>{home.hero.name}</b>
            <small>{home.hero.line}</small>
          </div>
          <Photo ctx={ctx} id={home.inset.image} cls="mini top" slot="mini" alt={slotAlt(home.inset)} eager>
            <div className="tag">
              <b>{home.inset.name}</b>
              <small>{home.inset.line}</small>
            </div>
          </Photo>
        </Photo>
      </div>
    </section>
  );
}

/** The placeholder testimonial band: unattributed, site-level wording, never marked up as a review. */
export function Quote({ ctx }: { ctx: SiteContext }) {
  const { v } = ctx;
  return (
    <section className="quote">
      <div className="wrap">
        <span className="eyebrow">{v.quoteEyebrow}</span>
        <blockquote>{v.quote}</blockquote>
        <cite>{v.quoteCite}</cite>
      </div>
    </section>
  );
}

export function HomePage({ ctx }: { ctx: SiteContext }) {
  const { site, hasSquad } = ctx;
  const home = site.home;
  const graph = siteGraph({
    ctx,
    path: ctx.home,
    name: homeCopy(ctx).title,
    description: site.entity,
    image: home.hero.image ? site.images[home.hero.image] : null,
  });
  const layout = { waysAfterRoles: false, hideEras: false, ...site.homeLayout };
  const order: Section[] = layout.waysAfterRoles
    ? ['roles', 'ways', 'featured', 'eventSpaces', 'squad', 'eras', 'eventStory']
    : ['roles', 'featured', 'eventSpaces', 'squad', 'ways', 'eras', 'eventStory'];
  const hasFeatured = site.featured.some(slug => ctx.bySlug[slug]);
  const shown = order.filter(
    name =>
      !(name === 'eras' && layout.hideEras) &&
      !(name === 'squad' && !hasSquad) &&
      !(name === 'featured' && !hasFeatured) &&
      !(name === 'eventSpaces' && !site.eventSpaces?.url),
  );
  return (
    <SiteLayout ctx={ctx} path="/" graph={graph}>
      <HomeHero ctx={ctx} />
      {shown.map((name, index) => {
        const Section = SECTIONS[name];
        return <Section key={name} ctx={ctx} index={index} />;
      })}
      <Quote ctx={ctx} />
      <FormSection ctx={ctx} />
    </SiteLayout>
  );
}
