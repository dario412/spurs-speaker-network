// Runs the provider conformance suite against every provider this repository ships: the JSON provider (the real
// content, and a copy plus the fictional test sites (test/fixtures/sites.mjs) with switches flipped and domains set), the in-memory provider fed from schema/examples (so the
// suite is not tied to the files on disk), the same through the tagged cache layer, and the in-memory content with
// Airtable people from the fixture export (mocked fetch).
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before } from 'node:test';
import { loadAirtableConfig } from '../../lib/content/airtable/config.ts';
import { createAirtablePeopleProvider } from '../../lib/content/airtable-provider.ts';
import { passThrough, withCacheTags } from '../../lib/content/cached.ts';
import { createJsonProvider } from '../../lib/content/json-provider.ts';
import { createMemoryProvider, type MemoryContent } from '../../lib/content/memory-provider.ts';
import { withPeople } from '../../lib/content/select.ts';
import { airtableError, fixtureJson, mockAirtable, TOKEN } from '../fixtures/airtable/mock.ts';
import { writeSitesDir } from '../fixtures/sites.mjs';
import { providerConformance } from './provider-conformance.ts';

const example = async (name: string) => JSON.parse(await readFile(join('schema', 'examples', name), 'utf8'));
/** The example registry's per-site domains: every provider fed from the examples must return them unchanged. */
const EXAMPLE_DOMAINS = JSON.parse(readFileSync(join('schema', 'examples', 'registry.json'), 'utf8')).domains;
/** Domains written into the switched copy of the content, so the JSON provider is checked with domains too. */
const FLIPPED_DOMAINS = { spurs: { primary: 'spurslegends.example', aliases: ['www.spurslegends.example'], live: true } };

async function exampleContent(): Promise<MemoryContent> {
  const [registry, populated, shell, terms, privacy] = await Promise.all(
    ['registry.json', 'site-populated.json', 'site-shell.json', 'legal-terms.json', 'legal-privacy.json'].map(example),
  );
  // A third, inactive site: a copy of the shell site switched off.
  const inactive = { ...shell, slug: 'westford', active: false, orgName: 'Westford Athletic' };
  return {
    registry: { ...registry, order: [...registry.order, 'westford'] },
    sites: [populated, shell, inactive],
    legal: { terms, privacy },
  };
}

providerConformance('JSON provider (src/sites)', {
  provider: () => createJsonProvider({ cache: false }),
  failing: () => createJsonProvider({ sitesDir: join(tmpdir(), 'no-such-sites-dir'), legalDir: join(tmpdir(), 'no-such-legal-dir') }),
});

let dir = '';
before(async () => {
  dir = writeSitesDir();
  const registry = JSON.parse(await readFile(join(dir, 'registry.json'), 'utf8'));
  const [first, second] = registry.order as string[];
  await writeFile(join(dir, 'registry.json'), JSON.stringify({ ...registry, domains: FLIPPED_DOMAINS }));
  const site = JSON.parse(await readFile(join(dir, first, 'site.json'), 'utf8'));
  await writeFile(join(dir, first, 'site.json'), JSON.stringify({ ...site, pages: { hospitality: false } }));
  const people = JSON.parse(await readFile(join(dir, first, 'people.json'), 'utf8'));
  people.find((person: { slug: string }) => person.slug === 'steffen-freund').active = false;
  await writeFile(join(dir, first, 'people.json'), JSON.stringify(people));
  const other = JSON.parse(await readFile(join(dir, second, 'site.json'), 'utf8'));
  await writeFile(join(dir, second, 'site.json'), JSON.stringify({ ...other, active: false }));
});

providerConformance('JSON provider (switches flipped)', {
  provider: () => createJsonProvider({ sitesDir: dir, cache: false }),
  expect: {
    inactiveSites: ['northbridge'],
    hiddenPeople: [['spurs', 'steffen-freund']],
    pagesOff: [['spurs', 'hospitality']],
    domains: FLIPPED_DOMAINS,
  },
});

providerConformance('in-memory provider (schema/examples)', {
  provider: async () => createMemoryProvider(await exampleContent()),
  failing: async () => {
    const content = await exampleContent();
    // The registry names a site the source doesn't have: construction fails with a ContentError.
    return createMemoryProvider({ ...content, registry: { ...content.registry, order: [...content.registry.order, 'ghost'] } });
  },
  expect: {
    inactiveSites: ['westford'],
    hiddenPeople: [['northbridge', 'tom-rees']],
    pagesOff: [['eastvale', 'hospitality']],
    domains: EXAMPLE_DOMAINS,
  },
});

// What the app reads: any provider through the tagged cache layer (lib/content/cached.ts), whose composed site lists
// and registry must be indistinguishable from the provider's own.
providerConformance('in-memory provider through the tagged cache layer (cached.ts)', {
  provider: async () => withCacheTags(createMemoryProvider(await exampleContent()), passThrough),
  failing: async () => {
    const content = await exampleContent();
    return withCacheTags(
      createMemoryProvider({ ...content, registry: { ...content.registry, order: [...content.registry.order, 'ghost'] } }),
      passThrough,
    );
  },
  expect: {
    inactiveSites: ['westford'],
    hiddenPeople: [['northbridge', 'tom-rees']],
    pagesOff: [['eastvale', 'hospitality']],
    domains: EXAMPLE_DOMAINS,
  },
});

const airtableConfig = () => {
  const config = loadAirtableConfig(fixtureJson('config.json'));
  return { ...config, sites: { ...config.sites, values: { northbridge: config.sites.values.northbridge } } };
};
const quiet = () => {};
const noWait = async () => {};

providerConformance('in-memory content + Airtable people (fixture export, mocked fetch)', {
  provider: async () =>
    withPeople(
      createMemoryProvider(await exampleContent()),
      createAirtablePeopleProvider(airtableConfig(), { token: TOKEN, fetch: mockAirtable().fetch, log: quiet, sleep: noWait }),
    ),
  failing: async () => {
    const replies = Array.from({ length: 20 }, () =>
      airtableError(401, { type: 'AUTHENTICATION_REQUIRED', message: 'Authentication required' }),
    );
    return withPeople(
      createMemoryProvider(await exampleContent()),
      createAirtablePeopleProvider(airtableConfig(), { token: TOKEN, fetch: mockAirtable(replies).fetch, log: quiet, sleep: noWait }),
    );
  },
  expect: { inactiveSites: ['westford'], pagesOff: [['eastvale', 'hospitality']], domains: EXAMPLE_DOMAINS },
});
