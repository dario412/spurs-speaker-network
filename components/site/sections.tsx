// Page sections shared by several templates (home, about, ways to book, categories, profiles): section heads, the
// role list, "how booking works", the PepTalk band, the FAQ block, trust checks and the closing call to action.
// Each is exported so the component gallery (/_gallery) can show it on its own.
import type { ReactNode } from 'react';
import type { FormatKey, Person } from '../../lib/content/types.ts';
import { categoryRoles } from '../../lib/render/category.ts';
import { PEPTALK, type SiteContext } from '../../lib/render/context.ts';
import { categoryPath } from '../../lib/render/routes.ts';
import { A, edit, FaqItem, Photo } from './primitives.tsx';

/** Short format names for card footers and filters ("Keynote · Hospitality"); the full titles live in FORMATS. */
export const FORMAT_SHORT: Record<FormatKey, string> = {
  keynote: 'Keynote',
  dinner: 'After-dinner',
  appearance: 'Appearances',
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
  paths = {},
}: {
  ctx: SiteContext;
  eyebrow: string;
  title: string;
  lead?: string | null;
  link?: [string, string] | null;
  id?: string;
  /** site.json paths of the eyebrow, title and lead, for the visual editor. */
  paths?: { eyebrow?: string; title?: string; lead?: string; link?: string };
}) {
  return (
    <div className="head">
      <div>
        <span className="eyebrow" {...edit(paths.eyebrow)}>
          {eyebrow}
        </span>
        <h2 className="disp" id={id} {...edit(paths.title)}>
          {title}
        </h2>
      </div>
      {lead ? (
        <p className="lead" {...edit(paths.lead)}>
          {lead}
        </p>
      ) : null}
      {link ? (
        <A demo={ctx.demo} className="more" href={link[0]} {...edit(paths.link)}>
          {link[1]} <span aria-hidden="true">→</span>
        </A>
      ) : null}
    </div>
  );
}

/** Trust checks under a call to action: what the visitor gets, in three short lines. */
export function TrustChecks({ ctx }: { ctx: SiteContext }) {
  const { v } = ctx;
  return (
    <ul className="checks">
      <li {...edit('vocab.trustOfficial')}>{v.trustOfficial}</li>
      <li {...edit('vocab.trustShortlist')}>{v.trustShortlist}</li>
      <li {...edit('vocab.trustManaged')}>{v.trustManaged}</li>
    </ul>
  );
}

/**
 * The role list: one row per category (photo, label, blurb, arrow) linking to its category page.
 * `exclude` leaves out the current category on a category page.
 */
export function RoleList({
  ctx,
  eyebrow,
  title,
  lead,
  exclude,
  tint = false,
  titlePath,
}: {
  ctx: SiteContext;
  eyebrow?: string;
  title?: string;
  lead?: string;
  exclude?: string;
  tint?: boolean;
  /** site.json path of a given `title`, for the visual editor. */
  titlePath?: string;
}) {
  const { site, base, v, demo } = ctx;
  const roles = categoryRoles(site).filter(role => role.key !== exclude);
  if (!roles.length) return null;
  return (
    <section className={`block${tint ? ' tint' : ''}`}>
      <div className="wrap side-head">
        <div className="intro">
          <span className="eyebrow" {...edit(!eyebrow && 'vocab.browseEyebrow')}>
            {eyebrow ?? v.browseEyebrow}
          </span>
          <h2 className="disp" {...edit(title ? titlePath : 'vocab.rolesHeadline')}>
            {title ?? v.rolesHeadline}
          </h2>
          {lead ? <p className="lead">{lead}</p> : null}
        </div>
        <ul className="rolelist">
          {roles.map(role => {
            const r = `roles.${site.roles.indexOf(role)}`;
            return (
              <li key={role.key}>
                <A demo={demo} href={categoryPath(base, role)}>
                  {/* Decorative: the row's label names the role. */}
                  {role.image ? (
                    <Photo
                      ctx={ctx}
                      id={role.image}
                      cls="thumb top"
                      slot="cat"
                      alt=""
                      paths={site.home.fromSpeakers ? 'home.fromSpeakers featured' : `${r}.image`}
                      imagePath={site.home.fromSpeakers ? undefined : `${r}.image`}
                    />
                  ) : (
                    <span className="thumb" />
                  )}
                  <span className="txt">
                    <b {...edit(`${r}.label`)}>{role.label}</b>
                    <small {...edit(`${r}.blurb`)}>{role.blurb}</small>
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

/**
 * "How booking works": three steps on the navy band. With `form` (the home page) the steps stack on the left and the
 * enquiry form sits beside them; without it, the steps run in a row under the main call to action.
 */
export function HowItWorks({ ctx, form }: { ctx: SiteContext; form?: ReactNode }) {
  const { base, v, demo } = ctx;
  const steps = [
    [v.step1Title, v.step1Text],
    [v.step2Title, v.step2Text],
    [v.step3Title, v.step3Text],
  ];
  const list = (
    <ol className="steps">
      {steps.map(([title, text], i) => (
        <li key={title}>
          <span className="n" aria-hidden="true">
            {String(i + 1).padStart(2, '0')}
          </span>
          <h3 {...edit(`vocab.step${i + 1}Title`)}>{title}</h3>
          <p {...edit(`vocab.step${i + 1}Text`)}>{text}</p>
        </li>
      ))}
    </ol>
  );
  if (form)
    return (
      <section className="band how with-form" id="enquire" aria-labelledby="how-form-title">
        <div className="wrap">
          <div className="how-steps">
            <span className="eyebrow" {...edit('vocab.howEyebrow')}>
              {v.howEyebrow}
            </span>
            <h2 className="disp" id="how-form-title" {...edit('vocab.howHeadline')}>
              {v.howHeadline}
            </h2>
            {list}
          </div>
          {form}
        </div>
      </section>
    );
  return (
    <section className="band how" aria-labelledby="how-title">
      <div className="wrap">
        <div className="head">
          <div>
            <span className="eyebrow" {...edit('vocab.howEyebrow')}>
              {v.howEyebrow}
            </span>
            <h2 className="disp" id="how-title" {...edit('vocab.howHeadline')}>
              {v.howHeadline}
            </h2>
          </div>
          <A demo={demo} className="btn btn-cta" href={`${base}/check-availability`} {...edit('vocab.checkAvailability')}>
            {v.checkAvailability} <span aria-hidden="true">→</span>
          </A>
        </div>
        {list}
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
  lead,
  id = 'faq',
  tint = false,
  titlePath,
}: {
  ctx: SiteContext;
  faq: { q: string; a: string; key?: string }[];
  title: string;
  lead?: string;
  id?: string;
  tint?: boolean;
  /** site.json path of `title`, for the visual editor. */
  titlePath?: string;
}) {
  return (
    <section className={`block faq-block${tint ? ' tint' : ''}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="wrap side-head">
        <div className="intro">
          <span className="eyebrow">FAQs</span>
          <h2 className="disp" id={`${id}-title`} {...edit(titlePath)}>
            {title}
          </h2>
          <p className="lead" {...edit(!lead && 'vocab.faqLead')}>
            {lead ?? ctx.v.faqLead}
          </p>
        </div>
        <div className="faq">
          {faq.map(({ q, a, key }, i) => (
            <FaqItem
              key={q}
              demo={ctx.demo}
              q={q}
              a={a}
              open={i === 0}
              paths={key ? `faqOverrides.${key}.q faqOverrides.${key}.a` : undefined}
            />
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
          {site.motto ? (
            <span className="eyebrow" {...edit('motto')}>
              {site.motto}
            </span>
          ) : null}
          <h2 className="disp" id="cta-title" {...edit(!title && 'vocab.ctaTitle')}>
            {title ?? v.ctaTitle}
          </h2>
          <p {...edit(!children && 'vocab.ctaLead')}>{children ?? v.ctaLead}</p>
        </div>
        <div className="actions">
          <A demo={demo} className="btn btn-cta btn-lg" href={`${base}/check-availability`} {...edit('vocab.checkAvailability')}>
            {v.checkAvailability} <span aria-hidden="true">→</span>
          </A>
          <A demo={demo} className="quiet" href={`${base}/legends`} {...edit('vocab.ctaBrowse')}>
            {v.ctaBrowse}
          </A>
        </div>
      </div>
    </section>
  );
}
