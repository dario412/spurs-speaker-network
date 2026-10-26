// /<slug>/about (site.json pages.about).
import type { Metadata } from 'next';
import { AboutPage } from '../../../components/site/pages.tsx';
import { card } from '../../../lib/pages/metadata.ts';
import { ctxFor, optionalPageOr404, optionalPageParams, siteMetadata } from '../../../lib/pages/site-page.ts';
import { aboutCopy } from '../../../lib/seo/copy.ts';

export const dynamicParams = false;
export const generateStaticParams = () => optionalPageParams('about');

export async function generateMetadata({ params }: PageProps<'/[site]/about'>): Promise<Metadata> {
  const mounted = await optionalPageOr404((await params).site, 'about');
  const ctx = ctxFor(mounted);
  const stored = mounted.site;
  return siteMetadata(ctx, aboutCopy(ctx), { path: `${ctx.base}/about`, image: card(`${stored.slug}-about`) });
}

export default async function Page({ params }: PageProps<'/[site]/about'>) {
  return <AboutPage ctx={ctxFor(await optionalPageOr404((await params).site, 'about'))} />;
}
