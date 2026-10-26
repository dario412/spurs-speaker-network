// Root layout for /_gallery/<slug>: the site's <html lang>, body class, theme stylesheet, fonts and mark-host
// preconnects (as app/[site]/layout.tsx), plus the gallery's own stylesheet, and never the tracking slot, so working on
// components never sends analytics. Prerendered for every published site; master password only (lib/gallery.ts).
import type { Viewport } from 'next';
import { notFound } from 'next/navigation';
import { Document } from '../../../components/document.tsx';
import { loadSite } from '../../../lib/pages/site-page.ts';
import { galleryStylesHref, markOrigins, siteFonts, siteStylesheetHref } from '../../../lib/render/assets.ts';
import { decode } from '../../../lib/render/text.ts';
import { langFor } from '../../../lib/seo/indexing.ts';

export const dynamicParams = false;
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function GalleryLayout({ children, params }: LayoutProps<'/gallery--internal/[site]'>) {
  const mounted = await loadSite((await params).site);
  if (!mounted || mounted.onDomain) notFound();
  const { site } = mounted;
  return (
    <Document
      lang={langFor(site)}
      bodyClass={`site-${site.slug} gallery-page`}
      stylesheets={[siteStylesheetHref(site), galleryStylesHref()]}
      fonts={siteFonts(site)}
      preconnect={markOrigins(site)}
      orgName={decode(site.orgName)}
    >
      {children}
    </Document>
  );
}
