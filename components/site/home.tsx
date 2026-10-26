// Home page and its sections, each exported so the component gallery (/_gallery) can show it on its own.
// Order: hero and finder, featured people, categories, how booking works, ways to book, the venue-hire promotion,
// the current squad, the operator band, FAQs and the closing call to action.
import { HOME_FORMATS } from '../../lib/content/defaults.ts';
import type { FormatKey } from '../../lib/content/types.ts';
import { slotAlt } from '../../lib/render/alt.ts';
import type { SiteContext } from '../../lib/render/context.ts';
import { categoryPath } from '../../lib/render/routes.ts';
import { homeCopy } from '../../lib/seo/copy.ts';
import { faqNode, siteGraph } from '../../lib/seo/jsonld.ts';
import { Beyond, Card, WaysGrid } from './components.tsx';
import { EventSpaces } from './event-spaces.tsx';
import { SiteLayout } from './layout.tsx';
import { Button, Form, Photo } from './primitives.tsx';
import { CtaBand, FaqBlock, Head, HowItWorks, PepTalkBand, RoleList, TrustChecks } from './sections.tsx';

/** "Featured": the site's `featured` people as cards, then the "beyond" panel. */
export function FeaturedGrid({ ctx }: { ctx: SiteContext }) {
  const { site, base, bySlug, v } = ctx;
  return (
    <section className="block tint" id="legends">
      <div className="wrap">
        <Head
          ctx={ctx}
          eyebrow={v.featuredEyebrow}
          title={v.featuredHeadline}
          link={[`${base}/legends`, `See all ${site.people.length} ${v.legendsNoun}`]}
        />
        <div className="grid">
          {/* A people provider can hide a featured person; skip them rather than fail the page. */}
          {site.featured
            .filter(slug => bySlug[slug])
            .slice(0, 4)
            .map(slug => (
              <Card key={slug} ctx={ctx} person={bySlug[slug]} />
            ))}
        </div>
        <Beyond ctx={ctx} />
      </div>
    </section>
  );
}

/** "Book today's stars": the first four current players (role `squad`). The home page leaves it out when there are none. */
export function Squad({ ctx }: { ctx: SiteContext }) {
  const { site, base, v } = ctx;
  const squad = site.people.filter(person => person.role === 'squad');
  const first = site.roles.find(role => role.key === 'squad');
  return (
    <section className="block" id="squad">
      <div className="wrap">
        <Head
          ctx={ctx}
          eyebrow={v.squadEyebrow}
          title={v.squadHeadline}
          lead={v.squadLead}
          link={first ? [categoryPath(base, first), v.squadLinkText] : null}
        />
        <div className="grid">
          {squad.slice(0, 4).map(person => (
            <Card key={person.slug} ctx={ctx} person={person} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** The home page's "Ways to book" section: the short format grid with how many people offer each. */
export function WaysSection({ ctx }: { ctx: SiteContext }) {
  const { site, pages, base } = ctx;
  return (
    <section className="block">
      <div className="wrap">
        <Head
          ctx={ctx}
          eyebrow="Ways to book"
          title={site.waysTitle}
          lead="Pick a format to see who's available for it, or tell us about your event and we'll suggest the best fit."
          link={pages.waysToBook ? [`${base}/ways-to-book`, 'How each format works'] : null}
        />
        <WaysGrid ctx={ctx} keys={HOME_FORMATS} />
      </div>
    </section>
  );
}

/** The home hero: eyebrow, headline, lead, the roster finder (who, format, search), trust checks and the photos. */
export function HomeHero({ ctx }: { ctx: SiteContext }) {
  const { site, base, v, FORMATS, demo } = ctx;
  const home = site.home;
  return (
    <section className="hero">
      <div className="wrap">
        <div className="hero-copy">
          <span className="eyebrow">{v.rolesEyebrow}</span>
          <h1 className="disp">
            <span>{site.heroTitle[0]}</span> <span>{site.heroTitle[1]}</span>
          </h1>
          <p className="lead">{v.heroLead}</p>
          <Form demo={demo} className="finder" action={`${base}/legends`} method="get" role="search">
            <label>
              <span>Who</span>
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
              <span>Format</span>
              <select name="format" disabled={demo || undefined}>
                <option value="">Any format</option>
                {(Object.keys(FORMATS) as FormatKey[]).map(key => (
                  <option key={key} value={key}>
                    {FORMATS[key].title}
                  </option>
                ))}
              </select>
            </label>{' '}
            <label>
              <span>Search</span>
              <input name="q" placeholder="Name or topic" disabled={demo || undefined} />
            </label>{' '}
            <Button demo={demo} type="submit">
              Find {v.legendsNoun}
            </Button>
          </Form>
          <TrustChecks ctx={ctx} />
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

export function HomePage({ ctx }: { ctx: SiteContext }) {
  const { site, hasSquad } = ctx;
  const home = site.home;
  const faq = ctx.faq();
  const graph = siteGraph({
    ctx,
    path: ctx.home,
    name: homeCopy(ctx).title,
    description: site.entity,
    image: home.hero.image ? site.images[home.hero.image] : null,
    extra: [faqNode(faq, ctx.url(ctx.home), ctx)],
  });
  const hasFeatured = site.featured.some(slug => ctx.bySlug[slug]);
  return (
    <SiteLayout ctx={ctx} path="/" graph={graph}>
      <HomeHero ctx={ctx} />
      {hasFeatured ? <FeaturedGrid ctx={ctx} /> : null}
      <RoleList
        ctx={ctx}
        title="Find the right voice for the room."
        lead={`${site.roles.map(role => role.label).join(', ')}, each with the formats they're available for.`}
      />
      <HowItWorks ctx={ctx} />
      <WaysSection ctx={ctx} />
      <EventSpaces ctx={ctx} />
      {hasSquad ? <Squad ctx={ctx} /> : null}
      <PepTalkBand ctx={ctx} />
      <FaqBlock ctx={ctx} faq={faq} title={`Booking a ${site.short} ${ctx.v.legendNoun}, answered.`} />
      <CtaBand ctx={ctx} />
    </SiteLayout>
  );
}
