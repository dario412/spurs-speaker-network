// /_gallery/<slug>: every shared component in that site's branding (components/gallery/). Never indexed.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteGallery } from '../../../components/gallery/gallery.tsx';
import { content } from '../../../lib/content/index.ts';
import { siteGalleryPath } from '../../../lib/gallery.ts';
import { pageMetadata } from '../../../lib/pages/metadata.ts';
import { ctxFor, iconFor, loadSite } from '../../../lib/pages/site-page.ts';
import { decodeDeep } from '../../../lib/render/text.ts';
import { langFor } from '../../../lib/seo/indexing.ts';

export const dynamicParams = false;

/** Published sites only, by slug: the gallery is a hub page, so domain mounts (`<slug>--domain`) have none. */
export const generateStaticParams = async (): Promise<{ site: string }[]> =>
  (await content().listSites()).map(site => ({ site: site.slug }));

async function load(params: PageProps<'/gallery--internal/[site]'>['params']) {
  const mounted = await loadSite((await params).site);
  if (!mounted || mounted.onDomain) notFound();
  return mounted;
}

export async function generateMetadata({ params }: PageProps<'/gallery--internal/[site]'>): Promise<Metadata> {
  const { site } = await load(params);
  const { platform } = decodeDeep(site);
  return pageMetadata({
    title: `Component gallery | ${platform}`,
    description: `Every shared component of the PepTalk Appearances platforms, rendered with ${platform}’s content and branding.`,
    path: siteGalleryPath(site.slug),
    siteName: platform,
    image: '/og/appearances.jpg',
    icon: iconFor(site),
    lang: langFor(site),
    indexable: false,
    canonical: false,
  });
}

export default async function Page({ params }: PageProps<'/gallery--internal/[site]'>) {
  const mounted = await load(params);
  const [legal, sites] = await Promise.all([content().getLegal('terms'), content().listSites()]);
  return <SiteGallery ctx={ctxFor(mounted)} demo={ctxFor(mounted, true)} legal={legal} sites={decodeDeep(sites)} />;
}
