// /<slug>/legends: the roster with role, era and search filters (held in the URL).
import type { Metadata } from 'next';
import { LegendsPage } from '../../../components/site/pages.tsx';
import { card } from '../../../lib/pages/metadata.ts';
import { ctxFor, siteMetadata, siteOr404, siteParams } from '../../../lib/pages/site-page.ts';
import { legendsCopy } from '../../../lib/seo/copy.ts';

export const dynamicParams = false;
export const generateStaticParams = siteParams;

export async function generateMetadata({ params }: PageProps<'/[site]/legends'>): Promise<Metadata> {
  const mounted = await siteOr404((await params).site);
  const ctx = ctxFor(mounted);
  const stored = mounted.site;
  return siteMetadata(ctx, legendsCopy(ctx), { path: `${ctx.base}/legends`, image: card(`${stored.slug}-legends`) });
}

export default async function Page({ params }: PageProps<'/[site]/legends'>) {
  return <LegendsPage ctx={ctxFor(await siteOr404((await params).site))} />;
}
