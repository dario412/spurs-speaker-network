// Demo-aware building blocks. A demo page (site.json demoHome / demoProfiles) is look-only: links lose their href and
// get aria-disabled, forms lose action/method, controls are disabled and FAQ toggles become static.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, FormHTMLAttributes, ReactNode } from 'react';
import type { SiteContext } from '../../lib/render/context.ts';
import { type PhotoOptions, photoAttributes } from '../../lib/render/images.ts';
import type { Crumb } from '../../lib/seo/jsonld.ts';

type Demo = { demo?: boolean };

export function A({ demo, href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & Demo) {
  return demo ? <a {...rest} aria-disabled="true" /> : <a href={href} {...rest} />;
}

export function Button({ demo, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & Demo) {
  return <button {...rest} disabled={demo || rest.disabled ? true : undefined} />;
}

export function Form({ demo, action, method, ...rest }: FormHTMLAttributes<HTMLFormElement> & Demo & { action?: string }) {
  return demo ? <form {...rest} /> : <form action={action} method={method} {...rest} />;
}

/**
 * One FAQ entry: <details>/<summary> normally, a static block on demo pages. The question is an <h3>, so FAQs sit in
 * the page outline under their section's <h2>; the answer is in the HTML either way (crawlable without JavaScript).
 */
export function FaqItem({ demo, q, a }: Demo & { q: string; a: string }) {
  return demo ? (
    <div className="faq-static">
      <h3 className="faq-q">{q}</h3>
      <p>{a}</p>
    </div>
  ) : (
    <details>
      <summary>
        <h3 className="faq-q">{q}</h3>
      </summary>
      <p>{a}</p>
    </details>
  );
}

/**
 * A photo slot: a sized box (CSS) holding the photo as a real <img> (lib/render/images.ts) plus any overlays.
 * `url` null renders the labelled "Photo to come" placeholder (shell sites); an empty alt marks a decorative photo.
 */
export function Picture({
  url,
  credit,
  cls = '',
  children,
  ...options
}: PhotoOptions & { url: string | null; credit?: string; cls?: string; children?: ReactNode }) {
  if (!url)
    return (
      <div className={`photo noimg ${cls}`} {...(options.alt ? { role: 'img', 'aria-label': `${options.alt}: photo to come` } : {})}>
        {children}
        <span className="gid">Photo to come</span>
      </div>
    );
  return (
    <div className={`photo ${cls}`}>
      {/* biome-ignore lint/performance/noImgElement: getImageProps() output; next/image's inline style is blocked by the CSP. */}
      {/* biome-ignore lint/a11y/useAltText: alt is in the spread attributes (required by PhotoOptions). */}
      <img className="ph" {...photoAttributes(url, options)} />
      {children}
      {credit ? <span className="gid">{credit}</span> : null}
    </div>
  );
}

/** A photo from the site's image map by Getty id; `null` is allowed only on shell sites. */
export function Photo({
  ctx,
  id,
  ...rest
}: PhotoOptions & { ctx: SiteContext; id: string | null | undefined; cls?: string; children?: ReactNode }) {
  const { site } = ctx;
  if (id === null && site.status === 'shell') return <Picture url={null} {...rest} />;
  if (!id || !site.images[id]) throw new Error(`Unknown image ${id} for ${site.slug}`);
  return <Picture url={site.images[id]} credit={`Getty ${id}`} {...rest} />;
}

/** Visible breadcrumb trail (the same trail is in the page's BreadcrumbList structured data). */
export function Crumbs({ demo, crumbs }: Demo & { crumbs: Crumb[] }) {
  return (
    <nav className="wrap crumbs" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((crumb, i) =>
          i === crumbs.length - 1 ? (
            <li key={crumb.path} aria-current="page">
              {i > 0 ? <span aria-hidden="true">/ </span> : null}
              {crumb.name}
            </li>
          ) : (
            <li key={crumb.path}>
              {i > 0 ? <span aria-hidden="true">/ </span> : null}
              <A demo={demo} href={crumb.path}>
                {crumb.name}
              </A>{' '}
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}

export function Crest({ ctx, size }: { ctx: SiteContext; size: 'xs' | 'md' | 'lg' | 'xl' | 'nav' }) {
  return <span className={`crest ${size}`} role="img" aria-label={`${ctx.site.orgName} crest`} />;
}

/** Inline JSON-LD (a data block: browsers never execute it, so the CSP doesn't apply). */
export function JsonLd({ data }: { data: unknown }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD data block; `<` is escaped so it cannot close the tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
