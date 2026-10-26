// /<slug>: the site's home page (a look-only demo when site.json sets demoHome).
import type { Metadata } from 'next';
import { HomePage } from '../../components/site/home.tsx';
import { card } from '../../lib/pages/metadata.ts';
import { ctxFor, siteMetadata, siteOr404, siteParams } from '../../lib/pages/site-page.ts';
import { homeCopy } from '../../lib/seo/copy.ts';

export const dynamicParams = false;
export const generateStaticParams = siteParams;

export async function generateMetadata({ params }: PageProps<'/[site]'>): Promise<Metadata> {
  const mounted = await siteOr404((await params).site);
  const ctx = ctxFor(mounted);
  const stored = mounted.site;
  return siteMetadata(ctx, homeCopy(ctx), { path: ctx.base, image: card(stored.slug), ogTitle: ctx.site.platform });
}

export default async function Page({ params }: PageProps<'/[site]'>) {
  const mounted = await siteOr404((await params).site);
  return <HomePage ctx={ctxFor(mounted, mounted.site.demoHome === true)} />;
}
