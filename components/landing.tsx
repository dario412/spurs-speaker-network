// The PepTalk-branded pages: the landing page (`/`, or `/all` with a root site), the hub legal pages and the 404 page.
import type { ReactNode } from 'react';
import type { LegalDoc, Site } from '../lib/content/types.ts';
import { canonicalUrl, type Domains } from '../lib/domains.ts';
import { slotAlt } from '../lib/render/alt.ts';
import { renderMarkdown } from '../lib/render/markdown-view.ts';
import { LANDING_HOME } from '../lib/render/routes.ts';
import { decodeDeep } from '../lib/render/text.ts';
import { hubGraph } from '../lib/seo/jsonld.ts';
import landingCopy from '../src/copy/landing.mjs';
import { Concept } from './concept.tsx';
import { LandingEnquiry, LandingMenu, LandingTalent } from './landing-interactions.tsx';
import { Crumbs, JsonLd, Picture } from './site/primitives.tsx';

/** A site's image URL by Getty id, or null (shell sites may leave images unset). */
const imageUrl = (site: Site, id: string | null | undefined): string | null => (id ? (site.images[id] ?? null) : null);

export function LandingPage({
  sites: stored,
  origin,
  indexable = false,
  description,
  domains = {},
  path = LANDING_HOME,
}: {
  sites: Site[];
  origin: string;
  indexable?: boolean;
  description?: string;
  /** registry.json → domains: structured data names a live site's domain as its URL. */
  domains?: Domains;
  /** The landing page's own URL (lib/render/routes.ts → landingPath): `/`, or `/all` when a root site takes `/`. */
  path?: string;
}) {
  const sites = decodeDeep(stored) as Site[];
  const available = new Set(sites.flatMap(site => site.people.map(person => `${site.slug}/${person.slug}`)));
  const candidates = [...landingCopy.featured, ...sites.flatMap(site => site.featured.map(slug => `${site.slug}/${slug}`)), ...available];
  const picks = new Set<string>();
  const pickedPeople = new Set<string>();
  for (const key of candidates) {
    const slug = key.split('/')[1];
    if (!available.has(key) || pickedPeople.has(slug)) continue;
    picks.add(key);
    pickedPeople.add(slug);
    if (picks.size === 6) break;
  }
  const featuredOrder = new Map([...picks].map((key, index) => [key, index]));
  const imageFocus: Record<string, string> = landingCopy.imageFocus;
  const people = sites.flatMap(site =>
    site.people.map(person => ({
      key: `${site.slug}/${person.slug}`,
      name: person.name,
      focus: imageFocus[`${site.slug}/${person.slug}`] ?? 'center',
      site: site.slug,
      siteLabel: site.short,
      headline: person.honour || person.line || person.short,
      topics: person.talks,
      href: `/${site.slug}/legends/${person.slug}`,
      image: person.card ? (site.images[person.card] ?? null) : null,
      featured: picks.has(`${site.slug}/${person.slug}`),
      featuredOrder: featuredOrder.get(`${site.slug}/${person.slug}`) ?? Number.MAX_SAFE_INTEGER,
    })),
  );
  const formats = [
    [
      'Talks that stay with you',
      'Keynotes & after-dinner',
      'Stories of pressure, ambition and reinvention, shaped around your audience.',
      'keynote',
    ],
    [
      'Get closer to the story',
      'Fireside chats & Q&As',
      'A real conversation with the people who lived the moments everyone remembers.',
      'fan',
    ],
    [
      'Make it an occasion',
      'Hospitality',
      'Bring a sporting perspective to your next client event, matchday or race weekend.',
      'hospitality',
    ],
    [
      'Put a face to your campaign',
      'Brand appearances',
      'Find a sporting name that fits your audience, with deliverables and usage agreed.',
      'brand',
    ],
    [
      'Learn by taking part',
      'Coaching & participation',
      'Shared experiences, practical sessions and community days with sporting talent.',
      'clinic',
    ],
    [
      'Take the lessons back to work',
      'Leadership workshops',
      'Explore how sporting teams prepare, make decisions and perform together.',
      'workshop',
    ],
  ];
  const questions = [
    [
      'How much does it cost to book someone?',
      'Fees depend on the person, date, location, format and any content or brand usage. Share your brief and budget so the booking team can explore suitable options.',
    ],
    [
      'Can I enquire without a name in mind?',
      'Yes. Start with your audience, event purpose and the experience you want to create. You don’t need to choose a person, sport or organisation first.',
    ],
    [
      'Can we book current athletes?',
      'Some current athletes consider appearances around training, competition and commercial commitments. Availability and permitted formats need to be confirmed for each enquiry.',
    ],
    [
      'How far ahead should we enquire?',
      'Enquire as early as you can, particularly around major competitions. If your date is close, share it anyway so suitable options can be explored.',
    ],
    [
      'Can talent travel or join virtually?',
      'Travel and virtual participation depend on the person and their schedule. Include the location, time zone and format in your brief.',
    ],
    [
      'Can we film the event or use it in a campaign?',
      'Recording, photography and brand use need to be agreed in advance. Explain where and how you want to use the content so permissions can be discussed before booking.',
    ],
  ];
  return (
    <>
      <JsonLd
        data={hubGraph({
          origin,
          path,
          landing: path,
          name: 'Sports talent for your event',
          description,
          sites,
          siteHome: site => canonicalUrl(site.slug, '', domains[site.slug], origin),
        })}
      />
      <div className="ap-page">
        <Concept banner={!indexable} />
        <header className="ap-header">
          <div className="ap-container ap-header-inner">
            <a className="ap-brand" href={path} aria-label="PepTalk Appearances home">
              {/* biome-ignore lint/performance/noImgElement: existing static PepTalk wordmark. */}
              <img src="/peptalk/logo.png" alt="PepTalk" width={137} height={36} />
              <span>Appearances</span>
            </a>
            <LandingMenu />
            <a className="ap-button ap-header-cta" href="#enquire">
              Tell us about your event
            </a>
          </div>
        </header>
        <main id="main">
          <section className="ap-hero">
            <div className="ap-container">
              <p className="ap-intro">Big sporting stories. The right person for your room.</p>
              <h1>
                Book sporting greats <br />
                for your next event.
              </h1>
              <p className="ap-hero-copy">
                From standout talks to hospitality and brand appearances, find the right sporting name for your audience. We’ll help with
                the brief, availability and booking details.
              </p>
              <div className="ap-actions">
                <a className="ap-button" href="#talent">
                  Explore sports talent <span aria-hidden="true">↗</span>
                </a>
                <a className="ap-button ap-button-secondary" href="#enquire">
                  Help me choose
                </a>
              </div>
              <ul className="ap-assurances">
                <li>People across the sporting world</li>
                <li>Options shaped around your brief</li>
                <li>Support through the booking</li>
              </ul>
              <nav className="ap-sport-strip" aria-label="Explore the collections">
                {sites.map(site => (
                  <a href={`/${site.slug}`} key={site.slug}>
                    {site.short}
                  </a>
                ))}
              </nav>
            </div>
          </section>
          <section className="ap-section" id="talent">
            <div className="ap-container">
              <div className="ap-section-heading">
                <div>
                  <p className="ap-kicker">Find your sporting voice</p>
                  <h2>
                    Extraordinary careers.
                    <br />
                    Conversations that matter.
                  </h2>
                </div>
                <p>Leadership. Resilience. The moments that change a team. Find someone who brings your theme to life.</p>
              </div>
              <LandingTalent people={people} sites={sites.map(site => ({ slug: site.slug, name: site.short }))} />
            </div>
          </section>
          <section className="ap-section ap-sports-section" id="sports">
            <div className="ap-container">
              <div className="ap-section-heading">
                <div>
                  <p className="ap-kicker">Follow your sport</p>
                  <h2>
                    Different worlds.
                    <br />
                    Remarkable people.
                  </h2>
                </div>
                <p>Have a sport or organisation in mind? Explore the collections and meet the people behind it.</p>
              </div>
              <div className="ap-sports-grid">
                {sites.map(site => (
                  <a href={`/${site.slug}`} className="ap-sport-card" key={site.slug} aria-label={`Explore ${site.orgName}`}>
                    <Picture url={imageUrl(site, site.home.hero.image)} slot="mini" alt={slotAlt(site.home.hero)} />
                    <div>
                      <h3>{site.short}</h3>
                      <span>{site.people.length} people to explore</span>
                    </div>
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
              <details className="ap-role-discovery">
                <summary>Prefer to browse by talent type?</summary>
                <div className="ap-role-grid">
                  {sites.map(site => (
                    <div key={site.slug}>
                      <h3>{site.short}</h3>
                      {site.roles
                        .filter(role => site.people.some(person => person.role === role.key))
                        .map(role => (
                          <a key={role.key} href={`/${site.slug}/legends?role=${role.key}`}>
                            {role.label}
                          </a>
                        ))}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </section>
          <section className="ap-section" id="formats">
            <div className="ap-container">
              <div className="ap-section-heading">
                <div>
                  <p className="ap-kicker">More than a moment on stage</p>
                  <h2>
                    The right person.
                    <br />
                    The right kind of event.
                  </h2>
                </div>
                <p>From an intimate conversation to a room full of fans, start with the experience you want to create.</p>
              </div>
              <div className="ap-formats-grid">
                {formats.map(([title, label, copy, key]) => (
                  <a key={key} className="ap-format-card" href="#enquire" data-event-format={label}>
                    <span className="ap-format-label">{label}</span>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                    <span className="ap-format-link">
                      Discuss your event <span aria-hidden="true">↗</span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </section>
          <section className="ap-service">
            <div className="ap-container ap-service-grid">
              <div className="ap-service-copy">
                <p className="ap-kicker">The people behind your booking</p>
                <h2>
                  A great name is
                  <br />
                  just the beginning.
                </h2>
                <p>
                  The right fit matters. So do the details. Your audience, the conversation you want to start, the practicalities that make
                  the day work.
                </p>
                <p>PepTalk brings those conversations together, from the first brief to the agreed booking.</p>
                <a className="ap-button" href="#enquire">
                  Let’s talk about your event
                </a>
                <a className="ap-service-parent" href="https://getapeptalk.com/">
                  Meet the wider world of PepTalk ↗
                </a>
              </div>
              <div className="ap-service-benefits">
                <article>
                  <span aria-hidden="true">↗</span>
                  <h3>A brief, not just a name</h3>
                  <p>Start with your audience and what you want them to take away. Explore people who fit the occasion.</p>
                </article>
                <article>
                  <span aria-hidden="true">↗</span>
                  <h3>The details, discussed early</h3>
                  <p>Availability, fees, travel and content usage all shape a booking. Get them into the conversation from the start.</p>
                </article>
                <article>
                  <span aria-hidden="true">↗</span>
                  <h3>One place to bring it together</h3>
                  <p>A point of contact for your brief and booking questions, without choosing a different platform first.</p>
                </article>
              </div>
            </div>
          </section>
          <section className="ap-section" id="how-it-works">
            <div className="ap-container">
              <div className="ap-section-heading">
                <div>
                  <p className="ap-kicker">From first thought to event day</p>
                  <h2>A simpler way to get there.</h2>
                </div>
              </div>
              <ol className="ap-steps">
                <li>
                  <span>1</span>
                  <h3>Tell us what you’re planning</h3>
                  <p>Your audience, date, location and budget. A name if you have one; an idea if you don’t.</p>
                </li>
                <li>
                  <span>2</span>
                  <h3>Explore the right options</h3>
                  <p>Discuss people, formats and availability, with the important details brought into view.</p>
                </li>
                <li>
                  <span>3</span>
                  <h3>Bring the booking together</h3>
                  <p>Agree the scope and terms, prepare the brief and plan the practicalities of the day.</p>
                </li>
              </ol>
            </div>
          </section>
          <section className="ap-section ap-faq-section">
            <div className="ap-container ap-faq-grid">
              <div>
                <p className="ap-kicker">Good questions</p>
                <h2>
                  Let’s clear
                  <br />a few things up.
                </h2>
                <p>Still thinking it through? You don’t need a finished plan to start a conversation.</p>
                <a className="ap-text-link" href="#enquire">
                  Ask us about your event ↗
                </a>
              </div>
              <div className="ap-faq-list">
                {questions.map(([q, a]) => (
                  <details key={q}>
                    <summary>
                      {q}
                      <span aria-hidden="true">+</span>
                    </summary>
                    <p>{a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
          <section className="ap-enquiry" id="enquire">
            <div className="ap-container ap-enquiry-grid">
              <div className="ap-enquiry-copy">
                <p className="ap-kicker">Your event starts here</p>
                <h2>
                  Have a name in mind?
                  <br />
                  Or just a big idea?
                </h2>
                <p>Tell us what you’re working on. Let’s find the sporting voice your audience will remember.</p>
                <div className="ap-enquiry-aside">
                  <b>No shortlist yet? No problem.</b>
                  <p>Start with the occasion. You don’t need to know who to book.</p>
                </div>
              </div>
              <LandingEnquiry />
            </div>
          </section>
        </main>
        <footer className="ap-footer">
          <div className="ap-container">
            <div className="ap-footer-grid">
              <div>
                <a className="ap-footer-brand" href={path}>
                  PepTalk<span>Appearances</span>
                </a>
                <p>
                  Sporting stories. Shared experiences.
                  <br />
                  People who bring your event to life.
                </p>
                <a href="https://getapeptalk.com/">Part of PepTalk ↗</a>
              </div>
              <div>
                <h2>Explore the collections</h2>
                <div className="ap-footer-sports">
                  {sites.map(site => (
                    <a href={`/${site.slug}`} key={site.slug}>
                      {site.short}
                    </a>
                  ))}
                </div>
              </div>
              <div>
                <h2>Make it happen</h2>
                <a href="#talent">Find talent</a>
                <a href="#formats">Event formats</a>
                <a href="#how-it-works">How it works</a>
                <a href="#enquire">Tell us about your event</a>
              </div>
            </div>
            <div className="ap-footer-bottom">
              <span>© 2026 PepTalk. Concept preview; imagery and partner content subject to approval.</span>
              <div>
                <a href="/terms">Terms</a>
                <a href="/privacy">Privacy</a>
                <a href="/accessibility">Accessibility</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

function PlainHeader() {
  return (
    <header className="nav">
      <div className="wrap">
        <a className="brand" href="/">
          <span>
            <b>PepTalk Appearances</b>
            <small>Official sports talent platforms</small>
          </span>
        </a>
      </div>
    </header>
  );
}

function PlainPage({ children, banner = true }: { children: ReactNode; banner?: boolean }) {
  return (
    <>
      <Concept banner={banner} />
      <PlainHeader />
      <main id="main">{children}</main>
    </>
  );
}

export function NotFoundPage() {
  return (
    <PlainPage>
      <section className="page-head">
        <div className="wrap">
          <span className="eyebrow">Page not found</span>
          <h1 className="disp">Page not found</h1>
          <p className="lead">We couldn't find that page. It may have moved, or the link may be out of date.</p>
        </div>
      </section>{' '}
      <section className="block first">
        <div className="wrap">
          <a className="btn btn-blue" href="/">
            Go to the home page →
          </a>
        </div>
      </section>
    </PlainPage>
  );
}

/** Hub-level /terms and /privacy: PepTalk branding, no site. */
export function HubLegalPage({
  doc,
  origin,
  indexable = false,
  landing = LANDING_HOME,
}: {
  doc: LegalDoc;
  origin: string;
  indexable?: boolean;
  /** The landing page's URL (lib/render/routes.ts → landingPath), the first breadcrumb. */
  landing?: string;
}) {
  const crumbs = [
    { name: 'PepTalk Appearances', path: landing },
    { name: doc.title, path: `/${doc.kind}` },
  ];
  return (
    <PlainPage banner={!indexable}>
      <JsonLd data={hubGraph({ origin, path: `/${doc.kind}`, landing, name: doc.title, crumbs })} />
      <Crumbs crumbs={crumbs} />
      <section className="page-head">
        <div className="wrap">
          <span className="eyebrow">Legal</span>
          <h1 className="disp">{doc.title}</h1>
          {doc.lastUpdated ? <p className="lead">Last updated: {doc.lastUpdated}</p> : null}
        </div>
      </section>
      <section className="block first">
        <div className="wrap prose legal">{renderMarkdown(doc.body)}</div>
      </section>
    </PlainPage>
  );
}
