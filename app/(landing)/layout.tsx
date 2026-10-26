// Root layout for the PepTalk landing page (app/(landing)/page.tsx: `/`, or `/all` when a root site takes `/`). Master
// password only while the hub isn't indexable. Prerendered.
import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { Document } from '../../components/document.tsx';
import { content } from '../../lib/content/index.ts';
import { HUB_LANDING_FONTS, landingStylesheetHref } from '../../lib/render/assets.ts';

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <Document lang="en-GB" bodyClass="landing" stylesheets={[landingStylesheetHref(await content().listSites())]} fonts={HUB_LANDING_FONTS}>
      {children}
    </Document>
  );
}
