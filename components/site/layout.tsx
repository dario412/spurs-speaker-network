// Page chrome shared by every page of every site: utility bar, header and nav, footer.
import type { ReactNode } from 'react';
import { PEPTALK, type SiteContext } from '../../lib/render/context.ts';
import type { Crumb, Node } from '../../lib/seo/jsonld.ts';
import { Behaviour } from '../behaviour.tsx';
import { Concept } from '../concept.tsx';
import { EventSpaces } from './event-spaces.tsx';
import { A, Button, Crest, Crumbs, JsonLd } from './primitives.tsx';

/**
 * Every site page: structured data, skip link and concept banner, utility bar, header and nav, the page's breadcrumb
 * trail (inner pages), main content and footer. Demo pages are wrapped in `div.demo` (no box of its own), because the
 * <body> belongs to the site's root layout, which is shared by every page of the site.
 */
export function SiteLayout({
  ctx,
  path,
  graph,
  crumbs,
  children,
}: {
  ctx: SiteContext;
  path: string;
  graph: Node;
  crumbs?: Crumb[];
  children: ReactNode;
}) {
  const { demo } = ctx;
  const page = (
    <>
      <JsonLd data={graph} />
      <Concept demo={demo} banner={!ctx.launched} />
      <SiteHeader ctx={ctx} path={path} />
      <main id="main">
        {crumbs ? <Crumbs demo={demo} crumbs={crumbs} /> : null}
        {children}
        {path === '/' ? null : <EventSpaces ctx={ctx} />}
      </main>
      <SiteFooter ctx={ctx} />
      {demo ? null : <Behaviour />}
    </>
  );
  return demo ? <div className="demo">{page}</div> : page;
}

/**
 * The utility bar (crest, tagline, "Powered by PepTalk") and the header: the organisation's mark and the platform name,
 * the menu button, the nav (switched-off pages left out; `path` marks the current section) and the main call to action.
 */
export function SiteHeader({ ctx, path }: { ctx: SiteContext; path: string }) {
  const { site, base, pages, v, nl, demo } = ctx;
  const nav = (
    [
      ['/legends', nl.legends],
      pages.waysToBook && ['/ways-to-book', nl.ways],
      pages.hospitality && ['/hospitality', nl.hospitality],
      pages.about && ['/about', nl.about],
    ].filter(Boolean) as [string, string][]
  ).map(([href, label]) => (
    <li key={href}>
      <A demo={demo} href={`${base}${href}`} aria-current={path.startsWith(href) ? 'page' : undefined}>
        {label}
      </A>
    </li>
  ));
  const small = v.officialSmall ?? `Official ${site.orgName}`;
  return (
    <>
      <div className="util">
        <div className="wrap">
          <span>
            <Crest ctx={ctx} size="xs" />
            {site.tagline}
          </span>
          <A demo={demo} href={PEPTALK} rel="noopener">
            Powered by PepTalk
          </A>
        </div>
      </div>
      <header className="nav">
        <div className="wrap">
          <A demo={demo} className="brand" href={ctx.home} aria-label={`${site.platform} home`}>
            {site.navMark === 'wordmark' ? (
              <>
                {/* biome-ignore lint/performance/noImgElement: partner marks are hotlinked, unmodified files (see docs/brand-and-legal.md). */}
                <img className="wordmark" src={site.marks.wordmark ?? ''} alt={site.orgName} width={141} height={24} />
                <span className="sep" />
                <span>
                  <b>{site.platformShort}</b>
                  <small>{small}</small>
                </span>
              </>
            ) : (
              <>
                <span className="crest nav" role="img" aria-label={`${site.orgName} crest`} />
                <span className="sep" />
                <span>
                  <b>{site.platform}</b>
                  <small>{small}</small>
                </span>
              </>
            )}
          </A>{' '}
          <Button demo={demo} className="menu-btn" type="button" aria-expanded="false" aria-controls="menu" aria-label="Menu">
            ☰
          </Button>{' '}
          <ul id="menu">{nav}</ul>{' '}
          <A demo={demo} className="btn btn-blue cta" href={`${base}/check-availability`}>
            Check availability
          </A>
        </div>
      </header>
    </>
  );
}

/** The footer: crest, motto and entity sentence, role links, booking links, about links, legal links and the PepTalk line. */
export function SiteFooter({ ctx }: { ctx: SiteContext }) {
  const { site, base, pages, v, nl, demo } = ctx;
  return (
    <footer>
      <div className="wrap">
        <div className="fgrid">
          <div>
            <Crest ctx={ctx} size="lg" />
            {site.motto ? <div className="motto">{site.motto}</div> : null}
            <p className="fstate">{site.entity}</p>
          </div>
          <div>
            <h2>{nl.legends}</h2>
            <ul>
              {site.roles.map(role => (
                <li key={role.key}>
                  <A demo={demo} href={`${base}/legends?role=${role.key}`}>
                    {role.label}
                  </A>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Book a {v.legendNoun}</h2>
            <ul>
              <li>
                <A demo={demo} href={`${base}/check-availability`}>
                  Check availability
                </A>
              </li>
              {pages.waysToBook ? (
                <li>
                  <A demo={demo} href={`${base}/ways-to-book`}>
                    Ways to book
                  </A>
                </li>
              ) : null}
              {pages.hospitality ? (
                <li>
                  <A demo={demo} href={`${base}/hospitality`}>
                    {nl.hospitality}
                  </A>
                </li>
              ) : null}
              {pages.about ? (
                <li>
                  <A demo={demo} href={`${base}/about#faq`}>
                    FAQs
                  </A>
                </li>
              ) : null}
            </ul>
          </div>
          <div>
            <h2>About the platform</h2>
            <ul>
              {pages.about ? (
                <li>
                  <A demo={demo} href={`${base}/about`}>
                    About this platform
                  </A>
                </li>
              ) : null}
              <li>
                <A demo={demo} href={PEPTALK} rel="noopener">
                  About PepTalk
                </A>
              </li>
              <li>
                <A demo={demo} href={v.beyondUrl} rel="noopener">
                  More speakers on PepTalk
                </A>
              </li>
            </ul>
          </div>
        </div>
        <div className="fbar">
          <span>
            © 2026 {site.copyright} {v.officialFooter}
          </span>
          <span className="flegal">
            <A demo={demo} href={`${base}/terms`}>
              Terms
            </A>
            <A demo={demo} href={`${base}/privacy`}>
              Privacy
            </A>
          </span>
          <A demo={demo} className="ppl" href={PEPTALK} rel="noopener">
            Bookings, contracting &amp; payments powered by <i>PepTalk</i>
          </A>
        </div>
      </div>
    </footer>
  );
}

/** A standard inner page: crumbs, page head (eyebrow, title, lead) and the given sections. */
export function SimplePage({
  ctx,
  path,
  eyebrow,
  title,
  lead,
  graph,
  crumbs,
  children,
}: {
  ctx: SiteContext;
  path: string;
  eyebrow: string;
  title: string;
  lead?: string | null;
  graph: Node;
  crumbs: Crumb[];
  children: ReactNode;
}) {
  return (
    <SiteLayout ctx={ctx} path={path} graph={graph} crumbs={crumbs}>
      <section className="page-head">
        <div className="wrap">
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="disp">{title}</h1>
          {lead ? <p className="lead">{lead}</p> : null}
        </div>
      </section>
      {children}
    </SiteLayout>
  );
}
