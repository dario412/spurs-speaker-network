// /<slug>/category/<role-slug> (and /category/<role-slug> on the site's domain): every person in one role, as its own
// crawlable page (lib/render/category.ts). Roles nobody holds have no page.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryPage } from '../../../../components/site/pages.tsx';
import { content } from '../../../../lib/content/index.ts';
import { mountSegment } from '../../../../lib/domains.ts';
import { card } from '../../../../lib/pages/metadata.ts';
import { ctxFor, siteMetadata, siteOr404, siteParams } from '../../../../lib/pages/site-page.ts';
import { categoryRoles, peopleIn, roleForSlug, roleSlug } from '../../../../lib/render/category.ts';
import { categoryPath } from '../../../../lib/render/routes.ts';
import { categoryCopy } from '../../../../lib/seo/copy.ts';

export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ site: string; role: string }[]> {
  const sites = await content().listSites();
  return (await siteParams()).flatMap(({ site: segment }) => {
    const site = sites.find(candidate => segment === candidate.slug || segment === mountSegment(candidate.slug));
    return site ? categoryRoles(site).map(role => ({ site: segment, role: roleSlug(role) })) : [];
  });
}

async function load(params: PageProps<'/[site]/category/[role]'>['params']) {
  const { site: segment, role: slug } = await params;
  const mounted = await siteOr404(segment);
  const ctx = ctxFor(mounted);
  const role = roleForSlug(ctx.site, slug);
  if (!role) notFound();
  return { mounted, ctx, role };
}

export async function generateMetadata({ params }: PageProps<'/[site]/category/[role]'>): Promise<Metadata> {
  const { mounted, ctx, role } = await load(params);
  return siteMetadata(ctx, categoryCopy(ctx, role, peopleIn(ctx.site, role)), {
    path: categoryPath(ctx.base, role),
    image: (role.image && mounted.site.images[role.image]) || card(`${mounted.site.slug}-legends`),
    imageAlt: role.image ? `${role.label}, ${ctx.site.orgName}` : undefined,
  });
}

export default async function Page({ params }: PageProps<'/[site]/category/[role]'>) {
  const { ctx, role } = await load(params);
  return <CategoryPage ctx={ctx} role={role} />;
}
