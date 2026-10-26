// /<slug>/privacy: the shared legal text in the site's layout and branding. Always exists (not an optional page).
import type { Metadata } from 'next';
import { SiteLegalPage } from '../../../components/site/pages.tsx';
import { content } from '../../../lib/content/index.ts';
import { legalIndexable } from '../../../lib/pages/hub.ts';
import { ctxFor, siteMetadata, siteOr404, siteParams } from '../../../lib/pages/site-page.ts';
import { legalCopy } from '../../../lib/seo/copy.ts';

export const dynamicParams = false;
export const generateStaticParams = siteParams;

export async function generateMetadata({ params }: PageProps<'/[site]/privacy'>): Promise<Metadata> {
  const ctx = ctxFor(await siteOr404((await params).site));
  const doc = await content().getLegal('privacy');
  return siteMetadata(ctx, legalCopy(ctx, doc), {
    path: `${ctx.base}/privacy`,
    image: '/og/appearances.jpg',
    indexable: legalIndexable(doc),
  });
}

export default async function Page({ params }: PageProps<'/[site]/privacy'>) {
  return <SiteLegalPage ctx={ctxFor(await siteOr404((await params).site))} doc={await content().getLegal('privacy')} />;
}
