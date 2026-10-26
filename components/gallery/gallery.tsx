// The component gallery pages: /_gallery (the site switcher) and /_gallery/<slug> (every entry in entries.tsx, in that
// site's branding, under its own root layout with the site's theme stylesheet and no tracking). Developer tool: master
// password only and never indexed (lib/gallery.ts).
import type { LegalDoc, Person, Site } from '../../lib/content/types.ts';
import { GALLERY_PATH, siteGalleryPath } from '../../lib/gallery.ts';
import type { SiteContext } from '../../lib/render/context.ts';
import { Behaviour } from '../behaviour.tsx';
import { GALLERY, galleryAnchor } from './entries.tsx';

/** The person the person-level entries show: the first legend (role other than `squad`), else the first person. */
export const galleryPerson = (site: Site): Person => site.people.find(person => person.role !== 'squad') ?? site.people[0];

/** Links to every site's gallery; the current one is marked. */
function SiteSwitcher({ sites, current }: { sites: Pick<Site, 'slug' | 'short'>[]; current?: string }) {
  return (
    <nav className="gallery-sites" aria-label="Sites">
      <ul>
        {sites.map(site => (
          <li key={site.slug}>
            <a href={siteGalleryPath(site.slug)} aria-current={site.slug === current ? 'page' : undefined}>
              {site.short}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** /_gallery/<slug>: every gallery entry rendered with this site's content and branding. */
export function SiteGallery({
  ctx,
  demo,
  legal,
  sites,
}: {
  ctx: SiteContext;
  demo: SiteContext;
  legal: LegalDoc;
  sites: Pick<Site, 'slug' | 'short'>[];
}) {
  const props = { ctx, demo, legal, person: galleryPerson(ctx.site) };
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="gallery-bar">
        <div className="gallery-bar-in">
          <p>
            <a href={GALLERY_PATH}>
              <b>Component gallery</b>
            </a>{' '}
            <span>
              {ctx.site.platform} · {ctx.site.slug}
            </span>
          </p>
          <SiteSwitcher sites={sites} current={ctx.site.slug} />
        </div>
      </header>
      <nav className="gallery-toc" aria-label="Components">
        <ol>
          {GALLERY.map(entry => (
            <li key={entry.id}>
              <a href={`#${galleryAnchor(entry)}`}>{entry.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      <main id="main" className="gallery-main">
        {GALLERY.map(entry => (
          <section key={entry.id} className="gallery-entry" id={galleryAnchor(entry)} aria-labelledby={`${galleryAnchor(entry)}-title`}>
            <div className="gallery-entry-head">
              <h2 id={`${galleryAnchor(entry)}-title`}>{entry.title}</h2>
              {entry.note ? <p>{entry.note}</p> : null}
              <p className="gallery-meta">
                <code>{entry.covers.join(', ')}</code> · <code>{entry.source}</code>
              </p>
            </div>
            <div className="gallery-frame">{entry.render(props)}</div>
          </section>
        ))}
      </main>
      <Behaviour />
    </>
  );
}

/** /_gallery: what the gallery is, and a link to each site's. */
export function GalleryIndex({ sites }: { sites: Pick<Site, 'slug' | 'short' | 'platform' | 'orgName'>[] }) {
  return (
    <main id="main" className="gallery-index">
      <div className="gallery-index-in">
        <p className="eyebrow">Developer tool</p>
        <h1 className="disp">Component gallery</h1>
        <p className="lead">
          Every shared component in <code>components/site/</code>, rendered with one site’s content and branding. Pick a site; the bar at
          the top of each gallery switches between them. Master password only, never indexed, and not listed in any sitemap.
        </p>
        <ul className="gallery-index-sites">
          {sites.map(site => (
            <li key={site.slug}>
              <a href={siteGalleryPath(site.slug)}>
                <b>{site.platform}</b>
                <span>
                  {site.orgName} · <code>{siteGalleryPath(site.slug)}</code>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
