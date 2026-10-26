// A provider with one defect per conformance check, run by conformance-teeth.test.ts in a child process: the suite must
// fail every check. Not a *.test.ts file, so `npm test` never runs it directly.
import { readFileSync } from 'node:fs';
import { createMemoryProvider } from '../../../lib/content/memory-provider.ts';
import type { ContentProvider } from '../../../lib/content/provider.ts';
import type { Site } from '../../../lib/content/types.ts';
import { providerConformance } from '../provider-conformance.ts';

const example = (name: string) => JSON.parse(readFileSync(new URL(`../../../schema/examples/${name}`, import.meta.url), 'utf8'));
const good = createMemoryProvider({
  registry: example('registry.json'),
  sites: [example('site-populated.json'), example('site-shell.json')],
  legal: { terms: example('legal-terms.json'), privacy: example('legal-privacy.json') },
});

let calls = 0;
const broken: ContentProvider = {
  ...good,
  // shapes: an unknown registry field; domains: registry.domains dropped
  getRegistry: async () => {
    const { domains: _domains, ...registry } = await good.getRegistry();
    return { ...registry, extra: true } as never;
  },
  // switches: hidden people leak into the published site; ordering: the list flips on every other call
  listSites: async () => {
    const raws = await good.listRawSites();
    const sites = raws.map(({ licences: _l, verification: _v, ...site }) => site as Site);
    calls += 1;
    return calls % 2 ? sites : sites.reverse();
  },
  // slugs: a malformed slug still returns a site
  getSite: async slug => (slug === 'Spurs' ? ((await good.listSites())[0] ?? null) : good.getSite(slug)),
  // images: a person references an image id that isn't in images
  getRawSite: async slug => {
    const raw = await good.getRawSite(slug);
    return raw && raw.slug === 'northbridge'
      ? { ...raw, people: raw.people.map((p, i) => (i === 0 ? { ...p, card: 'missing-id' } : p)) }
      : raw;
  },
  listRawSites: async () =>
    (await Promise.all((await good.getRegistry()).order.map(slug => broken.getRawSite(slug)))).filter(s => s !== null),
  // legal: an empty body
  getLegal: async kind => ({ ...(await good.getLegal(kind)), body: '' }),
};

providerConformance('deliberately broken provider', {
  provider: () => broken,
  // errors: a broken source throws a raw TypeError instead of a ContentError
  failing: () => ({
    ...good,
    getRegistry: () => Promise.reject(new TypeError('fetch failed')),
    listSites: () => Promise.reject(new TypeError('fetch failed')),
  }),
  expect: { domains: example('registry.json').domains },
});
