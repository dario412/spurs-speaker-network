// /<slug>/legends/<person> (and /legends/<person> on the site's domain): a profile (hidden people 404; demoProfiles render look-only).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProfilePage } from '../../../../components/site/pages.tsx';
import { content } from '../../../../lib/content/index.ts';
import { mountSegment } from '../../../../lib/domains.ts';
import { card } from '../../../../lib/pages/metadata.ts';
import { ctxFor, siteMetadata, siteOr404, siteParams } from '../../../../lib/pages/site-page.ts';
import { personAlt } from '../../../../lib/render/alt.ts';
import { profileCopy } from '../../../../lib/seo/copy.ts';

export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ site: string; person: string }[]> {
  const sites = await content().listSites();
  const people = new Map(sites.map(site => [site.slug, site.people]));
  return (await siteParams()).flatMap(({ site: segment }) => {
    const slug = sites.find(site => segment === site.slug || segment === mountSegment(site.slug))?.slug ?? '';
    return (people.get(slug) ?? []).map(person => ({ site: segment, person: person.slug }));
  });
}

async function load(params: PageProps<'/[site]/legends/[person]'>['params']) {
  const { site: segment, person: personSlug } = await params;
  const mounted = await siteOr404(segment);
  const stored = mounted.site;
  if (!stored.people.some(person => person.slug === personSlug)) notFound();
  const demo = stored.demoProfiles?.includes(personSlug) === true;
  const ctx = ctxFor(mounted, demo);
  return { stored, ctx, person: ctx.bySlug[personSlug], demo };
}

export async function generateMetadata({ params }: PageProps<'/[site]/legends/[person]'>): Promise<Metadata> {
  const { stored, ctx, person, demo } = await load(params);
  return siteMetadata(ctx, profileCopy(ctx, person), {
    path: `${ctx.base}/legends/${person.slug}`,
    type: 'profile',
    image: (person.hero && stored.images[person.hero]) || card(stored.slug),
    imageAlt: personAlt(person),
    ogTitle: `Book ${person.name} | ${ctx.site.platform}`,
    // Look-only demo pages are never indexed (the validator also refuses demo pages on an indexable site).
    indexable: !demo,
  });
}

export default async function Page({ params }: PageProps<'/[site]/legends/[person]'>) {
  const { ctx, person } = await load(params);
  return <ProfilePage ctx={ctx} person={person} />;
}
