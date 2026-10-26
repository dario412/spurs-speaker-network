// Root layout for every page of one site: <html lang> from the site's language, the site's body class, theme
// stylesheet, font preloads, mark-host preconnects and the tracking slot (off unless site.json → tracking or
// TRACKING_GTM_ID is set). The segment is the slug, or `<slug>--domain` for the copy served on the site's own domain. Each site page is prerendered at build time (static, served
// from the CDN); see docs/architecture.md, "Rendering and CSP". Demo pages mark themselves (components/site/layout.tsx).
import type { Viewport } from 'next';
import { Document } from '../../components/document.tsx';
import { ctxFor, siteOr404, siteParams } from '../../lib/pages/site-page.ts';
import { markOrigins, siteFonts, siteStylesheetHref } from '../../lib/render/assets.ts';
import { decode } from '../../lib/render/text.ts';
import { langFor } from '../../lib/seo/indexing.ts';
import { consentRequired, envGtmId, siteTracking } from '../../lib/tracking.ts';

export const dynamicParams = false;
export const generateStaticParams = siteParams;
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function SiteRootLayout({ children, params }: LayoutProps<'/[site]'>) {
  const mounted = await siteOr404((await params).site);
  const { site } = mounted;
  const tracking = siteTracking(site, envGtmId());
  return (
    <Document
      lang={langFor(site)}
      bodyClass={`site-${site.slug}`}
      stylesheets={[siteStylesheetHref(site, ctxFor(mounted).base)]}
      fonts={siteFonts(site)}
      preconnect={markOrigins(site)}
      orgName={decode(site.orgName)}
      tracking={tracking ? { ...tracking, consentRequired: consentRequired(site) } : undefined}
    >
      {children}
    </Document>
  );
}
