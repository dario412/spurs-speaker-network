// /privacy on the hub: the shared legal text in PepTalk branding (any valid preview password opens it).
import type { Metadata } from 'next';
import { HubLegalPage } from '../../../components/landing.tsx';
import { content } from '../../../lib/content/index.ts';
import { publicOrigin } from '../../../lib/origin.ts';
import { hubIndexable, hubLanding, hubLegalMetadata } from '../../../lib/pages/hub.ts';

export const generateMetadata = (): Promise<Metadata> => hubLegalMetadata('privacy');

export default async function Page() {
  return (
    <HubLegalPage
      doc={await content().getLegal('privacy')}
      origin={publicOrigin()}
      indexable={await hubIndexable()}
      landing={await hubLanding()}
    />
  );
}
