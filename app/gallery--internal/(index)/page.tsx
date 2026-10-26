// /_gallery: the component gallery's site switcher (docs/onboarding.md → Component gallery). Never indexed.
import type { Metadata } from 'next';
import { GalleryIndex } from '../../../components/gallery/gallery.tsx';
import { content } from '../../../lib/content/index.ts';
import { GALLERY_PATH } from '../../../lib/gallery.ts';
import { pageMetadata } from '../../../lib/pages/metadata.ts';
import { decodeDeep } from '../../../lib/render/text.ts';

export const dynamic = 'force-static';

export const metadata: Metadata = pageMetadata({
  title: 'Component gallery | PepTalk Appearances',
  description: 'Every shared component of the PepTalk Appearances platforms, rendered with each site’s content and branding.',
  path: GALLERY_PATH,
  siteName: 'PepTalk Appearances',
  image: '/og/appearances.jpg',
  indexable: false,
  canonical: false,
});

export default async function Page() {
  return <GalleryIndex sites={decodeDeep(await content().listSites())} />;
}
