// Root layout for the hub legal pages (/terms, /privacy): PepTalk branding, no site. Prerendered.
import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { Document } from '../../components/document.tsx';
import { LANDING_FONTS } from '../../lib/render/assets.ts';

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function HubLayout({ children }: { children: ReactNode }) {
  return (
    <Document lang="en-GB" bodyClass="landing" fonts={LANDING_FONTS}>
      {children}
    </Document>
  );
}
