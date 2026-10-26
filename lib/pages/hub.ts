// Shared loaders for the PepTalk hub pages (the landing page, /terms, /privacy): indexing, the landing URL and metadata.
import type { Metadata } from 'next';
import { content } from '../content/index.ts';
import type { LegalDoc, LegalKind } from '../content/types.ts';
import { landingPath } from '../render/routes.ts';
import { clampDescription } from '../seo/copy.ts';
import { isHubIndexable } from '../seo/indexing.ts';
import { pageMetadata } from './metadata.ts';

/** The hub may be indexed (registry.json `indexable`, after the deployment guards). */
export const hubIndexable = async (): Promise<boolean> => isHubIndexable(await content().getRegistry());

/** The landing page's URL: `/`, or `/all` when registry.json → rootSite makes `/` redirect to a site. */
export const hubLanding = async (): Promise<string> => landingPath((await content().getRegistry()).rootSite);

/** Placeholder legal text (frontmatter `status: placeholder`) is never indexed, even on an indexable site. */
export const legalIndexable = (doc: LegalDoc): boolean => doc.meta.status !== 'placeholder';

export async function hubLegalMetadata(kind: LegalKind): Promise<Metadata> {
  const doc = await content().getLegal(kind);
  return pageMetadata({
    title: `${doc.title} | PepTalk Appearances`,
    description: clampDescription(
      `${doc.title} for PepTalk Appearances, the official sports talent booking platforms operated by PepTalk.`,
    ),
    path: `/${kind}`,
    siteName: 'PepTalk Appearances',
    image: '/og/appearances.jpg',
    indexable: (await hubIndexable()) && legalIndexable(doc),
  });
}
