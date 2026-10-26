// /<slug>/hospitality (site.json pages.hospitality).
import type { Metadata } from 'next';
import { HospitalityPage } from '../../../components/site/pages.tsx';
import { card } from '../../../lib/pages/metadata.ts';
import { ctxFor, optionalPageOr404, optionalPageParams, siteMetadata } from '../../../lib/pages/site-page.ts';
import { hospitalityCopy } from '../../../lib/seo/copy.ts';

export const dynamicParams = false;
export const generateStaticParams = () => optionalPageParams('hospitality');

export async function generateMetadata({ params }: PageProps<'/[site]/hospitality'>): Promise<Metadata> {
  const mounted = await optionalPageOr404((await params).site, 'hospitality');
  const ctx = ctxFor(mounted);
  const stored = mounted.site;
  return siteMetadata(ctx, hospitalityCopy(ctx), { path: `${ctx.base}/hospitality`, image: card(`${stored.slug}-hospitality`) });
}

export default async function Page({ params }: PageProps<'/[site]/hospitality'>) {
  return <HospitalityPage ctx={ctxFor(await optionalPageOr404((await params).site, 'hospitality'))} />;
}
