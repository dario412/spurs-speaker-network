// Metadata for every page (title, description, canonical, Open Graph, Twitter, robots), through the Metadata API.
// Relative URLs resolve against metadataBase: the build's public origin (lib/origin.ts).
// Robots follow the indexing switch (lib/seo/indexing.ts): `noindex, nofollow` unless the page's site is indexable.
import type { Metadata } from 'next';
import { ogCard } from '../manifest.ts';
import { publicOrigin } from '../origin.ts';
import { ogLocale } from '../seo/indexing.ts';

export interface PageMeta {
  title: string;
  description: string;
  path: string;
  siteName: string;
  /** A /og/… card (1200×630) or an absolute image URL (profile photos). */
  image: string;
  ogTitle?: string;
  imageAlt?: string;
  type?: 'website' | 'profile';
  icon?: string;
  /** Search engines may index the page (default false). */
  indexable?: boolean;
  /** BCP 47 content language (default en-GB). */
  lang?: string;
  /** Emit a canonical link (default true; the 404 page has none). */
  canonical?: boolean;
  origin?: string;
}

export function pageMetadata({
  title,
  description,
  path,
  siteName,
  image,
  ogTitle,
  imageAlt,
  type = 'website',
  icon,
  indexable = false,
  lang = 'en-GB',
  canonical = true,
  origin = publicOrigin(),
}: PageMeta): Metadata {
  const card = !/^https?:/.test(image);
  const shareTitle = ogTitle ?? title;
  return {
    metadataBase: new URL(origin),
    title,
    description,
    robots: indexable ? { index: true, follow: true, 'max-image-preview': 'large' } : { index: false, follow: false },
    referrer: 'strict-origin-when-cross-origin',
    icons: { icon: icon ?? '/peptalk/favicon.png' },
    ...(canonical ? { alternates: { canonical: path } } : {}),
    openGraph: {
      type,
      siteName,
      title: shareTitle,
      description,
      ...(canonical ? { url: path } : {}),
      images: [card ? { url: image, width: 1200, height: 630, alt: imageAlt ?? shareTitle } : { url: image, alt: imageAlt ?? shareTitle }],
      locale: ogLocale(lang),
    },
    twitter: { card: 'summary_large_image', title: shareTitle, description, images: [image] },
  };
}

/** `/og/<name>.jpg`, or the generic card when that card hasn't been rendered yet. */
export const card = (name: string): string => ogCard(name);
