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
import { officialLabel, type SiteContext } from '../../lib/render/context.ts';
import { A, Button, Crest, Form, Photo } from './primitives.tsx';

/**
 * Roster card for one person, used on the home page, roster, profiles and hospitality page. `level` is the name's
 * heading level: 3 under a section's <h2>, 2 where the cards sit directly under the page's <h1> (the roster).
 * `eager` loads the photo straight away (cards in the first viewport); others load lazily.
 */
export function Card({ ctx, person, level = 3, eager = false }: { ctx: SiteContext; person: Person; level?: 2 | 3; eager?: boolean }) {
  const { base, demo } = ctx;
  const href = `${base}/legends/${person.slug}`;
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <article
      className="card"
      data-role={person.role}
      data-era={person.era}
      data-search={`${person.name} ${person.short} ${person.talks.join(' ')}`.toLowerCase()}
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
        <ul className="tags" aria-label={`${person.first} talks about`}>
          {person.talks.slice(0, 3).map(talk => (
            <li key={talk}>{talk}</li>
          ))}
        </ul>
        <div className="act">
          <A demo={demo} href={href}>
            View <span className="sr-only">{person.name}'s </span>profile →
          </A>
          <ShortlistButton ctx={ctx} person={person} />
        </div>
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
export function Official({ ctx, label }: { ctx: SiteContext; label: string }) {
  return (
    <span className="official">
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

/** Numbered grid of booking formats; detailed adds the description and example items. `level` as for Card. */
export function WaysGrid({
  ctx,
  keys,
  detailed = false,
  level = 3,
}: {
  ctx: SiteContext;
  keys: FormatKey[];
  detailed?: boolean;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className="ways">
      {keys.map((key, i) => {
        const format = ctx.FORMATS[key];
        return (
          <div className="way" key={key}>
            <div className="n" aria-hidden="true">
              {i + 1}
            </div>
            <Heading>{format.title}</Heading>
            <p>{detailed ? format.desc : format.short}</p>
            {detailed ? (
              <ul>
                {format.items.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
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

function EnquiryForm({ ctx, idPrefix, state }: { ctx: SiteContext; idPrefix: string; state: EnquiryState }) {
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
      <fieldset className="f full">
        <legend>Who are you looking for?</legend>
        {seg('who', v.whoOptions)}
      </fieldset>
      <fieldset className="f full">
        <legend>Where</legend>
        {seg('where', v.whereOptions)}
      </fieldset>
      <div className="f">
        <label htmlFor={id('f-format')}>Format</label>
        <select id={id('f-format')} name="format" disabled={demo || undefined}>
          {Object.values(FORMATS).map(format => (
            <option key={format.title}>{format.title}</option>
          ))}
        </select>
      </div>
      <div className="f">
        <label htmlFor={id('f-size')}>Audience size</label>
        <select id={id('f-size')} name="size" defaultValue={DEFAULT_AUDIENCE_SIZE} disabled={demo || undefined}>
          {AUDIENCE_SIZES.map(size => (
            <option key={size}>{size}</option>
          ))}
        </select>
      </div>
      <div className="f full">
        <label htmlFor={id('f-legend')}>Who you have in mind</label>
        <select id={id('f-legend')} name="legend" disabled={demo || undefined}>
          <option value="">Not sure yet, recommend someone</option>
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
          placeholder="Tell us about the occasion…"
          maxLength={FIELD_LIMITS.brief}
          disabled={demo || undefined}
        />
      </div>
      <Button demo={demo} className="btn btn-blue" type="submit">
        Check availability →
      </Button>
      <Consent ctx={ctx} />
      <p className="note">Handled by the PepTalk bookings team on behalf of {site.orgName}.</p>
    </Form>
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
          <Heading className="disp">{v.formHeadline}</Heading>
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
