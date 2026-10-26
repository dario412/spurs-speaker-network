'use client';

import { useEffect, useState } from 'react';
import { photoAttributes } from '../lib/render/images.ts';

export interface LandingPerson {
  key: string;
  name: string;
  focus: string;
  site: string;
  siteLabel: string;
  headline: string;
  topics: string[];
  href: string;
  image: string | null;
  featured: boolean;
  featuredOrder: number;
}

export function LandingMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeOnLink = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('#ap-navigation a')) setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('click', closeOnLink);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('click', closeOnLink);
    };
  }, [open]);
  return (
    <div className="ap-menu">
      <button className="ap-menu-toggle" type="button" aria-expanded={open} aria-controls="ap-navigation" onClick={() => setOpen(!open)}>
        {open ? 'Close' : 'Menu'} <span aria-hidden="true">{open ? '×' : '+'}</span>
      </button>
      <nav id="ap-navigation" className={open ? 'ap-navigation is-open' : 'ap-navigation'} aria-label="Main navigation">
        <a href="#talent">Browse talent</a>
        <a href="#sports">Sports & organisations</a>
        <a href="#formats">Event formats</a>
        <a href="#how-it-works">How it works</a>
        <a className="ap-mobile-enquire" href="#enquire">
          Tell us about your event
        </a>
      </nav>
    </div>
  );
}

export function LandingTalent({ people, sites }: { people: LandingPerson[]; sites: { slug: string; name: string }[] }) {
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState('');
  const [limit, setLimit] = useState(6);
  const searching = Boolean(query.trim() || sport);
  const matches = people.filter(
    p =>
      (!sport || p.site === sport) &&
      (!query.trim() || `${p.name} ${p.siteLabel} ${p.headline} ${p.topics.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const results = searching ? matches : people.filter(p => p.featured).sort((a, b) => a.featuredOrder - b.featuredOrder);
  return (
    <>
      <search className="ap-search" aria-label="Find sports talent">
        <label>
          <span>Name, topic or keyword</span>
          <input
            type="search"
            value={query}
            placeholder="Try leadership, Jill Scott, F1…"
            onChange={e => {
              setQuery(e.target.value);
              setLimit(6);
            }}
          />
        </label>
        <label>
          <span>Sport or organisation</span>
          <select
            value={sport}
            onChange={e => {
              setSport(e.target.value);
              setLimit(6);
            }}
          >
            <option value="">All sports</option>
            {sites.map(s => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <a className="ap-button" href="#talent-results">
          Explore talent <span aria-hidden="true">↗</span>
        </a>
      </search>
      <div className="ap-results-heading" id="talent-results">
        <p role="status">
          {searching
            ? `${results.length} ${results.length === 1 ? 'person matches' : 'people match'} your search`
            : 'A few names to start the conversation'}
        </p>
        {searching ? (
          <button
            type="button"
            className="ap-text-button"
            onClick={() => {
              setQuery('');
              setSport('');
              setLimit(6);
            }}
          >
            Clear filters
          </button>
        ) : (
          <span>Explore their stories. Find your fit.</span>
        )}
      </div>
      <div className="ap-people-grid">
        {results.slice(0, limit).map(person => (
          <article key={person.key} className="ap-person">
            <a className="ap-person-image" data-focus={person.focus} href={person.href} aria-label={`View ${person.name}'s profile`}>
              {person.image ? (
                // biome-ignore lint/performance/noImgElement: CSP-safe attributes from the shared optimized image renderer.
                <img {...photoAttributes(person.image, { alt: person.name, slot: 'card' })} alt={person.name} />
              ) : (
                <span>Photo to come</span>
              )}
              <span className="ap-person-sport">{person.siteLabel}</span>
            </a>
            <div className="ap-person-body">
              <h3>
                <a href={person.href}>{person.name}</a>
              </h3>
              <p>{person.headline}</p>
              <div className="ap-topics">
                {person.topics.slice(0, 2).map(t => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <a className="ap-profile-link" href={person.href}>
                View profile <span aria-hidden="true">↗</span>
              </a>
            </div>
          </article>
        ))}
      </div>
      {!results.length ? (
        <div className="ap-empty">
          <h3>Let’s find a different starting point.</h3>
          <p>Try a name, another topic or a different sport. You can also share your brief and let us help you choose.</p>
          <a href="#enquire" className="ap-button">
            Help me choose
          </a>
        </div>
      ) : null}
      {results.length > limit ? (
        <div className="ap-center">
          <button type="button" className="ap-button ap-button-secondary" onClick={() => setLimit(limit + 6)}>
            Show more people
          </button>
        </div>
      ) : null}
      {!searching ? (
        <div className="ap-center">
          <a className="ap-text-link" href="#sports">
            Explore every sports collection ↗
          </a>
        </div>
      ) : null}
    </>
  );
}

export function LandingEnquiry() {
  const [draft, setDraft] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [longBrief, setLongBrief] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [details, setDetails] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [format, setFormat] = useState('');
  useEffect(() => {
    const selectFormat = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLElement>('[data-event-format]');
      if (link?.dataset.eventFormat) {
        setFormat(link.dataset.eventFormat);
        setDraft('');
      }
    };
    document.addEventListener('click', selectFormat);
    return () => document.removeEventListener('click', selectFormat);
  }, []);
  return (
    <div className="ap-enquiry-card">
      {draft ? (
        <div className="ap-confirmation" role="status">
          <span className="ap-success-mark" aria-hidden="true">
            ✓
          </span>
          <h3>Your enquiry is ready to email.</h3>
          <p>
            {longBrief
              ? 'Copy your full brief below, open the email draft, then paste it before sending to hello@getapeptalk.com.'
              : 'Open the draft in your email app, then send it to hello@getapeptalk.com to complete your enquiry.'}
          </p>
          {longBrief ? (
            <>
              <textarea readOnly rows={6} value={emailBody} aria-label="Full email brief" onFocus={event => event.currentTarget.select()} />
              <button
                className="ap-button ap-button-secondary"
                type="button"
                onClick={async () => {
                  try {
                    if (!navigator.clipboard) {
                      setCopyStatus('Select and copy the full brief above, then paste it into your email.');
                      return;
                    }
                    await navigator.clipboard.writeText(emailBody);
                    setCopyStatus('Copied. Paste the full brief into your email before sending.');
                  } catch {
                    setCopyStatus('Select and copy the full brief above, then paste it into your email.');
                  }
                }}
              >
                Copy full brief
              </button>
              <p role="status">{copyStatus}</p>
            </>
          ) : null}
          <a className="ap-button" href={draft}>
            Open email draft <span aria-hidden="true">↗</span>
          </a>
          <button className="ap-text-button" type="button" onClick={() => setDraft('')}>
            Edit your brief
          </button>
        </div>
      ) : (
        <form
          onSubmit={e => {
            e.preventDefault();
            const fields = new FormData(e.currentTarget);
            setDetails(Object.fromEntries([...fields].map(([name, value]) => [name, String(value)])));
            const value = (name: string) => String(fields.get(name) ?? '').trim();
            const body = [
              'Hello PepTalk,',
              '',
              'I’d like to discuss a sports talent booking.',
              '',
              `Name: ${value('name')}`,
              `Email: ${value('email')}`,
              `Event date: ${value('date') || 'Not decided'}`,
              `Location: ${value('location') || 'Not decided'}`,
              `Format: ${value('format') || 'Still exploring'}`,
              '',
              'Event brief:',
              value('brief'),
            ].join('\n');
            const address = `mailto:hello@getapeptalk.com?subject=${encodeURIComponent('Sports talent event enquiry')}`;
            const fullDraft = `${address}&body=${encodeURIComponent(body)}`;
            const needsCopy = fullDraft.length > 1800;
            setEmailBody(body);
            setLongBrief(needsCopy);
            setCopyStatus('');
            setDraft(needsCopy ? address : fullDraft);
          }}
        >
          <fieldset disabled={!ready}>
            <noscript>
              <p>
                Please email <a href="mailto:hello@getapeptalk.com">hello@getapeptalk.com</a> with your event details.
              </p>
            </noscript>
            <h3>Tell us a little about your event</h3>
            <p className="ap-form-note">Prepare your brief, then send it from your email app.</p>
            <div className="ap-form-grid">
              <label>
                Your name
                <input defaultValue={details.name} name="name" autoComplete="name" required maxLength={120} placeholder="Full name" />
              </label>
              <label>
                Work email
                <input
                  defaultValue={details.email}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="you@company.com"
                />
              </label>
              <label>
                Event date
                <input defaultValue={details.date} name="date" type="date" />
              </label>
              <label>
                Location
                <input defaultValue={details.location} name="location" maxLength={160} placeholder="City, country or virtual" />
              </label>
            </div>
            <label>
              What are you planning?
              <select name="format" value={format} onChange={event => setFormat(event.target.value)}>
                <option value="" disabled>
                  Choose an event format
                </option>
                {[
                  'Keynotes & after-dinner',
                  'Fireside chats & Q&As',
                  'Hospitality',
                  'Brand appearances',
                  'Coaching & participation',
                  'Leadership workshops',
                  'I’m still exploring',
                ].map(format => (
                  <option key={format}>{format}</option>
                ))}
              </select>
            </label>
            <label>
              Your brief
              <textarea
                name="brief"
                defaultValue={details.brief}
                rows={3}
                required
                maxLength={1500}
                placeholder="Your audience, what you’d like them to take away, and any names or budget you have in mind."
              />
            </label>
            <button className="ap-button" type="submit">
              Prepare email enquiry <span aria-hidden="true">↗</span>
            </button>
            <p className="ap-privacy">
              Your email app sends the enquiry; this form does not submit it. <a href="/privacy">Privacy policy</a>
            </p>
          </fieldset>
        </form>
      )}
    </div>
  );
}
