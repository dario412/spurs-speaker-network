// /<slug>/check-availability: the enquiry form (always exists).
import type { Metadata } from 'next';
import { CheckAvailabilityPage } from '../../../components/site/pages.tsx';
import { card } from '../../../lib/pages/metadata.ts';
import { ctxFor, siteMetadata, siteOr404, siteParams } from '../../../lib/pages/site-page.ts';
import { checkAvailabilityCopy } from '../../../lib/seo/copy.ts';

export const dynamicParams = false;
export const generateStaticParams = siteParams;

export async function generateMetadata({ params }: PageProps<'/[site]/check-availability'>): Promise<Metadata> {
  const mounted = await siteOr404((await params).site);
  const ctx = ctxFor(mounted);
  const stored = mounted.site;
  return siteMetadata(ctx, checkAvailabilityCopy(ctx), {
    path: `${ctx.base}/check-availability`,
    image: card(`${stored.slug}-check-availability`),
  });
}

export default async function Page({ params }: PageProps<'/[site]/check-availability'>) {
  return <CheckAvailabilityPage ctx={ctxFor(await siteOr404((await params).site))} />;
}
