// Building blocks reused across pages: person cards, badges, booking formats, the enquiry form, and the static twin of
// the consent banner.
import type { FormatKey, Person } from '../../lib/content/types.ts';
import { forwardingEnabled } from '../../lib/enquiry/config.ts';
import {
  AUDIENCE_SIZES,
  DEFAULT_AUDIENCE_SIZE,
  ENQUIRY_PATH,
  FIELD_LIMITS,
  HONEYPOT_FIELD,
  SENT_CONCEPT,
  SENT_LIVE,
  SITE_FIELD,
  STARTED_FIELD,
} from '../../lib/enquiry/fields.ts';
import { personAlt } from '../../lib/render/alt.ts';
import { topicKey } from '../../lib/render/category.ts';
import { officialLabel, type SiteContext } from '../../lib/render/context.ts';
import { A, Button, Crest, edit, Form, Photo } from './primitives.tsx';
import { formatLine } from './sections.tsx';

/**
 * Roster card for one person, used on the home page, roster, categories and profiles. `level` is the name's heading
 * level: 3 under a section's <h2>, 2 where the cards sit directly under the page's <h1> (the roster).
 * `eager` loads the photo straight away (cards in the first viewport); others load lazily. The data-* attributes feed
 * the roster filters (lib/behaviour.ts).
 */
export function Card({
  ctx,
  person,
  level = 3,
  eager = false,
  cta = 'See profile',
}: {
  ctx: SiteContext;
  person: Person;
  level?: 2 | 3;
  eager?: boolean;
  /** The button label at the foot of the card. */
  cta?: string;
}) {
  const { base, demo } = ctx;
  const href = `${base}/legends/${person.slug}`;
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <article
      className="card"
      data-role={person.role}
      data-era={person.era}
      data-formats={person.formats.join(' ')}
      data-topics={person.talks.map(topicKey).join(' ')}
      data-search={`${person.name} ${person.short} ${person.talks.join(' ')}`.toLowerCase()}
      data-name={person.name}
    >
      <A demo={demo} href={href} tabIndex={-1} aria-hidden="true">
        {/* The link is hidden from assistive tech (the name link below is the accessible one), so the alt text serves image search. */}
        <Photo ctx={ctx} id={person.card} cls="top" slot="card" alt={personAlt(person)} eager={eager}>
          <span className="role">{person.roleLabel}</span>
          {/* Current players are always schedule-limited, so the card pill is reserved for legends. */}
          {person.limited && person.role !== 'squad' ? <span className="ltd">Limited availability</span> : null}
        </Photo>
      </A>
      <div className="bd">
        <Heading>
          <A demo={demo} href={href}>
            {person.name}
          </A>
        </Heading>
        <div className="meta">{person.short}</div>
        <div className="hon">{person.honour}</div>
      </div>
      <div className="ft">
        <span className="fmts">{formatLine(person, 3)}</span>
        <A demo={demo} className="btn btn-line card-cta" href={href}>
          {cta}
          <span className="sr-only">: {person.name}</span> <span aria-hidden="true">→</span>
        </A>
      </div>
    </article>
  );
}

/** The shortlist toggle (lib/behaviour.ts keeps the shortlist in localStorage), on cards and profiles. */
export function ShortlistButton({
  ctx,
  person,
  label = '+ Shortlist',
  cls = 'shortlist',
}: {
  ctx: SiteContext;
  person: Person;
  label?: string;
  cls?: string;
}) {
  return (
    <Button demo={ctx.demo} className={cls} type="button" data-slug={`${ctx.site.slug}:${person.slug}`} aria-pressed="false">
      {label}
    </Button>
  );
}

/** The crest plus an "Official …" label, on the home and profile heroes. */
export function Official({ ctx, label, path }: { ctx: SiteContext; label: string; path?: string }) {
  return (
    <span className="official" {...edit(path)}>
      <Crest ctx={ctx} size="md" />
      {label}
    </span>
  );
}

/** Availability badge on profiles: "Limited availability" (amber) or "Available to book". */
export function Availability({ person }: { person: Pick<Person, 'limited'> }) {
  return (
    <span className={`avail${person.limited ? ' ltd' : ''}`}>
      <i />
      {person.limited ? 'Limited availability' : 'Available to book'}
    </span>
  );
}

/** Signpost to the wider PepTalk roster. */
export function Beyond({ ctx }: { ctx: SiteContext }) {
  const { site, v, demo } = ctx;
  return (
    <div className="beyond">
      <div>
        <b>Looking for someone beyond {site.short}?</b>
        <p>{v.beyondLead}</p>
      </div>
      <A demo={demo} className="btn btn-line" href={v.beyondUrl} rel="noopener">
        {v.beyondLinkText} →
      </A>
    </div>
  );
}

/**
 * Booking formats. The short form (home page) is a grid: title, one line and how many people offer it, linking to the
 * format on the ways-to-book page. `detailed` (the ways-to-book page) is one anchored row per format: description,
 * what's included, how many offer it and the actions. `level` as for Card.
 */
export function WaysGrid({
  ctx,
  keys,
  detailed = false,
  level = 3,
  help = false,
}: {
  ctx: SiteContext;
  keys: FormatKey[];
  detailed?: boolean;
  level?: 2 | 3;
  /** Close the short grid with a "Not sure which?" tile linking to the enquiry form. */
  help?: boolean;
}) {
  const { base, demo } = ctx;
  const Heading = level === 2 ? 'h2' : 'h3';
  if (!detailed)
    return (
      <div className="ways">
        {keys.map(key => {
          const format = ctx.FORMATS[key];
          return (
            <div className="way" key={key}>
              <Heading {...edit(`formats.${key}.title`)}>{format.title}</Heading>
              <p {...edit(`formats.${key}.short`)}>{format.short}</p>
              <A demo={demo} className="more" href={`${base}/legends?format=${key}`}>
                See who’s available<span className="sr-only"> for {format.title.toLowerCase()}</span> <span aria-hidden="true">→</span>
              </A>
            </div>
          );
        })}
        {help ? (
          <div className="way way-help">
            <Heading>Not sure which?</Heading>
            <p>Tell us about your event and we’ll suggest the right format and speaker.</p>
            <A demo={demo} className="more" href={`${base}/check-availability`}>
              Ask the bookings team <span aria-hidden="true">→</span>
            </A>
          </div>
        ) : null}
      </div>
    );
  return (
    <ol className="fmt-rows">
      {keys.map((key, i) => {
        const format = ctx.FORMATS[key];
        return (
          <li className="fmt-row" id={key} key={key}>
            <span className="n" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="what">
              <Heading {...edit(`formats.${key}.title`)}>{format.title}</Heading>
              <p {...edit(`formats.${key}.desc`)}>{format.desc}</p>
            </div>
            <div className="incl">
              <span className="eyebrow">Includes</span>
              <ul>
                {format.items.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="go">
              <A demo={demo} className="more" href={`${base}/legends?format=${key}`}>
                See speakers<span className="sr-only"> for {format.title.toLowerCase()}</span> <span aria-hidden="true">→</span>
              </A>
              <A demo={demo} className="btn btn-line" href={`${base}/check-availability`}>
                Check availability
              </A>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** "By sending this enquiry you agree to our {terms:Terms} and {privacy:Privacy Policy}." with links to the site's pages. */
export function Consent({ ctx }: { ctx: SiteContext }) {
  const { base, v, demo } = ctx;
  const parts = v.consentLine.split(/(\{(?:terms|privacy):[^}]*\})/);
  return (
    <p className="note consent">
      {parts.map((part, i) => {
        const link = /^\{(terms|privacy):([^}]*)\}$/.exec(part);
        return link ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split of one sentence.
          <A demo={demo} key={i} href={`${base}/${link[1]}`}>
            {link[2]}
          </A>
        ) : (
          part
        );
      })}
    </p>
  );
}

/** Which state the enquiry form shows: the fields (idle), or a fixed error or thank-you state (the component gallery). */
export type EnquiryState = 'idle' | 'error' | 'sent';

/**
 * The enquiry form. `compact` (the home page's booking section) asks only for the essentials: name, work email,
 * company, date, format, an optional preferred speaker and the brief.
 */
function EnquiryForm({
  ctx,
  idPrefix,
  state,
  compact = false,
}: {
  ctx: SiteContext;
  idPrefix: string;
  state: EnquiryState;
  compact?: boolean;
}) {
  const { site, v, FORMATS, demo } = ctx;
  const id = (name: string) => `${idPrefix}${name}`;
  const seg = (name: string, options: string[]) => (
    <div className="seg">
      {options.map((option, i) => (
        <label key={option}>
          <input type="radio" name={name} value={option} defaultChecked={i === 0} disabled={demo || undefined} />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
  return (
    // Posts to the endpoint without JavaScript (303 back to a thank-you or error state below); with JavaScript the
    // behaviour script validates, then sends it (when forwarding is on) or shows the concept confirmation.
    <Form
      demo={demo}
      className="enquiry"
      data-enquiry=""
      data-send={!demo && forwardingEnabled() ? '' : undefined}
      data-state={state === 'idle' ? undefined : state}
      method="post"
      action={ENQUIRY_PATH}
    >
      {demo ? null : (
        <>
          <div className="done enquiry-state" id={id('enquiry-sent')} tabIndex={-1}>
            <span className="official">
              <span className="crest md" role="img" aria-label={`${site.orgName} crest`} />
              Enquiry received
            </span>
            <p className="done-title">Thanks, we're on it</p>
            <p>{forwardingEnabled() ? SENT_LIVE : SENT_CONCEPT}</p>
          </div>
          <p className="enquiry-state error" id={id('enquiry-error')} tabIndex={-1}>
            We couldn't send your enquiry. Check your name, work email and company, then send it again.
          </p>
          <p className="enquiry-state error" id={id('enquiry-failed')} tabIndex={-1}>
            We couldn't send your enquiry just now. Please try again in a few minutes.
          </p>
          <input type="hidden" name={SITE_FIELD} value={site.slug} />
          <input type="hidden" name={STARTED_FIELD} value="" />
          <div className="hp" aria-hidden="true">
            <label htmlFor={id('f-website')}>Leave this field empty</label>
            <input id={id('f-website')} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
          </div>
        </>
      )}
      <div className="f">
        <label htmlFor={id('f-name')}>Name</label>
        <input id={id('f-name')} name="name" autoComplete="name" required maxLength={FIELD_LIMITS.name} disabled={demo || undefined} />
      </div>
      <div className="f">
        <label htmlFor={id('f-email')}>Work email</label>
        <input
          id={id('f-email')}
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={FIELD_LIMITS.email}
          disabled={demo || undefined}
        />
      </div>
      <div className="f">
        <label htmlFor={id('f-company')}>Company</label>
        <input
          id={id('f-company')}
          name="company"
          autoComplete="organization"
          required
          maxLength={FIELD_LIMITS.company}
          disabled={demo || undefined}
        />
      </div>
      <div className="f">
        <label htmlFor={id('f-date')}>Event date</label>
        <input id={id('f-date')} name="date" type="date" disabled={demo || undefined} />
      </div>
      {compact ? null : (
        <>
          <fieldset className="f full">
            <legend>Who are you looking for?</legend>
            {seg('who', v.whoOptions)}
          </fieldset>
          <fieldset className="f full">
            <legend>Where</legend>
            {seg('where', v.whereOptions)}
          </fieldset>
        </>
      )}
      <div className="f">
        <label htmlFor={id('f-format')}>Format</label>
        <select id={id('f-format')} name="format" disabled={demo || undefined}>
          {Object.values(FORMATS).map(format => (
            <option key={format.title}>{format.title}</option>
          ))}
        </select>
      </div>
      {compact ? null : (
        <div className="f">
          <label htmlFor={id('f-size')}>Audience size</label>
          <select id={id('f-size')} name="size" defaultValue={DEFAULT_AUDIENCE_SIZE} disabled={demo || undefined}>
            {AUDIENCE_SIZES.map(size => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </div>
      )}
      <div className={compact ? 'f' : 'f full'}>
        <label htmlFor={id('f-legend')}>
          Preferred speaker <small>(optional)</small>
        </label>
        <select id={id('f-legend')} name="legend" disabled={demo || undefined}>
          <option value="">No preference</option>
          {site.people.map(person => (
            <option key={person.slug} value={person.slug}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
      <div className="f full">
        <label htmlFor={id('f-brief')}>Your brief</label>
        <textarea
          id={id('f-brief')}
          name="brief"
          placeholder={compact ? 'Audience, location, budget range…' : 'Tell us about the occasion…'}
          maxLength={FIELD_LIMITS.brief}
          disabled={demo || undefined}
        />
      </div>
      <Button demo={demo} className="btn btn-cta btn-lg" type="submit">
        {compact ? 'Get my free shortlist →' : 'Check availability →'}
      </Button>
      <Consent ctx={ctx} />
      <p className="note">
        {compact
          ? 'Free and tailored to your brief. We only use your details to reply.'
          : `Handled by the PepTalk bookings team on behalf of ${site.orgName}.`}
      </p>
    </Form>
  );
}

/** The home page's enquiry card (beside "How booking works"): a heading, one line and the compact form. */
export function EnquiryCard({ ctx, state = 'idle' }: { ctx: SiteContext; state?: EnquiryState }) {
  return (
    <div className="enquiry-card">
      <h3 className="disp">Check availability</h3>
      <p>Two minutes. The bookings team replies within one working day.</p>
      <EnquiryForm ctx={ctx} idPrefix="home-" state={state} compact />
    </div>
  );
}

/**
 * The "check availability" section: pitch plus the enquiry form. `state` and `idPrefix` exist for the component gallery,
 * which shows the error and thank-you states side by side (pages leave both at their defaults: the states are then
 * driven by the URL fragment, see public/styles.css).
 */
export function FormSection({
  ctx,
  tint = true,
  first = false,
  h1 = false,
  state = 'idle',
  idPrefix = '',
}: {
  ctx: SiteContext;
  tint?: boolean;
  first?: boolean;
  h1?: boolean;
  state?: EnquiryState;
  idPrefix?: string;
}) {
  const { v } = ctx;
  const Heading = h1 ? 'h1' : 'h2';
  return (
    <section className={`block${tint ? ' tint' : ''}${first ? ' first' : ''}`} id={`${idPrefix}form`}>
      <div className="wrap formgrid">
        <div>
          <span className="eyebrow">Check availability</span>
          <Heading className="disp" {...edit('vocab.formHeadline')}>
            {v.formHeadline}
          </Heading>
          <p>
            Tell us about your event and the PepTalk bookings team will confirm availability around the {v.fixtureWord}, usually within one
            working day.
          </p>
          <div className="assure">
            <span>{officialLabel(ctx)}</span>
            <span>{v.assureRoles}</span>
            <span>Contracts &amp; payments by PepTalk</span>
          </div>
        </div>{' '}
        <EnquiryForm ctx={ctx} idPrefix={idPrefix} state={state} />
      </div>
    </section>
  );
}

/**
 * The consent banner as a component, for the component gallery only. On a site it is built in the browser by
 * public/tracking.js (DOM calls, no HTML strings, only when site.json → consent.required), so pages never render this.
 * test/next/gallery.test.ts checks that the wording, button labels and classes match public/tracking.js.
 */
export function ConsentBanner() {
  return (
    <aside className="consent-banner" aria-label="Cookie choices">
      <p>{CONSENT_BANNER_TEXT}</p>
      <div className="consent-actions">
        <button type="button" className="btn btn-blue">
          Accept analytics cookies
        </button>
        <button type="button" className="btn btn-line">
          Reject
        </button>
      </div>
    </aside>
  );
}

export const CONSENT_BANNER_TEXT =
  "We'd like to use analytics cookies to understand how this site is used. They are only set if you accept. You can change your mind by clearing this site's cookies.";
