import type { SiteContext } from '../../lib/render/context.ts';
import { A, edit, Photo } from './primitives.tsx';

/**
 * The partner-owned venue promotion (home and ways to book): book a meeting or event space at the venue, with the
 * enquiry on the partner's own site, plus a line for visitors who already have a venue.
 */
export function EventSpaces({ ctx }: { ctx: SiteContext }) {
  const { site, base, v, demo } = ctx;
  const config = site.eventSpaces;
  if (!config?.url) return null;
  return (
    <section className="event-spaces" aria-labelledby="event-spaces-heading">
      <div className="wrap event-spaces-grid">
        <Photo
          ctx={ctx}
          id={config.image}
          alt={config.imageAlt ?? ''}
          slot="split"
          cls="event-spaces-photo"
          paths="eventSpaces.image eventSpaces.imageAlt"
        />
        <div className="event-spaces-copy">
          <span className="eyebrow" {...edit('eventSpaces.eyebrow')}>
            {config.eyebrow ?? 'Event spaces'}
          </span>
          <h2 className="disp" id="event-spaces-heading" {...edit('eventSpaces.heading')}>
            {config.heading}
          </h2>
          <p {...edit('eventSpaces.copy')}>{config.copy}</p>
          <A
            demo={demo}
            className="btn btn-blue"
            href={config.url}
            target="_blank"
            rel="noopener"
            data-event-spaces="true"
            data-brand={site.slug}
            {...edit('eventSpaces.buttonText', 'eventSpaces.url')}
          >
            {config.buttonText} <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </A>
          <div className="es-venue">
            <div>
              <b>Already have a venue?</b>
              <span>
                Bring a {site.short} {v.legendNoun} to your own meeting, conference or celebration.
              </span>
            </div>
            <A demo={demo} className="more" href={`${base}/legends`}>
              Find a {v.legendNoun} <span aria-hidden="true">→</span>
            </A>
          </div>
        </div>
      </div>
    </section>
  );
}
