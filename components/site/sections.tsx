// Page sections shared by several templates (home, about, ways to book, categories, profiles): section heads, the
// role list, "how booking works", the PepTalk band, the FAQ block, trust checks and the closing call to action.
// Each is exported so the component gallery (/_gallery) can show it on its own.
import type { ReactNode } from 'react';
import type { FormatKey, Person } from '../../lib/content/types.ts';
import { categoryRoles, peopleIn } from '../../lib/render/category.ts';
import { PEPTALK, type SiteContext } from '../../lib/render/context.ts';
import { categoryPath } from '../../lib/render/routes.ts';
import { A, FaqItem, Photo } from './primitives.tsx';

/** Short format names for card footers and filters ("Keynote · Hospitality"); the full titles live in FORMATS. */
export const FORMAT_SHORT: Record<FormatKey, string> = {
  keynote: 'Keynote',
  hospitality: 'Hospitality',
  brand: 'Brand',
  clinic: 'Clinics',
  fan: 'Fan events',
  workshop: 'Workshops',
  virtual: 'Virtual',
};

/** "Keynote · Hospitality · Brand": a person's first `n` formats. */
export const formatLine = (person: Pick<Person, 'formats'>, n = 3): string =>
  person.formats
    .slice(0, n)
    .map(key => FORMAT_SHORT[key])
    .join(' · ');

/** People who offer a format. */
export const offering = (people: Person[], key: FormatKey): number => people.filter(person => person.formats.includes(key)).length;

/** A section head: eyebrow, heading and optional lead, with an optional link on the right. */
export function Head({
  ctx,
  eyebrow,
  title,
  lead,
  link,
  id,
}: {
  ctx: SiteContext;
  eyebrow: string;
  title: string;
  lead?: string | null;
  link?: [string, string] | null;
  id?: string;
}) {
  return (
    <div className="head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="disp" id={id}>
          {title}
        </h2>
      </div>
      {lead ? <p className="lead">{lead}</p> : null}
      {link ? (
        <A demo={ctx.demo} className="more" href={link[0]}>
          {link[1]} <span aria-hidden="true">→</span>
        </A>
      ) : null}
    </div>
  );
}

/** Trust checks under a call to action: what the visitor gets, in three short lines. */
export function TrustChecks({ ctx }: { ctx: SiteContext }) {
  const { site } = ctx;
  return (
    <ul className="checks">
      <li>Official {site.orgName} service</li>
      <li>Free shortlist, no obligation</li>
      <li>Booked end to end by PepTalk</li>
    </ul>
  );
}

/**
 * The role list: one row per category (photo, label, blurb, how many people, arrow) linking to its category page.
 * `exclude` leaves out the current category on a category page.
 */
export function RoleList({
  ctx,
  eyebrow = 'Browse by role',
  title,
  lead,
  exclude,
  tint = false,
}: {
  ctx: SiteContext;
  eyebrow?: string;
  title?: string;
  lead?: string;
  exclude?: string;
  tint?: boolean;
}) {
  const { site, base, v, demo } = ctx;
  const roles = categoryRoles(site).filter(role => role.key !== exclude);
  if (!roles.length) return null;
  return (
    <section className={`block${tint ? ' tint' : ''}`}>
      <div className="wrap side-head">
        <div className="intro">
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="disp">{title ?? v.rolesHeadline}</h2>
          {lead ? <p className="lead">{lead}</p> : null}
        </div>
        <ul className="rolelist">
          {roles.map(role => {
            const count = peopleIn(site, role).length;
            return (
              <li key={role.key}>
                <A demo={demo} href={categoryPath(base, role)}>
                  {/* Decorative: the row's label names the role. */}
                  {role.image ? <Photo ctx={ctx} id={role.image} cls="thumb top" slot="cat" alt="" /> : <span className="thumb" />}
                  <span className="txt">
                    <b>{role.label}</b>
                    <small>{role.blurb}</small>
                  </span>
                  <span className="count">
                    {count} {count === 1 ? 'speaker' : 'speakers'}
                  </span>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                </A>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** "How booking works": three steps on the navy band, with the main call to action. */
export function HowItWorks({ ctx }: { ctx: SiteContext }) {
  const { base, v, demo } = ctx;
  const steps: [string, string][] = [
    ['Share your brief', 'Date, audience, format and who you have in mind. It takes two minutes and commits you to nothing.'],
    ['Get a tailored shortlist', `${v.diaryCheck} You get options and an indicative fee.`],
    ['Confirm and relax', 'PepTalk handles the contract, payment, briefing and logistics, then the day itself.'],
  ];
  return (
    <section className="band how" aria-labelledby="how-title">
      <div className="wrap">
        <div className="head">
          <div>
            <span className="eyebrow">How booking works</span>
            <h2 className="disp" id="how-title">
              From brief to booked in three steps.
            </h2>
          </div>
          <A demo={demo} className="btn btn-cta" href={`${base}/check-availability`}>
            Check availability <span aria-hidden="true">→</span>
          </A>
        </div>
        <ol className="steps">
          {steps.map(([title, text], i) => (
            <li key={title}>
              <span className="n" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** The operator band: who books and looks after the event (PepTalk), in PepTalk's own typeface and blue. */
export function PepTalkBand({ ctx }: { ctx: SiteContext }) {
  const { site, v, demo } = ctx;
  const items: [string, string][] = [
    ['Agreed with the club', `Appearances are arranged with ${site.orgName}, and current players are booked around the ${v.fixtureWord}.`],
    ['Briefed for your audience', 'PepTalk briefs your speaker on your theme, your guests and the moments that matter on the day.'],
    ['One team, start to finish', 'Enquiries, availability, contracts, payments and logistics, handled by the PepTalk bookings team.'],
  ];
  return (
    <section className="peptalk-band" aria-labelledby="peptalk-title">
      <div className="wrap side-head">
        <div className="intro">
          <A demo={demo} href={PEPTALK} rel="noopener" className="pt-mark" aria-label="PepTalk">
            {/* biome-ignore lint/performance/noImgElement: PepTalk's own logo file, shown unmodified. */}
            <img src="/peptalk/logo.png" alt="" width={123} height={32} />
          </A>
          <h2 id="peptalk-title">Booked and looked after by PepTalk.</h2>
          <p>
            PepTalk runs the {site.platform} for {site.orgName}: one team handles your enquiry, the contract and the day itself.
          </p>
        </div>
        <ul className="assure-list">
          {items.map(([title, text]) => (
            <li key={title}>
              <b>{title}</b>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** A FAQ block: heading on the left, questions on the right (the first one open). Answers are in the HTML for crawlers. */
export function FaqBlock({
  ctx,
  faq,
  title,
  lead = "Can't see your question? The bookings team replies to every enquiry.",
  id = 'faq',
  tint = false,
}: {
  ctx: SiteContext;
  faq: { q: string; a: string }[];
  title: string;
  lead?: string;
  id?: string;
  tint?: boolean;
}) {
  return (
    <section className={`block faq-block${tint ? ' tint' : ''}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="wrap side-head">
        <div className="intro">
          <span className="eyebrow">FAQs</span>
          <h2 className="disp" id={`${id}-title`}>
            {title}
          </h2>
          <p className="lead">{lead}</p>
        </div>
        <div className="faq">
          {faq.map(({ q, a }, i) => (
            <FaqItem key={q} demo={ctx.demo} q={q} a={a} open={i === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** The closing call to action: motto, headline, one line, the gold button and a quieter link to the roster. */
export function CtaBand({ ctx, title, children }: { ctx: SiteContext; title?: string; children?: ReactNode }) {
  const { site, base, v, demo } = ctx;
  return (
    <section className="band cta-band" aria-labelledby="cta-title">
      <div className="wrap">
        <div>
          {site.motto ? <span className="eyebrow">{site.motto}</span> : null}
          <h2 className="disp" id="cta-title">
            {title ?? `Bring a ${site.short} ${v.legendNoun} to your next event.`}
          </h2>
          <p>{children ?? 'Tell us about your event and get a free, no-obligation shortlist from the PepTalk bookings team.'}</p>
        </div>
        <div className="actions">
          <A demo={demo} className="btn btn-cta btn-lg" href={`${base}/check-availability`}>
            Check availability <span aria-hidden="true">→</span>
          </A>
          <A demo={demo} className="quiet" href={`${base}/legends`}>
            or browse all {site.people.length} {v.legendsNoun}
          </A>
        </div>
      </div>
    </section>
  );
}
