// The 404 page for every unknown URL (https://nextjs.org/docs/app/api-reference/file-conventions/not-found, global-not-found).
// The app has several root layouts (one per site, plus the hub), so the 404 brings its own document. The proxy sends
// unknown page paths here, so the page is server-rendered with a 404 status (lib/proxy/decide.ts, NOT_FOUND_REWRITE).
import type { Metadata, Viewport } from 'next';
import { Document } from '../components/document.tsx';
import { NotFoundPage } from '../components/landing.tsx';
import { pageMetadata } from '../lib/pages/metadata.ts';
import { LANDING_FONTS } from '../lib/render/assets.ts';

export const metadata: Metadata = pageMetadata({
  title: 'Page not found | PepTalk Appearances',
  description: 'Page not found.',
  path: '/',
  siteName: 'PepTalk Appearances',
  image: '/og/appearances.jpg',
  canonical: false,
});

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function GlobalNotFound() {
  return (
    <Document lang="en-GB" bodyClass="landing" fonts={LANDING_FONTS}>
      <NotFoundPage />
    </Document>
  );
}
