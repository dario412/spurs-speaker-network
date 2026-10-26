// Root layout for /_gallery, the component gallery's site switcher (lib/gallery.ts): PepTalk hub branding plus the
// gallery's own stylesheet. Prerendered; master password only; no tracking.
import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { Document } from '../../../components/document.tsx';
import { content } from '../../../lib/content/index.ts';
import { galleryStylesHref, LANDING_FONTS, landingStylesheetHref } from '../../../lib/render/assets.ts';

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function GalleryIndexLayout({ children }: { children: ReactNode }) {
  return (
    <Document
      lang="en-GB"
      bodyClass="landing gallery-page"
      stylesheets={[landingStylesheetHref(await content().listSites()), galleryStylesHref()]}
      fonts={LANDING_FONTS}
    >
      {children}
    </Document>
  );
}
