// Page chrome shared by every page of every site: utility bar, header and nav, footer.
import type { ReactNode } from 'react';
import type { FormatKey } from '../../lib/content/types.ts';
import { categoryRoles } from '../../lib/render/category.ts';
import { PEPTALK, type SiteContext } from '../../lib/render/context.ts';
import { categoryPath } from '../../lib/render/routes.ts';
import type { Crumb, Node } from '../../lib/seo/jsonld.ts';
import { Behaviour } from '../behaviour.tsx';
import { Concept } from '../concept.tsx';
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
      </main>
      <SiteFooter ctx={ctx} />
      {demo ? null : <Behaviour />}
    </>
  );
  return demo ? <div className="demo">{page}</div> : page;
}

/**
 * The utility bar (crest and tagline; the free-shortlist promise) and the header: the
 * organisation's mark and the platform name, the menu button, the nav (switched-off pages left out; `path` marks the
 * current section; the venue-hire link when the site has one) and the main call to action.
 */
export function SiteHeader({ ctx, path }: { ctx: SiteContext; path: string }) {
  const { site, base, pages, v, nl, demo } = ctx;
  const nav = (
    [['/legends', nl.legends], pages.waysToBook && ['/ways-to-book', nl.ways], pages.about && ['/about', nl.about]].filter(Boolean) as [
      string,
      string,
    ][]
  ).map(([href, label]) => (
    <li key={href}>
      <A
        demo={demo}
        href={`${base}${href}`}
        aria-current={path.startsWith(href) || (href === '/legends' && path.startsWith('/category')) ? 'page' : undefined}
      >
        {label}
      </A>
    </li>
  ));
  const venue = site.eventSpaces?.url ? (
    <li>
      <A demo={demo} href={site.eventSpaces.url} target="_blank" rel="noopener">
        Event spaces<span className="sr-only"> (opens in a new tab)</span>
      </A>
    </li>
  ) : null;
  const small = v.officialSmall ?? `Official ${site.orgName}`;
  return (
    <>
      <div className="util">
        <div className="wrap">
          <span>
            <Crest ctx={ctx} size="xs" />
            {site.tagline}
          </span>
          <span className="util-r">
            <span className="promise">Free, tailored shortlists</span>
          </span>
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
          <ul id="menu">
            {nav}
            {venue}
          </ul>{' '}
          <A demo={demo} className="btn btn-cta cta" href={`${base}/check-availability`}>
            Check availability <span aria-hidden="true">→</span>
          </A>
        </div>
      </header>
    </>
  );
}

/** The footer: the organisation's mark and entity sentence, category links, booking links, about links, legal links and the PepTalk line. */
export function SiteFooter({ ctx }: { ctx: SiteContext }) {
  const { site, base, pages, v, nl, FORMATS, demo } = ctx;
  return (
    <footer>
      <div className="wrap">
        <div className="fgrid">
          <div className="fbrand">
            {site.navMark === 'wordmark' && site.marks.wordmark ? (
              // biome-ignore lint/performance/noImgElement: partner marks are hotlinked, unmodified files.
              <img className="wordmark" src={site.marks.wordmark} alt={site.orgName} width={141} height={24} loading="lazy" />
            ) : (
              <Crest ctx={ctx} size="lg" />
            )}
            <p className="fstate">{site.entity}</p>
            {site.contact && Object.keys(site.contact).length ? (
              <address className="fcontact">
                {site.contact.email ? (
                  <A demo={demo} className="fc-mail" href={`mailto:${site.contact.email}`}>
                    {site.contact.email}
                  </A>
                ) : null}
                {site.contact.phone ? (
                  <A demo={demo} className="fc-phone" href={`tel:${site.contact.phone.replace(/[^+\d]/g, '')}`}>
                    {site.contact.phone}
                  </A>
                ) : null}
                {site.contact.hours ? <span className="fc-hours">{site.contact.hours}</span> : null}
              </address>
            ) : null}
          </div>
          <div>
            <h2>{nl.legends}</h2>
            <ul>
              {categoryRoles(site).map(role => (
                <li key={role.key}>
                  <A demo={demo} href={categoryPath(base, role)}>
                    {role.label}
                  </A>
                </li>
              ))}
              <li>
                <A demo={demo} href={`${base}/legends`}>
                  All {v.legendsNoun}
                </A>
              </li>
            </ul>
          </div>
          {pages.waysToBook ? (
            <div>
              <h2>{nl.ways}</h2>
              <ul>
                {(Object.keys(FORMATS) as FormatKey[]).slice(0, 6).map(key => (
                  <li key={key}>
                    <A demo={demo} href={`${base}/ways-to-book#${key}`}>
                      {FORMATS[key].title}
                    </A>
                  </li>
                ))}
                {pages.hospitality ? (
                  <li>
                    <A demo={demo} href={`${base}/hospitality`}>
                      {nl.hospitality}
                    </A>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
          <div>
            <h2>{nl.about}</h2>
            <ul>
              {pages.about ? (
                <>
                  <li>
                    <A demo={demo} href={`${base}/about`}>
                      About this platform
                    </A>
                  </li>
                  <li>
                    <A demo={demo} href={`${base}/about#faq`}>
                      FAQs
                    </A>
                  </li>
                </>
              ) : null}
              <li>
                <A demo={demo} href={`${base}/check-availability`}>
                  Check availability
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
            <A demo={demo} href={`${base}/accessibility`}>
              Accessibility
            </A>
          </span>
          <A demo={demo} className="ppl" href={PEPTALK} rel="noopener">
            Operated by {/* biome-ignore lint/performance/noImgElement: PepTalk's own logo file. */}
            <img className="pt-logo" src="/peptalk/logo.png" alt="PepTalk" width={69} height={18} loading="lazy" />
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
  extra,
  children,
}: {
  ctx: SiteContext;
  path: string;
  eyebrow: string;
  title: string;
  lead?: string | null;
  graph: Node;
  crumbs: Crumb[];
  /** Shown under the heading row (jump links on ways to book, filters on the roster). */
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SiteLayout ctx={ctx} path={path} graph={graph} crumbs={crumbs}>
      <section className="page-head">
        <div className="wrap">
          <span className="eyebrow">{eyebrow}</span>
          <div className="ph-row">
            <h1 className="disp">{title}</h1>
            {lead ? <p className="lead">{lead}</p> : null}
          </div>
          {extra}
        </div>
      </section>
      {children}
    </SiteLayout>
  );
}
