// The HTML document shell, shared by the root layouts: app/[site]/layout.tsx
// (each site), app/(landing)/layout.tsx and app/(hub)/layout.tsx (PepTalk hub pages) and app/global-not-found.tsx.
// Every page is prerendered at build time, so nothing here reads the request.
// The tracking slot is core: one shared snippet for every site, rendered only when the site has tags (site.json →
// tracking, or TRACKING_GTM_ID). It is an external file (public/tracking.js) configured by data attributes: no inline
// script, and no bytes at all on pages without tags (a client component would ship in every page's bundle).
import type { ReactNode } from 'react';
import { stylesHref, trackingScriptHref } from '../lib/render/assets.ts';
import type { Tracking } from '../lib/tracking.ts';

export function Document({
  lang,
  bodyClass,
  stylesheets = [],
  fonts = [],
  preconnect = [],
  orgName,
  tracking,
  children,
}: {
  lang: string;
  bodyClass: string;
  /** Stylesheets after the shared /styles.css (the site or landing theme). */
  stylesheets?: string[];
  /** Font files to preload (above-the-fold faces only). */
  fonts?: string[];
  /** Third-party origins to connect to early (partner mark hosts). */
  preconnect?: string[];
  /** The organisation name for the enquiry thank-you message (lib/behaviour.ts). */
  orgName?: string;
  /** The site's tags and whether they wait for consent; omitted (the default) renders no tracking at all. */
  tracking?: Tracking & { consentRequired: boolean };
  children: ReactNode;
}) {
  return (
    <html lang={lang}>
      {/* biome-ignore lint/style/noHeadElement: App Router root layouts own <head> (next/head is Pages Router only). */}
      <head>
        {fonts.map(href => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="" />
        ))}
        {preconnect.map(origin => (
          <link key={origin} rel="preconnect" href={origin} />
        ))}
        <link rel="stylesheet" href={stylesHref()} />
        {tracking ? (
          <script
            src={trackingScriptHref()}
            defer
            data-gtm-id={tracking.gtmId}
            data-ga4-id={tracking.ga4Id}
            data-consent={tracking.consentRequired ? 'required' : undefined}
          />
        ) : null}
        {stylesheets.map(href => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body className={bodyClass} data-org-name={orgName}>
        {children}
      </body>
    </html>
  );
}
