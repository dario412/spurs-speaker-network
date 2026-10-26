// /<slug>/ways-to-book (site.json pages.waysToBook).
import type { Metadata } from 'next';
import { WaysToBookPage } from '../../../components/site/pages.tsx';
import { card } from '../../../lib/pages/metadata.ts';
import { ctxFor, optionalPageOr404, optionalPageParams, siteMetadata } from '../../../lib/pages/site-page.ts';
import { waysCopy } from '../../../lib/seo/copy.ts';

export const dynamicParams = false;
export const generateStaticParams = () => optionalPageParams('waysToBook');

export async function generateMetadata({ params }: PageProps<'/[site]/ways-to-book'>): Promise<Metadata> {
  const mounted = await optionalPageOr404((await params).site, 'waysToBook');
  const ctx = ctxFor(mounted);
  const stored = mounted.site;
  return siteMetadata(ctx, waysCopy(ctx), { path: `${ctx.base}/ways-to-book`, image: card(`${stored.slug}-ways-to-book`) });
}

export default async function Page({ params }: PageProps<'/[site]/ways-to-book'>) {
  return <WaysToBookPage ctx={ctxFor(await optionalPageOr404((await params).site, 'waysToBook'))} />;
}
