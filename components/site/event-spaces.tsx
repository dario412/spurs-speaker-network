import type { SiteContext } from '../../lib/render/context.ts';
import { A, Photo } from './primitives.tsx';

/** One partner-owned venue promotion, shared by every branded page. */
export function EventSpaces({ ctx }: { ctx: SiteContext }) {
  const config = ctx.site.eventSpaces;
  if (!config?.url) return null;
  return (
    <section className="event-spaces" aria-labelledby="event-spaces-heading">
      <div className="wrap event-spaces-grid">
        <Photo ctx={ctx} id={config.image} alt={config.imageAlt ?? ''} slot="split" cls="event-spaces-photo" />
        <div className="event-spaces-copy">
          <span className="eyebrow">Event spaces</span>
          <h2 className="disp" id="event-spaces-heading">
            {config.heading}
          </h2>
          <p>{config.copy}</p>
          <A
            demo={ctx.demo}
            className="btn btn-blue"
            href={config.url}
            target="_blank"
            rel="noopener"
            data-event-spaces="true"
            data-brand={ctx.site.slug}
          >
            {config.buttonText} <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </A>
        </div>
      </div>
    </section>
  );
}
